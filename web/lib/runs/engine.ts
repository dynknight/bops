import { LIMITS, FatalRunError, withRetries } from "../limits";
import { resolveModel, type ProviderEnv } from "../models/providers";
import { classifyToolCall } from "../tools/classify";
import { hashFor } from "./actions";
import { systemPrompt } from "./prompt";
import type { RunStore } from "./store";
import type { AgentRecord, Completion, RunRecord, Tick, ToolCall } from "./types";

export type EngineDeps = {
  now: () => Date;
  env: ProviderEnv & { COMPOSIO_API_KEY?: string; ZERNIO_API_KEY?: string };
  complete: (input: {
    provider: string;
    modelId: string;
    system: string;
    messages: Awaited<ReturnType<RunStore["listMessages"]>>;
    agent: AgentRecord;
  }) => Promise<Completion>;
  executeRead: (call: ToolCall) => Promise<unknown>;
  executeApproved: (approvalId: string) => Promise<unknown>;
};

function toolEnv(env: EngineDeps["env"]) {
  return {
    composio: Boolean(env.COMPOSIO_API_KEY?.trim()),
    zernio: Boolean(env.ZERNIO_API_KEY?.trim()),
  };
}

async function fail(store: RunStore, run: RunRecord, error: string): Promise<Tick> {
  await store.saveRun({ ...run, status: "failed", error, progress: "Stopped" });
  return { state: "failed", error };
}

export async function advanceRun(store: RunStore, runId: string, deps: EngineDeps): Promise<Tick> {
  const run = await store.getRun(runId);
  if (!run) throw new FatalRunError("Run not found.");
  if (run.cancelRequested || run.status === "cancelled") {
    await store.saveRun({ ...run, status: "cancelled", progress: "Cancelled" });
    return { state: "cancelled" };
  }
  if (run.status === "succeeded") return { state: "succeeded" };
  if (run.status === "failed") return { state: "failed", error: run.error ?? "Stopped" };
  if (run.status === "waiting_approval") return settleApproval(store, run, deps);
  if (run.status === "waiting_child") return settleChild(store, run);
  if (run.stepCount >= LIMITS.maxSteps) return fail(store, run, "Step limit reached.");
  if (run.tokenCount >= LIMITS.maxTokens) return fail(store, run, "Token limit reached.");

  const agent = await store.getAgent(run.agentId);
  if (!agent) return fail(store, run, "The agent is missing.");
  const choice = agent.models[run.useCase];
  const resolved = resolveModel(choice.provider, choice.modelId, deps.env);
  if (!resolved.ok) return fail(store, run, resolved.error);

  const specialists = agent.isChief ? await store.listSpecialists(run.ownerId, agent.id) : [];
  const messages = await store.listMessages(run.threadId);
  let completion: Completion;
  let retries = run.retryCount;
  try {
    completion = await withRetries(
      () =>
        deps.complete({
          provider: resolved.model.provider,
          modelId: resolved.model.modelId,
          system: systemPrompt(agent, specialists),
          messages,
          agent,
        }),
      LIMITS.maxRetries,
      async (attempt) => {
        retries = attempt;
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The model call failed.";
    await store.saveRun({ ...run, retryCount: retries, status: "failed", error: message, progress: "Stopped" });
    return { state: "failed", error: message };
  }

  const stepped: RunRecord = {
    ...run,
    status: "running",
    retryCount: retries,
    stepCount: run.stepCount + 1,
    tokenCount: run.tokenCount + completion.inputTokens + completion.outputTokens,
    progress: "Thinking",
  };
  let usageError: string | null = null;
  try {
    await store.addUsage({
      ownerId: run.ownerId,
      runId: run.id,
      provider: completion.provider,
      model: completion.model,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
    });
  } catch (error) {
    usageError = error instanceof Error ? error.message : "Usage was not recorded.";
  }
  await store.addStep({
    runId: run.id,
    idx: stepped.stepCount,
    kind: "model",
    name: `${completion.provider}/${completion.model}`,
    status: usageError ? "usage_failed" : "succeeded",
    output: { text: completion.text, toolCalls: completion.toolCalls.map((call) => call.name), usageError },
  });

  if (stepped.tokenCount >= LIMITS.maxTokens) return fail(store, stepped, "Token limit reached.");
  const call = completion.toolCalls[0];
  if (!call) {
    await store.addMessage({
      id: crypto.randomUUID(),
      threadId: run.threadId,
      runId: run.id,
      role: "assistant",
      content: completion.text,
    });
    await store.saveRun({ ...stepped, status: "succeeded", progress: "Done" });
    return { state: "succeeded" };
  }

  await store.addMessage({
    id: crypto.randomUUID(),
    threadId: run.threadId,
    runId: run.id,
    role: "assistant",
    content: completion.text,
    toolCallId: call.id,
    toolName: call.name,
    toolArgs: call.input,
  });

  const classified = classifyToolCall(call.name, call.input, toolEnv(deps.env));
  if (classified.kind === "reject") {
    await writeTool(store, stepped, call, classified.reason ?? "That tool is not available.");
    await store.saveRun(stepped);
    return { state: "running" };
  }
  if (classified.kind === "delegate") {
    return delegate(store, stepped, agent, call);
  }
  if (classified.kind === "read") {
    if (stepped.stepCount >= LIMITS.maxSteps) return fail(store, stepped, "Step limit reached.");
    try {
      const output = await deps.executeRead(call);
      await writeTool(store, stepped, call, JSON.stringify(output));
      const next = { ...stepped, stepCount: stepped.stepCount + 1, progress: `Read ${call.name}` };
      await store.addStep({ runId: run.id, idx: next.stepCount, kind: "tool", name: call.name, status: "succeeded", input: call.input, output });
      await store.saveRun(next);
      return { state: "running" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The read failed.";
      await writeTool(store, stepped, call, message);
      await store.saveRun({ ...stepped, progress: "Read failed" });
      return { state: "running" };
    }
  }

  const built = hashFor(call);
  const approval = await store.createApproval({
    ownerId: run.ownerId,
    runId: run.id,
    agentId: run.agentId,
    toolCallId: call.id,
    toolName: call.name,
    action: built.action,
    args: built.args,
    exactContent: built.exactContent,
    contentHash: built.hash,
    hookToken: "",
    expiresAt: new Date(deps.now().getTime() + LIMITS.approvalTtlMs).toISOString(),
  });
  approval.hookToken = `bops-approval:${approval.id}`;
  await store.saveApproval(approval);
  await store.addStep({
    runId: run.id,
    idx: stepped.stepCount,
    kind: "approval",
    name: call.name,
    status: "pending",
    input: { hash: built.hash, action: built.action },
  });
  await store.saveRun({ ...stepped, status: "waiting_approval", progress: "Waiting for your approval" });
  return { state: "waiting_approval", approvalId: approval.id, hookToken: approval.hookToken };
}

async function delegate(store: RunStore, run: RunRecord, agent: AgentRecord, call: ToolCall): Promise<Tick> {
  if (!agent.isChief) {
    await writeTool(store, run, call, "Only the chief of staff can delegate.");
    await store.saveRun(run);
    return { state: "running" };
  }
  if (run.delegationCount >= LIMITS.maxDelegations) {
    await writeTool(store, run, call, "Delegation limit reached.");
    await store.saveRun(run);
    return { state: "running" };
  }
  const input = call.input && typeof call.input === "object" ? (call.input as { slug?: unknown; task?: unknown }) : {};
  const slug = typeof input.slug === "string" ? input.slug : "";
  const task = typeof input.task === "string" ? input.task.trim() : "";
  const specialist = slug ? await store.findAgentBySlug(run.ownerId, slug) : null;
  if (!specialist || specialist.reportsTo !== agent.id || !task) {
    await writeTool(store, run, call, "Name a specialist who reports to you, and the task.");
    await store.saveRun(run);
    return { state: "running" };
  }
  const child = await store.createChildRun({
    ownerId: run.ownerId,
    agentId: specialist.id,
    parentRunId: run.id,
    goal: task,
    title: task.slice(0, 80),
  });
  await store.saveRun({
    ...run,
    status: "waiting_child",
    childRunId: child.id,
    delegationCount: run.delegationCount + 1,
    progress: `Delegated to ${specialist.name}`,
  });
  return { state: "delegate", childRunId: child.id };
}

async function settleChild(store: RunStore, run: RunRecord): Promise<Tick> {
  if (!run.childRunId) return fail(store, run, "The delegated run is missing.");
  const child = await store.getRun(run.childRunId);
  if (!child) return fail(store, run, "The delegated run is missing.");
  if (child.status === "queued" || child.status === "running" || child.status === "waiting_approval" || child.status === "waiting_child") {
    return { state: "delegate", childRunId: child.id };
  }
  const messages = await store.listMessages(child.threadId);
  const last = [...messages].reverse().find((item) => item.role === "assistant" && !item.toolCallId);
  const summary = child.status === "succeeded" ? (last?.content ?? "Finished.") : (child.error ?? `The specialist ${child.status}.`);
  const parentMessages = await store.listMessages(run.threadId);
  const call = [...parentMessages].reverse().find((item) => item.role === "assistant" && item.toolName === "delegate" && item.toolCallId);
  if (call?.toolCallId && !(await store.hasToolResult(run.threadId, call.toolCallId))) {
    await store.addMessage({
      id: crypto.randomUUID(),
      threadId: run.threadId,
      runId: run.id,
      role: "tool",
      content: summary,
      toolCallId: call.toolCallId,
      toolName: "delegate",
    });
  }
  await store.saveRun({ ...run, status: "running", progress: "Specialist reported back" });
  return { state: "running" };
}

async function settleApproval(store: RunStore, run: RunRecord, deps: EngineDeps): Promise<Tick> {
  const approval = await store.getApprovalForRun(run.id);
  if (!approval) return fail(store, run, "The approval is missing.");
  if (approval.status === "pending") {
    if (new Date(approval.expiresAt).getTime() <= deps.now().getTime()) {
      approval.status = "expired";
      await store.saveApproval(approval);
      await writeTool(store, run, { id: approval.toolCallId, name: approval.toolName, input: approval.args }, "The approval expired. The action was not taken.");
      await store.saveRun({ ...run, status: "running", progress: "Approval expired" });
      return { state: "running" };
    }
    return { state: "waiting_approval", approvalId: approval.id, hookToken: approval.hookToken };
  }
  if (approval.status === "denied" || approval.status === "expired") {
    if (!(await store.hasToolResult(run.threadId, approval.toolCallId))) {
      const note = approval.decisionNote ? ` Note: ${approval.decisionNote}` : "";
      const text = approval.status === "denied" ? `The owner denied this action.${note}` : "The approval expired. The action was not taken.";
      await writeTool(store, run, { id: approval.toolCallId, name: approval.toolName, input: approval.args }, text);
    }
    await store.saveRun({ ...run, status: "running", progress: approval.status === "denied" ? "Denied" : "Approval expired" });
    return { state: "running" };
  }
  if (approval.status === "approved" || approval.status === "executing" || approval.status === "consumed") {
    const consumed = await store.consume(approval, () => deps.executeApproved(approval.id), deps.now());
    Object.assign(approval, consumed.approval);
    if (!(await store.hasToolResult(run.threadId, approval.toolCallId))) {
      await writeTool(
        store,
        run,
        { id: approval.toolCallId, name: approval.toolName, input: approval.args },
        JSON.stringify(consumed.output ?? { note: "The action was started and will not be repeated." }),
      );
    }
    const next = {
      ...run,
      status: "running" as const,
      stepCount: consumed.replay ? run.stepCount : run.stepCount + 1,
      progress: "Approved action finished",
    };
    if (!consumed.replay) {
      await store.addStep({ runId: run.id, idx: next.stepCount, kind: "tool", name: approval.toolName, status: "consumed", output: consumed.output });
    }
    await store.saveRun(next);
    return { state: "running" };
  }
  await store.saveRun({ ...run, status: "running", progress: "Approval closed" });
  return { state: "running" };
}

async function writeTool(store: RunStore, run: RunRecord, call: ToolCall, content: string) {
  if (await store.hasToolResult(run.threadId, call.id)) return;
  await store.addMessage({
    id: crypto.randomUUID(),
    threadId: run.threadId,
    runId: run.id,
    role: "tool",
    content,
    toolCallId: call.id,
    toolName: call.name,
  });
}

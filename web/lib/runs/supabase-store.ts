import "server-only";
import { beginConsume, finishConsume } from "../approvals/machine";
import { createAdminClient } from "../supabase/admin";
import type { UseCase } from "../models/providers";
import type { RunStore, ChildRunInput } from "./store";
import type { AgentRecord, ApprovalRecord, RunRecord, StepRecord, StoredMessage, UsageRecord } from "./types";

type ModelRow = { use_case: UseCase; provider: string; model_id: string };
type AgentRow = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  role: string;
  persona: string;
  is_chief: boolean;
  reports_to: string | null;
  agent_models?: ModelRow[];
};

const defaultModel = { provider: "google", modelId: "gemini-2.5-flash" };

function mapAgent(row: AgentRow): AgentRecord {
  const models = {
    chat: { ...defaultModel },
    tools: { ...defaultModel },
    routine: { ...defaultModel },
  };
  for (const model of row.agent_models ?? []) {
    models[model.use_case] = { provider: model.provider, modelId: model.model_id };
  }
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    persona: row.persona,
    isChief: row.is_chief,
    reportsTo: row.reports_to,
    models,
  };
}

function mapRun(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    threadId: String(row.thread_id),
    agentId: String(row.agent_id),
    parentRunId: (row.parent_run_id as string | null) ?? null,
    childRunId: (row.child_run_id as string | null) ?? null,
    routineId: (row.routine_id as string | null) ?? null,
    status: row.status as RunRecord["status"],
    useCase: row.use_case as UseCase,
    goal: String(row.goal ?? ""),
    progress: String(row.progress ?? ""),
    error: (row.error as string | null) ?? null,
    stepCount: Number(row.step_count ?? 0),
    tokenCount: Number(row.token_count ?? 0),
    delegationCount: Number(row.delegation_count ?? 0),
    retryCount: Number(row.retry_count ?? 0),
    cancelRequested: Boolean(row.cancel_requested),
  };
}

function mapMessage(row: Record<string, unknown>): StoredMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    runId: (row.run_id as string | null) ?? null,
    role: row.role as StoredMessage["role"],
    content: String(row.content ?? ""),
    toolCallId: (row.tool_call_id as string | null) ?? null,
    toolName: (row.tool_name as string | null) ?? null,
    toolArgs: row.tool_args,
  };
}

function mapApproval(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    runId: String(row.run_id),
    agentId: String(row.agent_id),
    toolCallId: String(row.tool_call_id),
    toolName: String(row.tool_name),
    action: String(row.action),
    args: row.args,
    exactContent: (row.exact_content as string | null) ?? null,
    contentHash: String(row.content_hash),
    hookToken: String(row.hook_token ?? ""),
    expiresAt: String(row.expires_at),
    status: row.status as ApprovalRecord["status"],
    decision: (row.decision as ApprovalRecord["decision"]) ?? null,
    decisionKey: (row.decision_key as string | null) ?? null,
    decisionNote: (row.decision_note as string | null) ?? null,
    output: row.output ?? null,
    hookReady: Boolean(row.hook_ready),
    consumedAt: (row.consumed_at as string | null) ?? null,
  };
}

export function createSupabaseStore(): RunStore {
  const admin = createAdminClient();
  return {
    async getRun(id) {
      const { data, error } = await admin.from("runs").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapRun(data) : null;
    },
    async saveRun(run) {
      const { error } = await admin
        .from("runs")
        .update({
          status: run.status,
          progress: run.progress,
          error: run.error,
          step_count: run.stepCount,
          token_count: run.tokenCount,
          delegation_count: run.delegationCount,
          retry_count: run.retryCount,
          cancel_requested: run.cancelRequested,
          child_run_id: run.childRunId,
          updated_at: new Date().toISOString(),
          finished_at: run.status === "succeeded" || run.status === "failed" || run.status === "cancelled" ? new Date().toISOString() : null,
        })
        .eq("id", run.id);
      if (error) throw new Error(error.message);
    },
    async addStep(step: StepRecord) {
      const run = await admin.from("runs").select("owner_id").eq("id", step.runId).single();
      if (run.error) throw new Error(run.error.message);
      const { error } = await admin.from("run_steps").insert({
        owner_id: run.data.owner_id,
        run_id: step.runId,
        idx: step.idx,
        kind: step.kind,
        name: step.name,
        status: step.status,
        input: step.input ?? null,
        output: step.output ?? null,
      });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    },
    async addMessage(message) {
      const thread = await admin.from("threads").select("owner_id").eq("id", message.threadId).single();
      if (thread.error) throw new Error(thread.error.message);
      const { error } = await admin.from("messages").insert({
        id: message.id,
        owner_id: thread.data.owner_id,
        thread_id: message.threadId,
        run_id: message.runId,
        role: message.role,
        content: message.content,
        tool_call_id: message.toolCallId ?? null,
        tool_name: message.toolName ?? null,
        tool_args: message.toolArgs ?? null,
      });
      if (error) throw new Error(error.message);
    },
    async listMessages(threadId) {
      const { data, error } = await admin.from("messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapMessage(row));
    },
    async getAgent(id) {
      const { data, error } = await admin.from("agents").select("*, agent_models(*)").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapAgent(data as AgentRow) : null;
    },
    async listSpecialists(ownerId, chiefId) {
      const { data, error } = await admin.from("agents").select("*, agent_models(*)").eq("owner_id", ownerId).eq("reports_to", chiefId);
      if (error) throw new Error(error.message);
      return ((data ?? []) as AgentRow[]).map(mapAgent);
    },
    async findAgentBySlug(ownerId, slug) {
      const { data, error } = await admin.from("agents").select("*, agent_models(*)").eq("owner_id", ownerId).eq("slug", slug).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapAgent(data as AgentRow) : null;
    },
    async createApproval(draft) {
      const id = crypto.randomUUID();
      const hookToken = `bops-approval:${id}`;
      const { data, error } = await admin
        .from("approvals")
        .insert({
          id,
          owner_id: draft.ownerId,
          run_id: draft.runId,
          agent_id: draft.agentId,
          tool_call_id: draft.toolCallId,
          tool_name: draft.toolName,
          action: draft.action,
          exact_content: draft.exactContent,
          args: draft.args,
          content_hash: draft.contentHash,
          status: "pending",
          hook_token: hookToken,
          expires_at: draft.expiresAt,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapApproval(data);
    },
    async getApprovalForRun(runId) {
      const { data, error } = await admin.from("approvals").select("*").eq("run_id", runId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapApproval(data) : null;
    },
    async saveApproval(approval) {
      const status = approval.status === "expired" ? "expired" : "pending";
      const { error } = await admin.rpc("touch_approval", {
        p_id: approval.id,
        p_status: status,
        p_hook_token: approval.hookToken,
        p_hook_ready: approval.hookReady,
        p_now: new Date().toISOString(),
      });
      if (error && !error.message.includes("not found")) throw new Error(error.message);
    },
    async consume(approval, exec, now) {
      const begun = await admin.rpc("begin_consume", {
        p_id: approval.id,
        p_hash: approval.contentHash,
        p_now: now.toISOString(),
      });
      if (begun.error) {
        return { output: { error: begun.error.message }, approval, replay: true };
      }
      const body = begun.data as { action?: string; output?: unknown; inFlight?: boolean; error?: string };
      if (body.action === "replay") {
        return {
          output: body.output ?? { note: "The action was started and will not be repeated." },
          approval: { ...approval, status: body.inFlight ? "executing" : "consumed", output: body.output ?? null },
          replay: true,
        };
      }
      if (body.action !== "execute") {
        return {
          output: { error: body.error ?? "The action was not approved." },
          approval: { ...approval, status: body.error === "expired" ? "expired" : approval.status },
          replay: true,
        };
      }
      let output: unknown;
      try {
        output = await exec();
      } catch (error) {
        output = { error: error instanceof Error ? error.message : "The action failed." };
      }
      const finished = await admin.rpc("finish_consume", {
        p_id: approval.id,
        p_output: output,
        p_now: now.toISOString(),
      });
      if (finished.error) {
        return { output: { error: finished.error.message }, approval: { ...approval, status: "executing", output }, replay: true };
      }
      return {
        output,
        approval: { ...approval, status: "consumed", output, consumedAt: now.toISOString() },
        replay: false,
      };
    },
    async addUsage(usage: UsageRecord) {
      const { error } = await admin.from("usage_events").insert({
        owner_id: usage.ownerId,
        run_id: usage.runId,
        provider: usage.provider,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });
      if (error) throw new Error(error.message);
    },
    async createChildRun(input: ChildRunInput) {
      const thread = await admin
        .from("threads")
        .insert({ owner_id: input.ownerId, agent_id: input.agentId, title: input.title })
        .select("id")
        .single();
      if (thread.error) throw new Error(thread.error.message);
      const message = await admin.from("messages").insert({
        owner_id: input.ownerId,
        thread_id: thread.data.id,
        role: "user",
        content: input.goal,
      });
      if (message.error) throw new Error(message.error.message);
      const run = await admin
        .from("runs")
        .insert({
          owner_id: input.ownerId,
          thread_id: thread.data.id,
          agent_id: input.agentId,
          parent_run_id: input.parentRunId,
          status: "queued",
          use_case: "tools",
          goal: input.goal,
          progress: "Queued",
        })
        .select("*")
        .single();
      if (run.error) throw new Error(run.error.message);
      return mapRun(run.data);
    },
    async hasToolResult(threadId, toolCallId) {
      const { data, error } = await admin.from("messages").select("id").eq("thread_id", threadId).eq("role", "tool").eq("tool_call_id", toolCallId).limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

/** Used by unit tests that want the same consume rules without Postgres. */
export function consumeWithMachine(approval: ApprovalRecord, exec: () => Promise<unknown>, now: Date) {
  const begun = beginConsume(
    {
      id: approval.id,
      ownerId: approval.ownerId,
      status: approval.status,
      decision: approval.decision,
      decisionKey: approval.decisionKey,
      decisionNote: approval.decisionNote,
      contentHash: approval.contentHash,
      output: approval.output,
      expiresAt: approval.expiresAt,
      consumedAt: approval.consumedAt,
    },
    { hash: approval.contentHash, now },
  );
  if (begun.action !== "execute") {
    return Promise.resolve({
      output: begun.action === "replay" ? begun.output : { error: begun.error },
      approval: { ...approval, status: begun.row.status, output: begun.action === "replay" ? begun.output : approval.output },
      replay: true,
    });
  }
  return exec()
    .catch((error: unknown) => ({ error: error instanceof Error ? error.message : "The action failed." }))
    .then((output) => {
      const finished = finishConsume({ ...begun.row, status: "executing" }, output, now);
      return {
        output,
        approval: { ...approval, status: finished.status, output: finished.output, consumedAt: finished.consumedAt },
        replay: false,
      };
    });
}

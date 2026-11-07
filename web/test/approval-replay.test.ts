import assert from "node:assert/strict";
import { test } from "node:test";
import { contentHash } from "../lib/approvals/hash";
import { beginConsume, decideApproval, finishConsume, type ApprovalRow } from "../lib/approvals/machine";
import { advanceRun } from "../lib/runs/engine";
import type { RunStore } from "../lib/runs/store";
import type { AgentRecord, ApprovalRecord, RunRecord, StoredMessage } from "../lib/runs/types";

const NOW = new Date("2026-11-07T18:00:00.000Z");
const LATER = new Date("2026-11-07T20:00:00.000Z");

function row(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  const payload = { tool: "zernio_post", action: "Publish this exact post", args: { content: "Hello" }, exactContent: "Hello" };
  return {
    id: "apr-1",
    ownerId: "owner-1",
    status: "pending",
    decision: null,
    decisionKey: null,
    decisionNote: null,
    contentHash: contentHash(payload),
    output: null,
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

const owner = { type: "owner" as const, id: "owner-1", login: "dynknight" };

test("the model cannot approve, and a second owner decision replays", () => {
  const pending = row();
  const refused = decideApproval(pending, {
    actor: { type: "model" },
    decision: "approved",
    hash: pending.contentHash,
    idempotencyKey: "k1",
    now: NOW,
  });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error, "not_allowed");
  assert.equal(refused.row.status, "pending");

  const first = decideApproval(pending, { actor: owner, decision: "approved", hash: pending.contentHash, idempotencyKey: "k1", now: NOW });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.replay, false);
  const again = decideApproval(first.row, { actor: owner, decision: "approved", hash: pending.contentHash, idempotencyKey: "k1", now: NOW });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.replay, true);
  assert.equal(again.row.status, "approved");

  const conflict = decideApproval(first.row, { actor: owner, decision: "denied", hash: pending.contentHash, idempotencyKey: "k2", now: NOW });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error, "conflict");
});

test("a mismatched hash and an expired approval do not change a pending row into approved", () => {
  const pending = row();
  const mismatch = decideApproval(pending, { actor: owner, decision: "approved", hash: "nope", idempotencyKey: "k1", now: NOW });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error, "hash_mismatch");
  assert.equal(mismatch.row.status, "pending");

  const expired = decideApproval(pending, { actor: owner, decision: "approved", hash: pending.contentHash, idempotencyKey: "k1", now: LATER });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.error, "expired");
  assert.equal(expired.row.status, "expired");
});

test("consuming an approval executes once and replays the stored output", () => {
  const approved = row({ status: "approved", decision: "approved", decisionKey: "k1" });
  const first = beginConsume(approved, { hash: approved.contentHash, now: NOW });
  assert.equal(first.action, "execute");
  if (first.action !== "execute") return;
  const done = finishConsume(first.row, { published: true }, NOW);
  assert.equal(done.status, "consumed");

  const replay = beginConsume(done, { hash: done.contentHash, now: NOW });
  assert.equal(replay.action, "replay");
  if (replay.action !== "replay") return;
  assert.deepEqual(replay.output, { published: true });
  assert.equal(replay.inFlight, false);

  const inFlight = beginConsume(first.row, { hash: approved.contentHash, now: NOW });
  assert.equal(inFlight.action, "replay");
  if (inFlight.action === "replay") assert.equal(inFlight.inFlight, true);

  const wrong = beginConsume(approved, { hash: "different", now: NOW });
  assert.equal(wrong.action, "reject");
});

test("an approved action runs once when the run is advanced twice", async () => {
  const harness = memoryHarness();
  let calls = 0;
  const deps = {
    now: () => NOW,
    env: { GOOGLE_GENERATIVE_AI_API_KEY: "free", ZERNIO_API_KEY: "z" },
    complete: async () => ({
      text: "",
      toolCalls: [{ id: "call-1", name: "zernio_post", input: { content: "Ship the note", platform: "linkedin", accountId: "acc" } }],
      inputTokens: 10,
      outputTokens: 5,
      provider: "google",
      model: "gemini-2.5-flash",
    }),
    executeRead: async () => ({}),
    executeApproved: async (id: string) => {
      calls += 1;
      const approval = harness.approvals.get(id);
      assert.equal(approval?.exactContent, "Ship the note");
      return { id: "post-1", content: approval?.exactContent };
    },
  };

  const waiting = await advanceRun(harness.store, harness.run.id, deps);
  assert.equal(waiting.state, "waiting_approval");
  const approval = [...harness.approvals.values()][0];
  assert.ok(approval);
  const decided = decideApproval(
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
    },
    { actor: owner, decision: "approved", hash: approval.contentHash, idempotencyKey: "once", now: NOW },
  );
  assert.equal(decided.ok, true);
  if (!decided.ok) return;
  approval.status = decided.row.status;
  approval.decision = decided.row.decision;

  const ran = await advanceRun(harness.store, harness.run.id, deps);
  assert.equal(ran.state, "running");
  assert.equal(calls, 1);
  assert.equal(approval.status, "consumed");

  harness.run.status = "waiting_approval";
  const replay = await advanceRun(harness.store, harness.run.id, deps);
  assert.equal(replay.state, "running");
  assert.equal(calls, 1);
});

test("a read tool cannot smuggle a write, and there is no self-approve tool", async () => {
  const harness = memoryHarness();
  const deps = {
    now: () => NOW,
    env: { GOOGLE_GENERATIVE_AI_API_KEY: "free", COMPOSIO_API_KEY: "c" },
    complete: async () => ({
      text: "",
      toolCalls: [{ id: "call-2", name: "composio_read", input: { tool: "GMAIL_SEND_EMAIL", tags: ["readOnlyHint"] } }],
      inputTokens: 1,
      outputTokens: 1,
      provider: "google",
      model: "gemini-2.5-flash",
    }),
    executeRead: async () => {
      throw new Error("should not execute");
    },
    executeApproved: async () => {
      throw new Error("should not approve");
    },
  };
  const tick = await advanceRun(harness.store, harness.run.id, deps);
  assert.equal(tick.state, "running");
  assert.equal(harness.approvals.size, 0);
  const tool = harness.messages.find((message) => message.role === "tool");
  assert.match(tool?.content ?? "", /not read-only/);
});

function memoryHarness() {
  const agent: AgentRecord = {
    id: "agent-1",
    ownerId: "owner-1",
    slug: "social",
    name: "Social",
    role: "Social",
    persona: "Drafts only.",
    isChief: false,
    reportsTo: "chief",
    models: {
      chat: { provider: "google", modelId: "gemini-2.5-flash" },
      tools: { provider: "google", modelId: "gemini-2.5-flash" },
      routine: { provider: "google", modelId: "gemini-2.5-flash" },
    },
  };
  const run: RunRecord = {
    id: "run-1",
    ownerId: "owner-1",
    threadId: "thread-1",
    agentId: agent.id,
    parentRunId: null,
    childRunId: null,
    routineId: null,
    status: "queued",
    useCase: "chat",
    goal: "post",
    progress: "",
    error: null,
    stepCount: 0,
    tokenCount: 0,
    delegationCount: 0,
    retryCount: 0,
    cancelRequested: false,
  };
  const messages: StoredMessage[] = [
    { id: "m1", threadId: run.threadId, runId: null, role: "user", content: "Post this" },
  ];
  const approvals = new Map<string, ApprovalRecord>();
  const store: RunStore = {
    async getRun(id) {
      return id === run.id ? run : null;
    },
    async saveRun(next) {
      Object.assign(run, next);
    },
    async addStep() {},
    async addMessage(message) {
      messages.push(message);
    },
    async listMessages() {
      return messages.filter((message) => message.threadId === run.threadId);
    },
    async getAgent() {
      return agent;
    },
    async listSpecialists() {
      return [];
    },
    async findAgentBySlug() {
      return null;
    },
    async createApproval(draft) {
      const record: ApprovalRecord = {
        ...draft,
        id: "apr-run",
        status: "pending",
        decision: null,
        decisionKey: null,
        decisionNote: null,
        output: null,
        hookReady: false,
      };
      approvals.set(record.id, record);
      return record;
    },
    async getApprovalForRun() {
      return [...approvals.values()][0] ?? null;
    },
    async saveApproval(approval) {
      approvals.set(approval.id, approval);
    },
    async consume(approval, exec, now) {
      const current = approvals.get(approval.id) ?? approval;
      const begun = beginConsume(
        {
          id: current.id,
          ownerId: current.ownerId,
          status: current.status,
          decision: current.decision,
          decisionKey: current.decisionKey,
          decisionNote: current.decisionNote,
          contentHash: current.contentHash,
          output: current.output,
          expiresAt: current.expiresAt,
          consumedAt: current.consumedAt,
        },
        { hash: current.contentHash, now },
      );
      if (begun.action === "reject") {
        current.status = begun.row.status;
        approvals.set(current.id, current);
        return { output: { error: begun.error }, approval: current, replay: true };
      }
      if (begun.action === "replay") {
        return { output: begun.output, approval: current, replay: true };
      }
      current.status = "executing";
      approvals.set(current.id, current);
      let output: unknown;
      try {
        output = await exec();
      } catch (error) {
        output = { error: error instanceof Error ? error.message : "The action failed." };
      }
      const finished = finishConsume(
        {
          id: current.id,
          ownerId: current.ownerId,
          status: "executing",
          decision: current.decision,
          decisionKey: current.decisionKey,
          decisionNote: current.decisionNote,
          contentHash: current.contentHash,
          output: current.output,
          expiresAt: current.expiresAt,
        },
        output,
        now,
      );
      current.status = finished.status;
      current.output = finished.output;
      current.consumedAt = finished.consumedAt;
      approvals.set(current.id, current);
      return { output, approval: current, replay: false };
    },
    async addUsage() {},
    async createChildRun() {
      throw new Error("unused");
    },
    async hasToolResult(_threadId, toolCallId) {
      return messages.some((message) => message.role === "tool" && message.toolCallId === toolCallId);
    },
  };
  return { store, run, approvals, messages };
}

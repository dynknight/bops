import type { ApprovalRecord, AgentRecord, RunRecord, StepRecord, StoredMessage, UsageRecord } from "./types";

export type ChildRunInput = {
  ownerId: string;
  agentId: string;
  parentRunId: string;
  goal: string;
  title: string;
};

export interface RunStore {
  getRun(id: string): Promise<RunRecord | null>;
  saveRun(run: RunRecord): Promise<void>;
  addStep(step: StepRecord): Promise<void>;
  addMessage(message: StoredMessage): Promise<void>;
  listMessages(threadId: string): Promise<StoredMessage[]>;
  getAgent(id: string): Promise<AgentRecord | null>;
  listSpecialists(ownerId: string, chiefId: string): Promise<AgentRecord[]>;
  findAgentBySlug(ownerId: string, slug: string): Promise<AgentRecord | null>;
  createApproval(draft: Omit<ApprovalRecord, "id" | "status" | "decision" | "decisionKey" | "decisionNote" | "output" | "hookReady"> & { hookToken: string }): Promise<ApprovalRecord>;
  getApprovalForRun(runId: string): Promise<ApprovalRecord | null>;
  saveApproval(approval: ApprovalRecord): Promise<void>;
  consume(approval: ApprovalRecord, exec: () => Promise<unknown>, now: Date): Promise<{ output: unknown; approval: ApprovalRecord; replay: boolean }>;
  addUsage(usage: UsageRecord): Promise<void>;
  createChildRun(input: ChildRunInput): Promise<RunRecord>;
  hasToolResult(threadId: string, toolCallId: string): Promise<boolean>;
}

import type { UseCase } from "../models/providers";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_child"
  | "succeeded"
  | "failed"
  | "cancelled";

export type StoredMessage = {
  id: string;
  threadId: string;
  runId: string | null;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCallId?: string | null;
  toolName?: string | null;
  toolArgs?: unknown;
};

export type AgentRecord = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  role: string;
  persona: string;
  isChief: boolean;
  reportsTo: string | null;
  models: Record<UseCase, { provider: string; modelId: string }>;
};

export type RunRecord = {
  id: string;
  ownerId: string;
  threadId: string;
  agentId: string;
  parentRunId: string | null;
  childRunId: string | null;
  routineId: string | null;
  status: RunStatus;
  useCase: UseCase;
  goal: string;
  progress: string;
  error: string | null;
  stepCount: number;
  tokenCount: number;
  delegationCount: number;
  retryCount: number;
  cancelRequested: boolean;
};

export type StepRecord = {
  runId: string;
  idx: number;
  kind: string;
  name: string;
  status: string;
  input?: unknown;
  output?: unknown;
};

export type ApprovalDraft = {
  ownerId: string;
  runId: string;
  agentId: string;
  toolCallId: string;
  toolName: string;
  action: string;
  args: unknown;
  exactContent: string | null;
  contentHash: string;
  hookToken: string;
  expiresAt: string;
};

export type ApprovalRecord = ApprovalDraft & {
  id: string;
  status: "pending" | "approved" | "denied" | "expired" | "executing" | "consumed";
  decision: "approved" | "denied" | null;
  decisionKey: string | null;
  decisionNote: string | null;
  output: unknown;
  hookReady: boolean;
  consumedAt?: string | null;
};

export type UsageRecord = {
  ownerId: string;
  runId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type ToolCall = { id: string; name: string; input: unknown };

export type Completion = {
  text: string;
  toolCalls: ToolCall[];
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
};

export type Tick =
  | { state: "running" }
  | { state: "waiting_approval"; approvalId: string; hookToken: string }
  | { state: "delegate"; childRunId: string }
  | { state: "succeeded" }
  | { state: "failed"; error: string }
  | { state: "cancelled" };

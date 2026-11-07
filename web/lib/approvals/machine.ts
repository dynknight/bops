import { OwnerOnlyError, type Actor, assertOwnerActor } from "../auth/allowlist";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "executing" | "consumed";

export type ApprovalRow = {
  id: string;
  ownerId: string;
  status: ApprovalStatus;
  decision: "approved" | "denied" | null;
  decisionKey: string | null;
  decisionNote: string | null;
  contentHash: string;
  output: unknown;
  expiresAt: string;
  consumedAt?: string | null;
};

export type DecideResult =
  | { ok: true; replay: boolean; row: ApprovalRow }
  | { ok: false; error: "not_allowed" | "hash_mismatch" | "expired" | "conflict"; row: ApprovalRow };

/**
 * Owner decision. Same decision again is a replay and does not change the row.
 * A model actor is refused and the row stays as it was.
 */
export function decideApproval(
  row: ApprovalRow,
  input: {
    actor: Actor;
    decision: "approved" | "denied";
    hash: string;
    idempotencyKey: string;
    note?: string | null;
    now: Date;
  },
): DecideResult {
  try {
    assertOwnerActor(input.actor);
  } catch (error) {
    if (error instanceof OwnerOnlyError) return { ok: false, error: "not_allowed", row };
    throw error;
  }
  if (input.actor.type === "owner" && input.actor.id !== row.ownerId) {
    return { ok: false, error: "not_allowed", row };
  }
  if (input.hash !== row.contentHash) {
    return { ok: false, error: "hash_mismatch", row };
  }
  if (row.status === "pending" && new Date(row.expiresAt).getTime() <= input.now.getTime()) {
    return { ok: false, error: "expired", row: { ...row, status: "expired" } };
  }
  if (row.status === "expired") return { ok: false, error: "expired", row };
  if (row.status !== "pending") {
    if (row.decision === input.decision) return { ok: true, replay: true, row };
    return { ok: false, error: "conflict", row };
  }
  return {
    ok: true,
    replay: false,
    row: {
      ...row,
      status: input.decision,
      decision: input.decision,
      decisionKey: input.idempotencyKey,
      decisionNote: input.note?.trim() ? input.note.trim() : null,
    },
  };
}

export type ConsumeResult =
  | { action: "execute"; row: ApprovalRow }
  | { action: "replay"; row: ApprovalRow; output: unknown; inFlight: boolean }
  | { action: "reject"; error: "not_approved" | "hash_mismatch" | "expired"; row: ApprovalRow };

/**
 * At most once. A second call while the first is executing, or after it finished,
 * returns the stored outcome and does not ask the caller to perform the action again.
 */
export function beginConsume(row: ApprovalRow, input: { hash: string; now: Date }): ConsumeResult {
  if (row.status === "executing" || row.status === "consumed") {
    return { action: "replay", row, output: row.output ?? null, inFlight: row.status === "executing" };
  }
  if (input.hash !== row.contentHash) return { action: "reject", error: "hash_mismatch", row };
  if (row.status === "pending" && new Date(row.expiresAt).getTime() <= input.now.getTime()) {
    return { action: "reject", error: "expired", row: { ...row, status: "expired" } };
  }
  if (row.status === "approved" && new Date(row.expiresAt).getTime() <= input.now.getTime()) {
    return { action: "reject", error: "expired", row: { ...row, status: "expired" } };
  }
  if (row.status !== "approved") return { action: "reject", error: "not_approved", row };
  return { action: "execute", row: { ...row, status: "executing" } };
}

export function finishConsume(row: ApprovalRow, output: unknown, now: Date): ApprovalRow {
  if (row.status === "consumed") return row;
  return {
    ...row,
    status: "consumed",
    output,
    consumedAt: now.toISOString(),
  };
}

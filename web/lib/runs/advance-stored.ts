import "server-only";
import { executeApprovedAction, executeComposioRead } from "../tools/external";
import { completeTurn } from "../models/complete";
import { createAdminClient } from "../supabase/admin";
import { advanceRun } from "./engine";
import { createSupabaseStore } from "./supabase-store";
import type { Tick } from "./types";

export async function advanceStoredRun(runId: string): Promise<Tick> {
  const store = createSupabaseStore();
  return advanceRun(store, runId, {
    now: () => new Date(),
    env: process.env,
    complete: completeTurn,
    executeRead: async (call) => {
      const input = call.input && typeof call.input === "object" ? (call.input as { tool?: unknown; args?: unknown }) : {};
      const slug = typeof input.tool === "string" ? input.tool : "";
      const args = input.args && typeof input.args === "object" ? (input.args as Record<string, unknown>) : {};
      return executeComposioRead(slug, args);
    },
    executeApproved: async (approvalId) => {
      const admin = createAdminClient();
      const { data, error } = await admin.from("approvals").select("*").eq("id", approvalId).single();
      if (error) throw new Error(error.message);
      return executeApprovedAction({
        id: data.id,
        ownerId: data.owner_id,
        runId: data.run_id,
        agentId: data.agent_id,
        toolCallId: data.tool_call_id,
        toolName: data.tool_name,
        action: data.action,
        args: data.args,
        exactContent: data.exact_content,
        contentHash: data.content_hash,
        hookToken: data.hook_token ?? "",
        expiresAt: data.expires_at,
        status: data.status,
        decision: data.decision,
        decisionKey: data.decision_key,
        decisionNote: data.decision_note,
        output: data.output,
        hookReady: Boolean(data.hook_ready),
      });
    },
  });
}

export async function markApprovalReady(approvalId: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("touch_approval", {
    p_id: approvalId,
    p_status: "pending",
    p_hook_token: `bops-approval:${approvalId}`,
    p_hook_ready: true,
    p_now: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function failStoredRun(runId: string, error: string): Promise<Tick> {
  const store = createSupabaseStore();
  const run = await store.getRun(runId);
  if (!run) return { state: "failed", error };
  await store.saveRun({ ...run, status: "failed", error, progress: "Stopped" });
  return { state: "failed", error };
}

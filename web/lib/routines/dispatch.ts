import "server-only";
import { createAdminClient } from "../supabase/admin";
import { startAgentRun } from "../runs/start";
import { nextRunAfter, parseCadence, ROUTINE_TIME_ZONE } from "./schedule";

type ClaimRow = {
  dispatch_id: string;
  routine_id: string;
  owner_id: string;
  slot_at: string;
  agent_id: string;
  prompt: string;
  name: string;
  cadence: unknown;
  timezone: string;
};

export async function dispatchDueRoutines(now = new Date()) {
  const admin = createAdminClient();
  const iso = now.toISOString();
  const pending = await admin.from("approvals").select("id, hook_token").eq("status", "pending").lte("expires_at", iso);
  if (pending.error) throw new Error(pending.error.message);
  for (const row of pending.data ?? []) {
    await admin.rpc("touch_approval", {
      p_id: row.id,
      p_status: "expired",
      p_hook_token: row.hook_token,
      p_hook_ready: true,
      p_now: iso,
    });
  }

  const claimed = await admin.rpc("claim_due_routines", { p_now: iso });
  if (claimed.error) throw new Error(claimed.error.message);
  const rows = (claimed.data ?? []) as ClaimRow[];
  const started: string[] = [];
  for (const row of rows) {
    const cadence = parseCadence(row.cadence);
    const thread = await admin
      .from("threads")
      .insert({ owner_id: row.owner_id, agent_id: row.agent_id, title: row.name })
      .select("id")
      .single();
    if (thread.error) throw new Error(thread.error.message);
    await admin.from("messages").insert({
      owner_id: row.owner_id,
      thread_id: thread.data.id,
      role: "user",
      content: row.prompt,
    });
    const run = await admin
      .from("runs")
      .insert({
        owner_id: row.owner_id,
        thread_id: thread.data.id,
        agent_id: row.agent_id,
        routine_id: row.routine_id,
        status: "queued",
        use_case: "routine",
        goal: row.prompt,
        progress: "Queued by the dispatcher",
      })
      .select("id")
      .single();
    if (run.error) throw new Error(run.error.message);
    await admin.from("routine_dispatches").update({ run_id: run.data.id }).eq("id", row.dispatch_id);
    if (cadence) {
      const next = nextRunAfter(new Date(row.slot_at), now, cadence, row.timezone || ROUTINE_TIME_ZONE);
      await admin.from("routines").update({ next_run_at: next.toISOString(), updated_at: iso }).eq("id", row.routine_id);
    }
    await startAgentRun(run.data.id);
    started.push(run.data.id);
  }

  const stuck = await admin.rpc("list_stuck_routines", { p_now: iso });
  if (stuck.error) throw new Error(stuck.error.message);
  let repaired = 0;
  for (const row of (stuck.data ?? []) as { routine_id: string; slot_at: string; cadence: unknown; timezone: string }[]) {
    const cadence = parseCadence(row.cadence);
    if (!cadence) continue;
    const next = nextRunAfter(new Date(row.slot_at), now, cadence, row.timezone || ROUTINE_TIME_ZONE);
    await admin.from("routines").update({ next_run_at: next.toISOString(), updated_at: iso }).eq("id", row.routine_id);
    repaired += 1;
  }
  return { claimed: rows.length, started, repaired };
}

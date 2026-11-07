import "server-only";
import { start } from "workflow/api";
import { createAdminClient } from "../supabase/admin";
import { agentRunWorkflow } from "../../workflows/agent-run";

export async function startAgentRun(runId: string) {
  const admin = createAdminClient();
  try {
    const started = await start(agentRunWorkflow, [runId]);
    await admin.from("runs").update({ workflow_run_id: started.runId }).eq("id", runId);
    return started.runId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The workflow did not start.";
    await admin.from("runs").update({ status: "failed", error: message, progress: "Stopped" }).eq("id", runId);
    throw error;
  }
}

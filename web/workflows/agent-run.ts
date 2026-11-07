import { createHook } from "workflow";
import { start } from "workflow/api";
import { LIMITS } from "../lib/limits";
import type { Tick } from "../lib/runs/types";

async function advanceStep(runId: string): Promise<Tick> {
  "use step";
  const { advanceStoredRun } = await import("../lib/runs/advance-stored");
  return advanceStoredRun(runId);
}
advanceStep.maxRetries = LIMITS.maxRetries;

async function markReady(approvalId: string) {
  "use step";
  const { markApprovalReady } = await import("../lib/runs/advance-stored");
  await markApprovalReady(approvalId);
}
markReady.maxRetries = LIMITS.maxRetries;

async function failStep(runId: string): Promise<Tick> {
  "use step";
  const { failStoredRun } = await import("../lib/runs/advance-stored");
  return failStoredRun(runId, "Step limit reached.");
}
failStep.maxRetries = 0;

/**
 * Durable agent run. Model and tool work happens in steps. An approval pauses
 * on a hook until the owner decides. The model has no way to resume that hook.
 */
export async function agentRunWorkflow(runId: string): Promise<Tick> {
  "use workflow";
  for (let i = 0; i < 24; i++) {
    const tick = await advanceStep(runId);
    if (tick.state === "succeeded" || tick.state === "failed" || tick.state === "cancelled") return tick;
    if (tick.state === "waiting_approval") {
      const hook = createHook<{ decision: string }>({ token: tick.hookToken });
      await hook.getConflict();
      await markReady(tick.approvalId);
      await hook;
      continue;
    }
    if (tick.state === "delegate") {
      const child = await start(agentRunWorkflow, [tick.childRunId]);
      await child.returnValue;
    }
  }
  return failStep(runId);
}

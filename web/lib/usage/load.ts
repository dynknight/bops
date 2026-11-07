import "server-only";
import { createUserClient } from "../supabase/server";
import { combineUsage, type UsageTotal } from "./summary";

export async function loadUsage(now = new Date()): Promise<{ totals: UsageTotal[]; error?: string }> {
  const supabase = await createUserClient();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [events, runs, steps] = await Promise.all([
    supabase.from("usage_events").select("run_id, provider, model, input_tokens, output_tokens").gte("created_at", since.toISOString()),
    supabase.from("runs").select("id, token_count").gte("created_at", since.toISOString()),
    supabase.from("run_steps").select("run_id, name, created_at").eq("kind", "model").gte("created_at", since.toISOString()).order("created_at", { ascending: true }),
  ]);
  if (runs.error) return { totals: [], error: runs.error.message };
  return {
    totals: combineUsage({
      events: (events.data ?? []).map((row) => ({
        runId: row.run_id,
        provider: row.provider,
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      })),
      runs: (runs.data ?? []).map((row) => ({ id: row.id, tokenCount: row.token_count })),
      modelSteps: (steps.error ? [] : (steps.data ?? [])).map((row) => ({ runId: row.run_id, name: row.name })),
    }),
    error: events.error?.message,
  };
}

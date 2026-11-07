import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const supabase = await createUserClient();
  const run = await supabase.from("runs").select("id, status, progress, error, step_count, token_count, goal, created_at, cancel_requested").eq("id", id).maybeSingle();
  if (run.error || !run.data) return Response.json({ error: "That run is not yours." }, { status: 404 });
  const steps = await supabase.from("run_steps").select("idx, kind, name, status, created_at").eq("run_id", id).order("idx");
  return Response.json({ run: run.data, steps: steps.data ?? [] });
}

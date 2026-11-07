import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function GET() {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const supabase = await createUserClient();
  const runs = await supabase
    .from("runs")
    .select("id, status, progress, error, step_count, token_count, goal, created_at, agent_id")
    .order("created_at", { ascending: false })
    .limit(40);
  if (runs.error) return Response.json({ error: runs.error.message }, { status: 500 });
  return Response.json({ runs: runs.data ?? [] });
}

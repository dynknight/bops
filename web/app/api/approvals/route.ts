import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function GET() {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const supabase = await createUserClient();
  const [approvals, agents] = await Promise.all([
    supabase
      .from("approvals")
      .select("id, action, exact_content, args, content_hash, status, decision_note, tool_name, expires_at, hook_ready, agent_id, created_at")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.from("agents").select("id, name"),
  ]);
  if (approvals.error) return Response.json({ error: approvals.error.message }, { status: 500 });
  const names = new Map((agents.data ?? []).map((agent) => [agent.id, agent.name]));
  const rows = (approvals.data ?? []).map((row) => ({ ...row, agent_name: names.get(row.agent_id) ?? "Agent" }));
  rows.sort((a, b) => Number(a.status !== "pending") - Number(b.status !== "pending") || b.created_at.localeCompare(a.created_at));
  return Response.json({ approvals: rows });
}

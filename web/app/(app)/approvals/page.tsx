import { ApprovalsScreen, type ApprovalRow } from "@/components/approvals/approvals-screen";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const supabase = await createUserClient();
  const [approvals, agents] = await Promise.all([
    supabase
      .from("approvals")
      .select("id, action, exact_content, args, content_hash, status, decision_note, tool_name, expires_at, hook_ready, agent_id, created_at")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.from("agents").select("id, name"),
  ]);
  if (approvals.error) return <p className="p-8 text-[14px] text-danger">{approvals.error.message}</p>;
  const names = new Map((agents.data ?? []).map((agent) => [agent.id, agent.name]));
  const rows: ApprovalRow[] = (approvals.data ?? []).map((row) => ({ ...row, agent_name: names.get(row.agent_id) ?? "Agent" }));
  rows.sort((a, b) => Number(a.status !== "pending") - Number(b.status !== "pending") || b.created_at.localeCompare(a.created_at));
  return <ApprovalsScreen initialApprovals={rows} />;
}

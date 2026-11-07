import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const supabase = await createUserClient();
  const thread = await supabase.from("threads").select("id, title, agent_id").eq("id", id).maybeSingle();
  if (thread.error || !thread.data) return Response.json({ error: "That chat is not yours." }, { status: 404 });
  const [messages, runs] = await Promise.all([
    supabase.from("messages").select("id, role, content, tool_name, created_at").eq("thread_id", id).order("created_at", { ascending: true }),
    supabase.from("runs").select("id, status, progress, error, step_count, token_count, cancel_requested").eq("thread_id", id).order("created_at", { ascending: false }).limit(8),
  ]);
  const runIds = (runs.data ?? []).map((row) => row.id);
  const approvals = runIds.length
    ? await supabase
        .from("approvals")
        .select("id, action, exact_content, args, content_hash, status, decision_note, tool_name, expires_at, hook_ready, agent_id, run_id")
        .in("run_id", runIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (messages.error || runs.error || approvals.error) {
    return Response.json({ error: messages.error?.message || runs.error?.message || approvals.error?.message }, { status: 500 });
  }
  return Response.json({ thread: thread.data, messages: messages.data ?? [], runs: runs.data ?? [], approvals: approvals.data ?? [] });
}

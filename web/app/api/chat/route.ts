import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { startAgentRun } from "@/lib/runs/start";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const body = (await request.json().catch(() => null)) as { text?: unknown; agentId?: unknown; threadId?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "Write a message first." }, { status: 400 });
  const supabase = await createUserClient();
  let threadId = typeof body?.threadId === "string" ? body.threadId : "";
  let agentId = typeof body?.agentId === "string" ? body.agentId : "";
  if (threadId) {
    const thread = await supabase.from("threads").select("id, agent_id, title").eq("id", threadId).maybeSingle();
    if (thread.error || !thread.data) return Response.json({ error: "That chat is not yours." }, { status: 404 });
    agentId = thread.data.agent_id;
    if (thread.data.title === "New chat") {
      await supabase.from("threads").update({ title: text.slice(0, 80), updated_at: new Date().toISOString() }).eq("id", threadId);
    }
  } else {
    if (!agentId) {
      const chief = await supabase.from("agents").select("id").eq("is_chief", true).maybeSingle();
      agentId = chief.data?.id ?? "";
    }
    const created = await supabase.from("threads").insert({ owner_id: owner.id, agent_id: agentId, title: text.slice(0, 80) }).select("id").single();
    if (created.error) return Response.json({ error: created.error.message }, { status: 400 });
    threadId = created.data.id;
  }
  const message = await supabase.from("messages").insert({ owner_id: owner.id, thread_id: threadId, role: "user", content: text }).select("id").single();
  if (message.error) return Response.json({ error: message.error.message }, { status: 400 });
  const admin = createAdminClient();
  const run = await admin
    .from("runs")
    .insert({
      owner_id: owner.id,
      thread_id: threadId,
      agent_id: agentId,
      status: "queued",
      use_case: "chat",
      goal: text,
      progress: "Queued",
    })
    .select("id")
    .single();
  if (run.error) return Response.json({ error: run.error.message }, { status: 500 });
  try {
    await startAgentRun(run.data.id);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The workflow did not start.";
    return Response.json({ threadId, runId: run.data.id, error: detail }, { status: 503 });
  }
  return Response.json({ threadId, runId: run.data.id });
}

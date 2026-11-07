import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";
import { resumeHook } from "workflow/api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { decision?: unknown; contentHash?: unknown; note?: unknown } | null;
  const decision = body?.decision === "approved" || body?.decision === "denied" ? body.decision : null;
  const hash = typeof body?.contentHash === "string" ? body.contentHash : "";
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  const key = request.headers.get("idempotency-key")?.trim() || "";
  if (!decision || !hash || !key) {
    return Response.json({ error: "Decision, content hash, and Idempotency-Key are required." }, { status: 400 });
  }
  const supabase = await createUserClient();
  const decided = await supabase.rpc("decide_approval", {
    p_id: id,
    p_decision: decision,
    p_hash: hash,
    p_idempotency_key: key,
    p_note: note,
    p_now: new Date().toISOString(),
  });
  if (decided.error) {
    const message = decided.error.message;
    const status = message.includes("not allowed") ? 403 : message.includes("expired") ? 410 : message.includes("not found") ? 404 : 409;
    return Response.json({ error: message }, { status });
  }
  const result = decided.data as { replay?: boolean; decision?: string; error?: string; status?: string };
  if (result?.error) {
    const status = result.error.includes("expired") ? 410 : 409;
    return Response.json({ error: result.error, status: result.status }, { status });
  }
  if (!result.replay) {
    try {
      await resumeHook(`bops-approval:${id}`, { decision });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The run is still starting.";
      return Response.json({ ...result, warning: message }, { status: 202 });
    }
  }
  return Response.json(result);
}

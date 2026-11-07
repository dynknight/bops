import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return Response.json({ error: "Say whether the routine is enabled." }, { status: 400 });
  const supabase = await createUserClient();
  const updated = await supabase.from("routines").update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq("id", id).select("id");
  if (updated.error) return Response.json({ error: updated.error.message }, { status: 400 });
  if (!updated.data?.length) return Response.json({ error: "That routine is not yours." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const supabase = await createUserClient();
  const removed = await supabase.from("routines").delete().eq("id", id).select("id");
  if (removed.error) return Response.json({ error: removed.error.message }, { status: 400 });
  if (!removed.data?.length) return Response.json({ error: "That routine is not yours." }, { status: 404 });
  return Response.json({ ok: true });
}

import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createUserClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return Response.json({ error: "Say whether the routine is enabled." }, { status: 400 });
  const supabase = await createUserClient();
  const updated = await supabase.from("routines").update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq("id", id);
  if (updated.error) return Response.json({ error: updated.error.message }, { status: 400 });
  return Response.json({ ok: true });
}

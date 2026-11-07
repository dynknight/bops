import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { resumeHook } from "workflow/api";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const supabase = await createUserClient();
  const mine = await supabase.from("runs").select("id").eq("id", id).maybeSingle();
  if (mine.error || !mine.data) return Response.json({ error: "That run is not yours." }, { status: 404 });
  const admin = createAdminClient();
  const updated = await admin.from("runs").update({ cancel_requested: true, status: "cancelled", progress: "Cancelled" }).eq("id", id).eq("owner_id", owner.id);
  if (updated.error) return Response.json({ error: updated.error.message }, { status: 500 });
  const approval = await admin.from("approvals").select("id, hook_token").eq("run_id", id).eq("status", "pending").maybeSingle();
  if (approval.data?.hook_token) {
    try {
      await resumeHook(approval.data.hook_token, { decision: "cancelled" });
    } catch {
      // The run is already marked cancelled. The next step will stop.
    }
  }
  return Response.json({ ok: true });
}

import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { initialNextRun, parseCadence, ROUTINE_TIME_ZONE } from "@/lib/routines/schedule";
import { createUserClient } from "@/lib/supabase/server";

export async function GET() {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const supabase = await createUserClient();
  const routines = await supabase.from("routines").select("id, name, prompt, cadence, timezone, next_run_at, enabled, agent_id").order("next_run_at");
  if (routines.error) return Response.json({ error: routines.error.message }, { status: 500 });
  return Response.json({ routines: routines.data ?? [], timeZone: ROUTINE_TIME_ZONE });
}

export async function POST(request: Request) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const body = (await request.json().catch(() => null)) as { name?: unknown; prompt?: unknown; agentId?: unknown; cadence?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId : "";
  const cadence = parseCadence(body?.cadence);
  if (!name || !prompt || !agentId || !cadence) return Response.json({ error: "Name, prompt, agent, and cadence are required." }, { status: 400 });
  const supabase = await createUserClient();
  const inserted = await supabase
    .from("routines")
    .insert({
      owner_id: owner.id,
      agent_id: agentId,
      name,
      prompt,
      cadence,
      timezone: ROUTINE_TIME_ZONE,
      next_run_at: initialNextRun(new Date(), cadence).toISOString(),
    })
    .select("id")
    .single();
  if (inserted.error) return Response.json({ error: inserted.error.message }, { status: 400 });
  return Response.json({ id: inserted.data.id });
}

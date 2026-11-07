import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { formatInTimeZone, initialNextRun, parseCadence, ROUTINE_TIME_ZONE } from "@/lib/routines/schedule";
import { createUserClient } from "@/lib/supabase/server";

function withLabel<T extends { next_run_at: string; timezone: string | null }>(row: T) {
  return { ...row, next_run_label: formatInTimeZone(new Date(row.next_run_at), row.timezone || ROUTINE_TIME_ZONE) };
}

export async function GET() {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const supabase = await createUserClient();
  const routines = await supabase.from("routines").select("id, name, prompt, cadence, timezone, next_run_at, enabled, agent_id").order("next_run_at");
  if (routines.error) return Response.json({ error: routines.error.message }, { status: 500 });
  return Response.json({ routines: (routines.data ?? []).map(withLabel), timeZone: ROUTINE_TIME_ZONE });
}

export async function POST(request: Request) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const body = (await request.json().catch(() => null)) as { name?: unknown; prompt?: unknown; agentId?: unknown; cadence?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const agentId = typeof body?.agentId === "string" ? body.agentId : "";
  const cadence = parseCadence(body?.cadence);
  const clientKey = request.headers.get("idempotency-key")?.trim() || "";
  if (!name || !prompt || !agentId || !cadence) return Response.json({ error: "Name, prompt, agent, and cadence are required." }, { status: 400 });
  if (!clientKey) return Response.json({ error: "Idempotency-Key is required." }, { status: 400 });
  const supabase = await createUserClient();
  const nextRunAt = initialNextRun(new Date(), cadence).toISOString();
  const row = {
    owner_id: owner.id,
    agent_id: agentId,
    name,
    prompt,
    cadence,
    timezone: ROUTINE_TIME_ZONE,
    next_run_at: nextRunAt,
    client_key: clientKey,
  };
  let inserted = await supabase.from("routines").insert(row).select("id, next_run_at, timezone").single();
  if (inserted.error?.code === "23505") {
    const existing = await supabase.from("routines").select("id, next_run_at, timezone").eq("client_key", clientKey).maybeSingle();
    if (existing.data) return Response.json({ id: existing.data.id, duplicate: true, nextRunLabel: formatInTimeZone(new Date(existing.data.next_run_at), existing.data.timezone || ROUTINE_TIME_ZONE) });
  }
  if (inserted.error?.code !== "23505" && inserted.error?.message.includes("client_key")) {
    const { client_key, ...withoutKey } = row;
    void client_key;
    inserted = await supabase.from("routines").insert(withoutKey).select("id, next_run_at, timezone").single();
  }
  if (inserted.error) {
    return Response.json({ error: inserted.error.message }, { status: 400 });
  }
  return Response.json({
    id: inserted.data.id,
    duplicate: false,
    nextRunLabel: formatInTimeZone(new Date(inserted.data.next_run_at), inserted.data.timezone || ROUTINE_TIME_ZONE),
  });
}

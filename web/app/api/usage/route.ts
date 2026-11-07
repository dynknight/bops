import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { LIMITS } from "@/lib/limits";
import { createUserClient } from "@/lib/supabase/server";

export async function GET() {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const supabase = await createUserClient();
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const events = await supabase
    .from("usage_events")
    .select("provider, model, input_tokens, output_tokens, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (events.error) return Response.json({ error: events.error.message }, { status: 500 });
  const totals = new Map<string, { provider: string; model: string; input: number; output: number }>();
  for (const event of events.data ?? []) {
    const key = `${event.provider}/${event.model}`;
    const row = totals.get(key) ?? { provider: event.provider, model: event.model, input: 0, output: 0 };
    row.input += event.input_tokens;
    row.output += event.output_tokens;
    totals.set(key, row);
  }
  return Response.json({ month: since.toISOString(), totals: [...totals.values()], recent: events.data ?? [], limits: LIMITS });
}

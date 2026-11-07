import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { providerFlags } from "@/lib/models/providers";
import { createUserClient } from "@/lib/supabase/server";

export async function GET() {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const supabase = await createUserClient();
  const [agents, threads] = await Promise.all([
    supabase.from("agents").select("id, slug, name, role, color, is_chief, persona, reports_to").order("is_chief", { ascending: false }),
    supabase.from("threads").select("id, title, agent_id, updated_at").order("updated_at", { ascending: false }).limit(40),
  ]);
  if (agents.error) return Response.json({ error: agents.error.message }, { status: 500 });
  if (threads.error) return Response.json({ error: threads.error.message }, { status: 500 });
  return Response.json({
    owner,
    providers: providerFlags(process.env),
    agents: agents.data ?? [],
    threads: threads.data ?? [],
  });
}

import { TeamScreen } from "@/components/team/team-screen";
import { providerFlags } from "@/lib/models/providers";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createUserClient();
  const agents = await supabase.from("agents").select("id, slug, name, role, color, is_chief, persona, reports_to").order("is_chief", { ascending: false });
  if (agents.error) return <p className="p-8 text-[14px] text-danger">{agents.error.message}</p>;
  return <TeamScreen initialAgents={agents.data ?? []} providers={providerFlags(process.env)} />;
}

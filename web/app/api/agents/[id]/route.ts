import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { isProviderId, providerEnabled, USE_CASES, type UseCase } from "@/lib/models/providers";
import { createUserClient } from "@/lib/supabase/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    role?: unknown;
    persona?: unknown;
    models?: Partial<Record<UseCase, { provider?: unknown; modelId?: unknown }>>;
  } | null;
  const supabase = await createUserClient();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = typeof body?.role === "string" ? body.role.trim() : "";
  const persona = typeof body?.persona === "string" ? body.persona.slice(0, 4000) : "";
  if (!name || !role) return Response.json({ error: "Name and role are required." }, { status: 400 });
  const updated = await supabase.from("agents").update({ name, role, persona, updated_at: new Date().toISOString() }).eq("id", id);
  if (updated.error) return Response.json({ error: updated.error.message }, { status: 400 });
  if (body?.models) {
    for (const useCase of USE_CASES) {
      const choice = body.models[useCase];
      if (!choice) continue;
      const provider = typeof choice.provider === "string" ? choice.provider : "";
      const modelId = typeof choice.modelId === "string" ? choice.modelId.trim() : "";
      if (!isProviderId(provider) || !modelId) return Response.json({ error: "Each use case needs a provider and a model id." }, { status: 400 });
      if (provider !== "google" && !providerEnabled(provider, process.env)) {
        return Response.json({ error: `${provider} is not enabled. This app does not fall back to another provider.` }, { status: 400 });
      }
      const saved = await supabase.from("agent_models").upsert({ agent_id: id, use_case: useCase, provider, model_id: modelId });
      if (saved.error) return Response.json({ error: saved.error.message }, { status: 400 });
    }
  }
  return Response.json({ ok: true });
}

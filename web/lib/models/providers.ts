/**
 * Provider adapters. A provider is usable only when its own key is set.
 * Nothing here chooses a different provider when the requested one is missing.
 */

export const PROVIDERS = ["google", "openai", "anthropic", "xai", "openrouter"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const DEFAULT_PROVIDER: ProviderId = "google";
export const DEFAULT_MODEL_ID = "gemini-2.5-flash";

export const USE_CASES = ["chat", "tools", "routine"] as const;
export type UseCase = (typeof USE_CASES)[number];

const KEY_NAMES = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
} as const;

export type ProviderEnv = {
  readonly [key: string]: string | undefined;
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDERS as readonly string[]).includes(value);
}

export function providerKeyName(provider: ProviderId): (typeof KEY_NAMES)[ProviderId] {
  return KEY_NAMES[provider];
}

export function providerEnabled(provider: ProviderId, env: ProviderEnv): boolean {
  const value = env[providerKeyName(provider)];
  return typeof value === "string" && value.trim().length > 0;
}

export type ResolvedModel = { provider: ProviderId; modelId: string; keyName: string };

export function resolveModel(
  provider: string,
  modelId: string,
  env: ProviderEnv,
): { ok: true; model: ResolvedModel } | { ok: false; error: string } {
  if (!isProviderId(provider)) {
    return { ok: false, error: `Unknown model provider "${provider}".` };
  }
  const keyName = providerKeyName(provider);
  if (!providerEnabled(provider, env)) {
    return {
      ok: false,
      error: `${provider} is not enabled because ${keyName} is unset. This app does not fall back to another provider.`,
    };
  }
  const id = modelId.trim();
  if (!id) {
    return { ok: false, error: `${provider} needs a model id. This app does not pick a paid model on its own.` };
  }
  return { ok: true, model: { provider, modelId: id, keyName } };
}

/** Which providers the browser may hear about. Booleans only. */
export function providerFlags(env: ProviderEnv): Record<ProviderId, boolean> {
  return {
    google: providerEnabled("google", env),
    openai: providerEnabled("openai", env),
    anthropic: providerEnabled("anthropic", env),
    xai: providerEnabled("xai", env),
    openrouter: providerEnabled("openrouter", env),
  };
}

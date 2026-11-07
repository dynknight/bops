import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { resolveModel, type ProviderEnv, type ProviderId } from "./providers";

function modelFor(provider: ProviderId, modelId: string): LanguageModel {
  switch (provider) {
    case "google":
      return google(modelId);
    case "openai":
      return openai(modelId);
    case "anthropic":
      return anthropic(modelId);
    case "xai":
      return xai(modelId);
    case "openrouter":
      return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(modelId);
  }
}

/** Builds the requested provider only. A missing key throws. There is no fallback. */
export function createLanguageModel(provider: string, modelId: string, env: ProviderEnv = process.env): LanguageModel {
  const resolved = resolveModel(provider, modelId, env);
  if (!resolved.ok) throw new Error(resolved.error);
  return modelFor(resolved.model.provider, resolved.model.modelId);
}

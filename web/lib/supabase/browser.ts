"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabaseEnv } from "./env";

export function createBrowserSupabase() {
  const { url, anonKey } = requirePublicSupabaseEnv();
  return createBrowserClient(url, anonKey);
}

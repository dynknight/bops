import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getOwnerSession } from "../auth/owner-session-live";
import { requirePublicSupabaseEnv } from "./env";

/** Anon key plus the dynknight access token, so row level security still applies. */
export async function createUserClient() {
  const { url, anonKey } = requirePublicSupabaseEnv();
  const session = await getOwnerSession();
  if (!session) throw new Error("The owner session is not available.");
  return createClient(url, anonKey, {
    accessToken: async () => {
      const current = await getOwnerSession();
      if (!current) throw new Error("The owner session is not available.");
      return current.accessToken;
    },
  });
}

import "server-only";
import { OWNER_GITHUB_LOGIN } from "./allowlist";
import { getOwnerSession } from "./owner-session-live";
import { publicSupabaseEnv } from "../supabase/env";

export type Owner = { id: string; login: string };

/** The single dynknight profile. There is no sign-in screen. */
export async function getOwner(): Promise<Owner | null> {
  if (!publicSupabaseEnv()) return null;
  const session = await getOwnerSession();
  if (!session) return null;
  return { id: session.userId, login: OWNER_GITHUB_LOGIN };
}

export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) throw new Error("The owner session is not available.");
  return owner;
}

export async function requireOwnerApi(): Promise<Owner | Response> {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "The owner session is not available." }, { status: 503 });
  return owner;
}

export function isOwner(value: Owner | Response): value is Owner {
  return !(value instanceof Response);
}

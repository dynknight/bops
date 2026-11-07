import { redirect } from "next/navigation";
import { githubLoginFromUser, isOwnerLogin } from "./allowlist";
import { createUserClient } from "../supabase/server";
import { publicSupabaseEnv } from "../supabase/env";

export type Owner = { id: string; login: string };

export async function getOwner(): Promise<Owner | null> {
  if (!publicSupabaseEnv()) return null;
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  const login = githubLoginFromUser(data.user);
  if (!data.user || !isOwnerLogin(login)) return null;
  return { id: data.user.id, login: login!.toLowerCase() };
}

export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) redirect("/login");
  return owner;
}

export async function requireOwnerApi(): Promise<Owner | Response> {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: "Sign in as dynknight." }, { status: 401 });
  return owner;
}

export function isOwner(value: Owner | Response): value is Owner {
  return !(value instanceof Response);
}

/**
 * Owner gate for this personal prototype.
 * The GitHub login is fixed. There is no environment override.
 */

export const OWNER_GITHUB_LOGIN = "dynknight";

export function isOwnerLogin(login: string | null | undefined): boolean {
  if (!login) return false;
  return login.trim().toLowerCase() === OWNER_GITHUB_LOGIN;
}

export type GithubIdentity = {
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null;
};

function asLogin(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** GitHub login Supabase may put on the user, the metadata, or the identity. */
export function githubLoginFromUser(user: GithubIdentity | null | undefined): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const fromMeta =
    asLogin(meta.user_name) ??
    asLogin(meta.preferred_username) ??
    asLogin(meta.user_login);
  if (fromMeta) return fromMeta;
  const github = user.identities?.find((row) => row.provider === "github");
  const data = github?.identity_data ?? {};
  return asLogin(data.user_name) ?? asLogin(data.preferred_username) ?? asLogin(data.user_login);
}

export type Actor = { type: "owner"; id: string; login: string } | { type: "model" } | { type: "service" };

/** Approval decisions are an owner action. A model run is never an owner. */
export function assertOwnerActor(actor: Actor): { id: string; login: string } {
  if (actor.type !== "owner" || !isOwnerLogin(actor.login)) {
    throw new OwnerOnlyError();
  }
  return { id: actor.id, login: actor.login.trim().toLowerCase() };
}

export class OwnerOnlyError extends Error {
  constructor() {
    super("Only the owner can do that.");
    this.name = "OwnerOnlyError";
  }
}

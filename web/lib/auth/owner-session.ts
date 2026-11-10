/**
 * Pure decisions for the single-tenant owner session.
 * The live Supabase calls live in owner-session-live.ts.
 */

export type MintedSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
};

export type OwnerRecord = { id: string; email: string | null };

export type OwnerDirectory = {
  userById: (id: string) => Promise<OwnerRecord | null>;
  ensureEmail: (id: string) => Promise<string | null>;
  magicLink: (email: string) => Promise<{ hashedToken: string; userId: string } | null>;
  verify: (hashedToken: string, email: string) => Promise<MintedSession | null>;
};

export type OwnerResolution = { action: "use"; id: string } | { action: "create" } | { action: "stop" };

/** Prefer the existing profile. Never invent a second owner when a lookup failed. */
export function resolveOwnerId(input: {
  profileId: string | null;
  profileFailed: boolean;
  authUserId: string | null;
  authFailed: boolean;
}): OwnerResolution {
  if (input.profileId) return { action: "use", id: input.profileId };
  if (input.profileFailed) return { action: "stop" };
  if (input.authUserId) return { action: "use", id: input.authUserId };
  if (input.authFailed) return { action: "stop" };
  return { action: "create" };
}

export function sessionNeedsRefresh(expiresAt: number, now: number, skewMs = 60_000): boolean {
  return !Number.isFinite(expiresAt) || expiresAt - now <= skewMs;
}

function payload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Read `exp` from an access token. Does not verify the signature. */
export function expiryFromAccessToken(token: string): number | null {
  const exp = payload(token)?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return exp * 1000;
}

/** Read `sub` from an access token. Does not verify the signature. */
export function subjectFromAccessToken(token: string): string | null {
  const sub = payload(token)?.sub;
  return typeof sub === "string" && sub ? sub : null;
}

/**
 * Mint a session for an existing owner id.
 * A magic link that belongs to anyone else is refused before it is verified.
 */
export async function mintOwnerSession(ownerId: string, directory: OwnerDirectory): Promise<MintedSession | null> {
  const user = await directory.userById(ownerId);
  if (!user || user.id !== ownerId) return null;
  const email = user.email?.trim() || (await directory.ensureEmail(ownerId));
  if (!email) return null;
  const link = await directory.magicLink(email);
  if (!link?.hashedToken || link.userId !== ownerId) return null;
  const session = await directory.verify(link.hashedToken, email);
  if (!session || session.userId !== ownerId || !session.accessToken || !session.refreshToken) return null;
  return session;
}

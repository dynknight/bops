import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { OWNER_GITHUB_LOGIN, githubLoginFromUser, isOwnerLogin } from "./allowlist";
import {
  expiryFromAccessToken,
  mintOwnerSession,
  resolveOwnerId,
  sessionNeedsRefresh,
  subjectFromAccessToken,
  type MintedSession,
  type OwnerDirectory,
} from "./owner-session";
import { createAdminClient } from "../supabase/admin";
import { requirePublicSupabaseEnv } from "../supabase/env";

const FALLBACK_EMAIL = "dynknight@users.bops.invalid";
const FAILURE_COOLDOWN_MS = 5_000;
const ACCESS_COOKIE = "bops_owner_access";
const REFRESH_COOKIE = "bops_owner_refresh";

let cached: MintedSession | null = null;
let ownerIdCache: string | null = null;
let pending: Promise<MintedSession | null> | null = null;
let failedUntil = 0;

/** User access token for the dynknight profile. The service role key never leaves the server. */
export async function getOwnerSession(): Promise<MintedSession | null> {
  const now = Date.now();
  if (cached && !sessionNeedsRefresh(cached.expiresAt, now)) return cached;
  if (now < failedUntil) return cached && !sessionNeedsRefresh(cached.expiresAt, now) ? cached : null;
  if (!pending) {
    pending = loadSession().finally(() => {
      pending = null;
    });
  }
  return pending;
}

async function loadSession(): Promise<MintedSession | null> {
  try {
    const admin = createAdminClient();
    const ownerId = ownerIdCache ?? (await loadOwnerId(admin));
    if (!ownerId) {
      failedUntil = Date.now() + FAILURE_COOLDOWN_MS;
      return null;
    }
    ownerIdCache = ownerId;
    const fromCookie = await readCookieSession(ownerId);
    if (fromCookie && !sessionNeedsRefresh(fromCookie.expiresAt, Date.now())) {
      cached = fromCookie;
      return fromCookie;
    }
    const current = fromCookie ?? (cached?.userId === ownerId ? cached : null);
    if (current) {
      const refreshed = await refreshSession(current);
      if (refreshed) {
        cached = refreshed;
        await writeCookieSession(refreshed);
        return refreshed;
      }
    }
    const minted = await mintOwnerSession(ownerId, liveDirectory(admin, ownerId));
    cached = minted;
    if (minted) await writeCookieSession(minted);
    else failedUntil = Date.now() + FAILURE_COOLDOWN_MS;
    return minted;
  } catch (error) {
    cached = null;
    failedUntil = Date.now() + FAILURE_COOLDOWN_MS;
    console.error(error instanceof Error ? error.message : "Owner session failed.");
    return null;
  }
}

async function readCookieSession(ownerId: string): Promise<MintedSession | null> {
  try {
    const jar = await cookies();
    const accessToken = jar.get(ACCESS_COOKIE)?.value;
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    if (!accessToken || !refreshToken) return null;
    if (subjectFromAccessToken(accessToken) !== ownerId) return null;
    const expiresAt = expiryFromAccessToken(accessToken);
    if (!expiresAt) return null;
    return { accessToken, refreshToken, userId: ownerId, expiresAt };
  } catch {
    return null;
  }
}

async function writeCookieSession(session: MintedSession) {
  if (session.accessToken.length > 3500 || session.refreshToken.length > 3500) return;
  try {
    const jar = await cookies();
    const accessMaxAge = Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000));
    jar.set(ACCESS_COOKIE, session.accessToken, cookieOptions(accessMaxAge));
    jar.set(REFRESH_COOKIE, session.refreshToken, cookieOptions(60 * 60 * 24 * 30));
  } catch {
    // Server Component renders cannot write cookies. Route handlers can.
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

function liveDirectory(admin: SupabaseClient, ownerId: string): OwnerDirectory {
  return {
    async userById(id) {
      const result = await admin.auth.admin.getUserById(id);
      const user = result.data.user;
      if (result.error || !user) return null;
      return { id: user.id, email: user.email ?? null };
    },
    async ensureEmail(id) {
      const updated = await admin.auth.admin.updateUserById(id, { email: FALLBACK_EMAIL, email_confirm: true });
      if (updated.error || !updated.data.user) return null;
      return updated.data.user.email ?? null;
    },
    async magicLink(email) {
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const hashedToken = link.data?.properties?.hashed_token;
      const userId = link.data?.user?.id;
      if (link.error || !hashedToken || !userId) return null;
      return { hashedToken, userId };
    },
    async verify(hashedToken, email) {
      const otp = await verifyMagicLink(hashedToken);
      if (otp?.userId === ownerId) return otp;
      return signInWithTemporaryPassword(email, ownerId);
    },
  };
}

async function loadOwnerId(admin: SupabaseClient): Promise<string | null> {
  const profile = await admin.from("profiles").select("id").eq("github_login", OWNER_GITHUB_LOGIN).maybeSingle();
  const profileId = typeof profile.data?.id === "string" ? profile.data.id : null;
  let authUserId: string | null = null;
  let authFailed = false;
  if (!profile.error && !profileId) {
    const found = await findAuthOwner(admin);
    authUserId = found.id;
    authFailed = found.failed;
  }
  const resolution = resolveOwnerId({
    profileId,
    profileFailed: Boolean(profile.error),
    authUserId,
    authFailed,
  });
  if (resolution.action === "stop") return null;
  const id = resolution.action === "use" ? resolution.id : await createOwnerUser(admin);
  if (!id) return null;
  await ensureProfile(admin, id);
  return id;
}

async function findAuthOwner(admin: SupabaseClient): Promise<{ id: string | null; failed: boolean }> {
  for (let page = 1; page <= 10; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) return { id: null, failed: true };
    const match = listed.data.users.find((user) => isOwnerLogin(githubLoginFromUser(user)) || user.email?.toLowerCase() === FALLBACK_EMAIL);
    if (match) return { id: match.id, failed: false };
    if (listed.data.users.length < 200) return { id: null, failed: false };
  }
  return { id: null, failed: true };
}

async function createOwnerUser(admin: SupabaseClient): Promise<string | null> {
  const created = await admin.auth.admin.createUser({
    email: FALLBACK_EMAIL,
    email_confirm: true,
    user_metadata: { user_name: OWNER_GITHUB_LOGIN, full_name: "Heidi" },
  });
  return created.data.user?.id ?? null;
}

async function ensureProfile(admin: SupabaseClient, id: string) {
  const existing = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) {
    const inserted = await admin.from("profiles").insert({ id, github_login: OWNER_GITHUB_LOGIN, display_name: "Heidi" });
    if (inserted.error) throw new Error(inserted.error.message);
  }
  const seeded = await admin.rpc("seed_agents", { p_owner: id });
  if (seeded.error) console.error(seeded.error.message);
}

function anonClient() {
  const { url, anonKey } = requirePublicSupabaseEnv();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function sessionFromAuth(data: { session: { access_token: string; refresh_token: string; expires_at?: number } | null; user: { id: string } | null }): MintedSession | null {
  const session = data.session;
  const user = data.user;
  if (!session?.access_token || !session.refresh_token || !user?.id) return null;
  const expiresAt = session.expires_at ? session.expires_at * 1000 : expiryFromAccessToken(session.access_token);
  if (!expiresAt) return null;
  return { accessToken: session.access_token, refreshToken: session.refresh_token, userId: user.id, expiresAt };
}

async function verifyMagicLink(hashedToken: string): Promise<MintedSession | null> {
  const client = anonClient();
  const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: hashedToken });
  if (verified.error || !verified.data.session || !verified.data.user) return null;
  return sessionFromAuth(verified.data);
}

async function signInWithTemporaryPassword(email: string, ownerId: string): Promise<MintedSession | null> {
  const admin = createAdminClient();
  const password = randomPassword();
  const updated = await admin.auth.admin.updateUserById(ownerId, { password, email_confirm: true });
  if (updated.error) return null;
  const client = anonClient();
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session || !signed.data.user) return null;
  const session = sessionFromAuth(signed.data);
  if (!session || session.userId !== ownerId) return null;
  return session;
}

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

async function refreshSession(current: MintedSession): Promise<MintedSession | null> {
  try {
    const client = anonClient();
    const refreshed = await client.auth.refreshSession({ refresh_token: current.refreshToken });
    if (refreshed.error || !refreshed.data.session || !refreshed.data.user) return null;
    const session = sessionFromAuth({ session: refreshed.data.session, user: refreshed.data.user });
    if (!session || session.userId !== current.userId) return null;
    return session;
  } catch {
    return null;
  }
}

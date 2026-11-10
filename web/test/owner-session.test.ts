import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { test } from "node:test";
import { expiryFromAccessToken, mintOwnerSession, resolveOwnerId, sessionNeedsRefresh, subjectFromAccessToken, type OwnerDirectory } from "../lib/auth/owner-session";

const ownerId = "11111111-1111-4111-8111-111111111111";

function directory(overrides: Partial<OwnerDirectory> = {}): OwnerDirectory {
  return {
    async userById(id) {
      return { id, email: "owner@example.com" };
    },
    async ensureEmail() {
      return "dynknight@users.bops.invalid";
    },
    async magicLink() {
      return { hashedToken: "hash", userId: ownerId };
    },
    async verify() {
      return { accessToken: "access", refreshToken: "refresh", userId: ownerId, expiresAt: 9_000 };
    },
    ...overrides,
  };
}

test("an existing profile is reused and a failed lookup does not create a second owner", () => {
  assert.deepEqual(resolveOwnerId({ profileId: ownerId, profileFailed: false, authUserId: null, authFailed: false }), { action: "use", id: ownerId });
  assert.deepEqual(resolveOwnerId({ profileId: null, profileFailed: true, authUserId: null, authFailed: false }), { action: "stop" });
  assert.deepEqual(resolveOwnerId({ profileId: null, profileFailed: false, authUserId: ownerId, authFailed: false }), { action: "use", id: ownerId });
  assert.deepEqual(resolveOwnerId({ profileId: null, profileFailed: false, authUserId: null, authFailed: true }), { action: "stop" });
  assert.deepEqual(resolveOwnerId({ profileId: null, profileFailed: false, authUserId: null, authFailed: false }), { action: "create" });
});

test("a magic link for a different user is not verified", async () => {
  let verified = false;
  const session = await mintOwnerSession(
    ownerId,
    directory({
      async magicLink() {
        return { hashedToken: "hash", userId: "someone-else" };
      },
      async verify() {
        verified = true;
        return { accessToken: "access", refreshToken: "refresh", userId: "someone-else", expiresAt: 9_000 };
      },
    }),
  );
  assert.equal(session, null);
  assert.equal(verified, false);
});

test("a verified session must be the same owner", async () => {
  const session = await mintOwnerSession(
    ownerId,
    directory({
      async verify() {
        return { accessToken: "access", refreshToken: "refresh", userId: "someone-else", expiresAt: 9_000 };
      },
    }),
  );
  assert.equal(session, null);
  const ok = await mintOwnerSession(ownerId, directory());
  assert.equal(ok?.userId, ownerId);
});

test("a user without an email gets one before the link is issued", async () => {
  const emails: string[] = [];
  const session = await mintOwnerSession(
    ownerId,
    directory({
      async userById(id) {
        return { id, email: null };
      },
      async magicLink(email) {
        emails.push(email);
        return { hashedToken: "hash", userId: ownerId };
      },
    }),
  );
  assert.deepEqual(emails, ["dynknight@users.bops.invalid"]);
  assert.equal(session?.accessToken, "access");
});

test("access tokens refresh shortly before they expire", () => {
  assert.equal(sessionNeedsRefresh(10_000, 9_500, 1_000), true);
  assert.equal(sessionNeedsRefresh(10_000, 8_000, 1_000), false);
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ exp: 1_700_000_000, sub: ownerId })).toString("base64url");
  assert.equal(expiryFromAccessToken(`${header}.${body}.sig`), 1_700_000_000_000);
  assert.equal(subjectFromAccessToken(`${header}.${body}.sig`), ownerId);
  assert.equal(expiryFromAccessToken("not-a-jwt"), null);
  assert.equal(subjectFromAccessToken("not-a-jwt"), null);
});

test("the web app no longer redirects to login or starts GitHub OAuth", () => {
  const root = join(import.meta.dirname, "..");
  const oauth = "signIn" + "WithOAuth";
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /["'`]\/login["'`]/, path);
    assert.equal(source.includes(oauth), false, path);
  }
});

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "test") continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) sourceFiles(path, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(path);
  }
  return acc.filter((path) => !path.split(sep).includes("test"));
}

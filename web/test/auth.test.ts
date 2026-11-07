import assert from "node:assert/strict";
import { test } from "node:test";
import { OWNER_GITHUB_LOGIN, OwnerOnlyError, assertOwnerActor, githubLoginFromUser, isOwnerLogin } from "../lib/auth/allowlist";

test("the owner allowlist is dynknight and nothing else", () => {
  assert.equal(OWNER_GITHUB_LOGIN, "dynknight");
  assert.equal(isOwnerLogin("dynknight"), true);
  assert.equal(isOwnerLogin("DynKnight"), true);
  assert.equal(isOwnerLogin(" dynknight "), true);
  assert.equal(isOwnerLogin("octocat"), false);
  assert.equal(isOwnerLogin(""), false);
  assert.equal(isOwnerLogin(null), false);
});

test("github login is read from metadata or the github identity", () => {
  assert.equal(githubLoginFromUser({ user_metadata: { user_name: "dynknight" } }), "dynknight");
  assert.equal(
    githubLoginFromUser({
      user_metadata: {},
      identities: [{ provider: "github", identity_data: { preferred_username: "dynknight" } }],
    }),
    "dynknight",
  );
  assert.equal(githubLoginFromUser({ user_metadata: { user_name: "someone-else" } }), "someone-else");
  assert.equal(isOwnerLogin(githubLoginFromUser({ user_metadata: { user_name: "someone-else" } })), false);
});

test("a model cannot pass the owner gate", () => {
  assert.throws(() => assertOwnerActor({ type: "model" }), OwnerOnlyError);
  assert.throws(() => assertOwnerActor({ type: "service" }), OwnerOnlyError);
  assert.throws(() => assertOwnerActor({ type: "owner", id: "1", login: "octocat" }), OwnerOnlyError);
  assert.deepEqual(assertOwnerActor({ type: "owner", id: "1", login: "dynknight" }), { id: "1", login: "dynknight" });
});

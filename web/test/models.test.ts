import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveModel } from "../lib/models/providers";
import { FatalRunError, withRetries } from "../lib/limits";

test("a missing provider key does not fall back to a provider that has a key", () => {
  const env = { OPENAI_API_KEY: "sk-paid", GOOGLE_GENERATIVE_AI_API_KEY: "" };
  const missing = resolveModel("google", "gemini-2.5-flash", env);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /does not fall back/);

  const paid = resolveModel("openai", "gpt-4.1-mini", env);
  assert.equal(paid.ok, true);
  if (paid.ok) assert.equal(paid.model.provider, "openai");

  const google = resolveModel("google", "gemini-2.5-flash", { GOOGLE_GENERATIVE_AI_API_KEY: "free-key", OPENAI_API_KEY: "sk-paid" });
  assert.equal(google.ok, true);
  if (google.ok) {
    assert.equal(google.model.provider, "google");
    assert.equal(google.model.modelId, "gemini-2.5-flash");
  }
});

test("an empty model id is refused instead of a default paid model", () => {
  const result = resolveModel("openrouter", "  ", { OPENROUTER_API_KEY: "key" });
  assert.equal(result.ok, false);
});

test("retries stop at the limit and skip fatal errors", async () => {
  let calls = 0;
  await assert.rejects(
    withRetries(async () => {
      calls += 1;
      throw new Error("down");
    }, 2),
    /down/,
  );
  assert.equal(calls, 3);

  let fatalCalls = 0;
  await assert.rejects(
    withRetries(async () => {
      fatalCalls += 1;
      throw new FatalRunError("no key");
    }, 2),
    /no key/,
  );
  assert.equal(fatalCalls, 1);
});

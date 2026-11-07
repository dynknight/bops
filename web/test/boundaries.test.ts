import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function files(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    const info = statSync(path);
    if (info.isDirectory()) files(path, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(path);
  }
  return acc;
}

test("client components and the public env do not carry provider secrets", () => {
  const root = join(import.meta.dirname, "..");
  const secret = /GOOGLE_GENERATIVE_AI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|OPENROUTER_API_KEY|SUPABASE_SERVICE_ROLE_KEY|COMPOSIO_API_KEY|ZERNIO_API_KEY|CRON_SECRET/;
  for (const path of files(join(root, "components"))) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, secret, path);
  }
  for (const path of files(join(root, "app"))) {
    const source = readFileSync(path, "utf8");
    if (!source.includes("use client")) continue;
    assert.doesNotMatch(source, secret, path);
  }
  const example = readFileSync(join(root, ".env.example"), "utf8");
  assert.match(example, /GOOGLE_GENERATIVE_AI_API_KEY=/);
  assert.doesNotMatch(example, /=sk-|AIza[0-9A-Za-z_-]{10,}/);
});

test("durable runs are marked as workflows and steps", () => {
  const source = readFileSync(join(import.meta.dirname, "../workflows/agent-run.ts"), "utf8");
  assert.match(source, /"use workflow"/);
  assert.match(source, /"use step"/);
});

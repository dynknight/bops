import assert from "node:assert/strict";
import { test } from "node:test";
import { combineUsage } from "../lib/usage/summary";

test("usage includes run token counts when no usage event was stored", () => {
  const totals = combineUsage({
    events: [],
    runs: [
      { id: "run-1", tokenCount: 1200 },
      { id: "run-2", tokenCount: 0 },
    ],
    modelSteps: [{ runId: "run-1", name: "google/gemini-2.5-flash" }],
  });
  assert.deepEqual(totals, [{ provider: "google", model: "gemini-2.5-flash", input: 1200, output: 0 }]);
});

test("a stored usage event is not added twice on top of the run total", () => {
  const totals = combineUsage({
    events: [{ runId: "run-1", provider: "google", model: "gemini-2.5-flash", inputTokens: 800, outputTokens: 200 }],
    runs: [{ id: "run-1", tokenCount: 1000 }],
    modelSteps: [{ runId: "run-1", name: "google/gemini-2.5-flash" }],
  });
  assert.deepEqual(totals, [{ provider: "google", model: "gemini-2.5-flash", input: 800, output: 200 }]);
});

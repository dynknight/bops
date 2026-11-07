import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyToolCall, composioReadAllowed } from "../lib/tools/classify";

test("composio reads require an explicit read-only tag and a non-writing name", () => {
  assert.equal(composioReadAllowed("GMAIL_FETCH_EMAILS", ["readOnlyHint"]), true);
  assert.equal(composioReadAllowed("GMAIL_SEND_EMAIL", ["readOnlyHint"]), false);
  assert.equal(composioReadAllowed("GMAIL_FETCH_EMAILS", undefined), false);
  assert.equal(composioReadAllowed("GMAIL_FETCH_EMAILS", ["readOnlyHint", "destructiveHint"]), false);
});

test("posts and replies are approvals and unknown tools are refused", () => {
  assert.equal(classifyToolCall("zernio_post", { content: "Exact words" }, { zernio: true }).kind, "approval");
  assert.equal(classifyToolCall("zernio_reply", { content: "  " }, { zernio: true }).kind, "reject");
  assert.equal(classifyToolCall("zernio_post", { content: "Hi" }, { zernio: false }).kind, "reject");
  assert.equal(classifyToolCall("approve", {}, {}).kind, "reject");
  assert.equal(classifyToolCall("delegate", { slug: "research", task: "look" }, {}).kind, "delegate");
});

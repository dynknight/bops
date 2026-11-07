import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { acceptEvent, verifyBearer, verifyWebhookSignature, webhookEventId } from "../lib/webhooks/verify";

test("webhook signatures fail closed and accept a matching hmac", () => {
  const raw = JSON.stringify({ id: "evt-1", type: "ping" });
  assert.equal(verifyWebhookSignature({ secret: undefined, raw, signature: "abc" }), false);
  assert.equal(verifyWebhookSignature({ secret: "topsecret", raw, signature: "deadbeef" }), false);
  const hex = createHmac("sha256", "topsecret").update(raw).digest("hex");
  assert.equal(verifyWebhookSignature({ secret: "topsecret", raw, signature: `sha256=${hex}` }), true);
});

test("svix signatures are checked against id, timestamp, and body", () => {
  const raw = "{\"ok\":true}";
  const secret = `whsec_${Buffer.from("super-secret-key").toString("base64")}`;
  const id = "msg_1";
  const timestamp = "1760000000";
  const key = Buffer.from("super-secret-key");
  const sig = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest("base64");
  assert.equal(
    verifyWebhookSignature({
      secret,
      raw,
      signature: null,
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: `v1,${sig}`,
      now: 1760000000 * 1000,
    }),
    true,
  );
  assert.equal(
    verifyWebhookSignature({
      secret,
      raw,
      signature: null,
      svixId: id,
      svixTimestamp: timestamp,
      svixSignature: "v1,not-the-signature",
      now: 1760000000 * 1000,
    }),
    false,
  );
});

test("the same webhook event is accepted once", () => {
  const seen = new Set<string>();
  const raw = "{\"id\":\"evt-9\"}";
  const id = webhookEventId(raw, { eventId: "evt-9" });
  assert.equal(acceptEvent(seen, "zernio", id), "new");
  assert.equal(acceptEvent(seen, "zernio", id), "duplicate");
  assert.equal(acceptEvent(seen, "composio", id), "new");
  assert.equal(verifyBearer("Bearer secret", "secret"), true);
  assert.equal(verifyBearer("Bearer no", undefined), false);
});

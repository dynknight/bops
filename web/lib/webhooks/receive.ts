import "server-only";
import { createAdminClient } from "../supabase/admin";
import { verifyWebhookSignature, webhookEventId } from "./verify";

export async function receiveWebhook(source: "composio" | "zernio", request: Request) {
  const raw = await request.text();
  const secret = source === "composio" ? process.env.COMPOSIO_WEBHOOK_SECRET : process.env.ZERNIO_WEBHOOK_SECRET;
  const alias = request.headers.get(source === "composio" ? "x-composio-signature" : "x-zernio-signature");
  const ok = verifyWebhookSignature({
    secret,
    raw,
    signature: request.headers.get("x-webhook-signature") ?? alias,
    svixId: request.headers.get("svix-id"),
    svixTimestamp: request.headers.get("svix-timestamp"),
    svixSignature: request.headers.get("svix-signature"),
  });
  if (!ok) return Response.json({ error: "Bad signature." }, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "The body is not JSON." }, { status: 400 });
  }
  const eventId = webhookEventId(raw, {
    eventId: request.headers.get("x-event-id"),
    svixId: request.headers.get("svix-id"),
  });
  const admin = createAdminClient();
  const { error } = await admin.from("webhook_events").insert({ source, event_id: eventId, payload });
  if (error?.code === "23505" || error?.message.toLowerCase().includes("duplicate")) {
    return Response.json({ ok: true, duplicate: true });
  }
  if (error) return Response.json({ error: "Could not record the event." }, { status: 500 });
  return Response.json({ ok: true, duplicate: false });
}

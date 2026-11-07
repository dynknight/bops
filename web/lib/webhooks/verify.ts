import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match?.[1]) return false;
  return safeEqual(match[1], secret);
}

type SignatureInput = {
  secret: string | undefined;
  raw: string;
  signature: string | null;
  svixId?: string | null;
  svixTimestamp?: string | null;
  svixSignature?: string | null;
  now?: number;
};

function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Direct HMAC of the body, or a Svix-style signature. Missing secret fails closed. */
export function verifyWebhookSignature(input: SignatureInput): boolean {
  const secret = input.secret?.trim();
  if (!secret) return false;
  if (input.signature) {
    const presented = input.signature.trim().replace(/^sha256=/i, "");
    const expected = hmacHex(secret, input.raw);
    if (presented.length === expected.length && safeEqual(presented.toLowerCase(), expected)) return true;
  }
  const id = input.svixId?.trim();
  const timestamp = input.svixTimestamp?.trim();
  const signature = input.svixSignature?.trim();
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return false;
  const now = input.now ?? Date.now();
  if (Math.abs(now / 1000 - seconds) > 5 * 60) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice("whsec_".length), "base64") : Buffer.from(secret);
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.raw}`).digest("base64");
  return signature.split(" ").some((part) => {
    const value = part.startsWith("v1,") ? part.slice(3) : "";
    return value.length > 0 && safeEqual(value, expected);
  });
}

export function webhookEventId(raw: string, headers: { eventId?: string | null; svixId?: string | null }): string {
  const given = headers.svixId?.trim() || headers.eventId?.trim();
  if (given) return given;
  return createHash("sha256").update(raw).digest("hex");
}

export function acceptEvent(seen: Set<string>, source: string, eventId: string): "new" | "duplicate" {
  const key = `${source}:${eventId}`;
  if (seen.has(key)) return "duplicate";
  seen.add(key);
  return "new";
}

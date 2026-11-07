import { createHash } from "node:crypto";

export type ApprovalPayload = {
  tool: string;
  action: string;
  args: unknown;
  exactContent: string | null;
};

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(record[key]);
        return acc;
      }, {});
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function contentHash(payload: ApprovalPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export function payloadFromParts(parts: {
  toolName: string;
  action: string;
  args: unknown;
  exactContent: string | null;
}): ApprovalPayload {
  return {
    tool: parts.toolName,
    action: parts.action,
    args: parts.args,
    exactContent: parts.exactContent,
  };
}

/** The stored row still describes the exact action that was hashed. */
export function assertHashBound(parts: {
  toolName: string;
  action: string;
  args: unknown;
  exactContent: string | null;
  contentHash: string;
}): void {
  const payload = payloadFromParts(parts);
  const again = contentHash(payload);
  if (again !== parts.contentHash) {
    throw new HashMismatchError();
  }
  if (parts.exactContent !== null && parts.args && typeof parts.args === "object") {
    const claimed = (parts.args as { content?: unknown }).content;
    if (typeof claimed === "string" && claimed !== parts.exactContent) {
      throw new HashMismatchError("Exact content does not match the arguments.");
    }
  }
}

export class HashMismatchError extends Error {
  constructor(message = "The action does not match the approval.") {
    super(message);
    this.name = "HashMismatchError";
  }
}

const WRITE_HINT = /(send|create|update|delete|post|write|pay|charge|reply|publish|remove|insert|patch|put|upload|share|invite|archive|trash|draft)/i;

/**
 * Composio tools run immediately only with an explicit read-only tag and a name
 * that does not look like a write. Anything else stays behind an approval.
 */
export function composioReadAllowed(slug: string, tags: string[] | undefined): boolean {
  const list = tags ?? [];
  const read = list.some((tag) => tag === "readOnlyHint" || tag === "readOnly" || tag === "read");
  if (!read) return false;
  if (list.some((tag) => /write|destruct|side.?effect|approval/i.test(tag))) return false;
  if (WRITE_HINT.test(slug)) return false;
  return true;
}

export type ToolKind = "delegate" | "read" | "approval" | "reject";

export function classifyToolCall(name: string, input: unknown, env: { composio?: boolean; zernio?: boolean }): { kind: ToolKind; reason?: string } {
  if (name === "delegate") return { kind: "delegate" };
  if (name === "composio_read") {
    if (!env.composio) return { kind: "reject", reason: "Composio is not enabled." };
    const slug = input && typeof input === "object" ? String((input as { tool?: unknown }).tool ?? "") : "";
    const tags = input && typeof input === "object" && Array.isArray((input as { tags?: unknown }).tags)
      ? ((input as { tags: string[] }).tags)
      : undefined;
    if (!slug) return { kind: "reject", reason: "Name the Composio tool to read." };
    if (tags && !composioReadAllowed(slug, tags)) {
      return { kind: "reject", reason: "That Composio tool is not read-only. Ask with the write tool so the owner can approve the exact action." };
    }
    return { kind: "read" };
  }
  if (name === "composio_write") {
    if (!env.composio) return { kind: "reject", reason: "Composio is not enabled." };
    return { kind: "approval" };
  }
  if (name === "zernio_post" || name === "zernio_reply") {
    if (!env.zernio) return { kind: "reject", reason: "Zernio is not enabled." };
    const content = input && typeof input === "object" ? (input as { content?: unknown }).content : "";
    if (typeof content !== "string" || !content.trim()) {
      return { kind: "reject", reason: "A post or reply needs the exact text." };
    }
    return { kind: "approval" };
  }
  return { kind: "reject", reason: "That tool is not available." };
}

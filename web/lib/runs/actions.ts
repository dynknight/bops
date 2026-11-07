import { contentHash, type ApprovalPayload } from "../approvals/hash";
import type { ToolCall } from "./types";

export function actionFor(call: ToolCall): { action: string; exactContent: string | null; payload: ApprovalPayload } {
  const input = call.input && typeof call.input === "object" ? (call.input as Record<string, unknown>) : {};
  if (call.name === "zernio_post" || call.name === "zernio_reply") {
    const exactContent = typeof input.content === "string" ? input.content : "";
    const action = call.name === "zernio_post" ? "Publish this exact post" : "Send this exact reply";
    const args = { ...input, content: exactContent };
    const payload: ApprovalPayload = { tool: call.name, action, args, exactContent };
    return { action, exactContent, payload };
  }
  const tool = typeof input.tool === "string" ? input.tool : call.name;
  const action = `Run ${tool}`;
  const payload: ApprovalPayload = { tool: call.name, action, args: input, exactContent: null };
  return { action, exactContent: null, payload };
}

export function hashFor(call: ToolCall): { action: string; exactContent: string | null; hash: string; args: unknown } {
  const built = actionFor(call);
  return { action: built.action, exactContent: built.exactContent, hash: contentHash(built.payload), args: built.payload.args };
}

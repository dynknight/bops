import "server-only";
import { Composio } from "@composio/core";
import Zernio from "@zernio/node";
import { assertHashBound, HashMismatchError } from "../approvals/hash";
import { FatalRunError } from "../limits";
import { composioReadAllowed } from "./classify";
import type { ApprovalRecord } from "../runs/types";

type ComposioTool = { slug?: string; tags?: string[] };
type ComposioLike = {
  tools: {
    get: (userId: string, filters: { tools: string[] }) => Promise<ComposioTool[]>;
    execute: (slug: string, body: { userId: string; arguments: Record<string, unknown>; dangerouslySkipVersionCheck: boolean }) => Promise<unknown>;
  };
};

function composioUser() {
  return process.env.COMPOSIO_USER_ID?.trim() || "dynknight";
}

function composioClient() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  if (!apiKey) throw new FatalRunError("Composio is not enabled.");
  return new Composio({ apiKey, disableVersionCheck: true }) as unknown as ComposioLike;
}

export async function executeComposioRead(slug: string, args: Record<string, unknown>) {
  const client = composioClient();
  const listed = await client.tools.get(composioUser(), { tools: [slug] });
  const tags = listed[0]?.tags;
  if (!composioReadAllowed(slug, tags)) {
    throw new FatalRunError("That Composio tool is not read-only, so it was not run.");
  }
  return client.tools.execute(slug, {
    userId: composioUser(),
    arguments: args,
    dangerouslySkipVersionCheck: true,
  });
}

export async function executeApprovedAction(approval: ApprovalRecord) {
  assertHashBound({
    toolName: approval.toolName,
    action: approval.action,
    args: approval.args,
    exactContent: approval.exactContent,
    contentHash: approval.contentHash,
  });
  if (approval.toolName === "composio_write") {
    const args = (approval.args && typeof approval.args === "object" ? approval.args : {}) as { tool?: unknown; args?: unknown };
    const slug = typeof args.tool === "string" ? args.tool : "";
    if (!slug) throw new HashMismatchError("The approved action has no tool.");
    const toolArgs = args.args && typeof args.args === "object" ? (args.args as Record<string, unknown>) : {};
    return composioClient().tools.execute(slug, {
      userId: composioUser(),
      arguments: toolArgs,
      dangerouslySkipVersionCheck: true,
    });
  }
  if (approval.toolName === "zernio_post" || approval.toolName === "zernio_reply") {
    return publishZernio(approval);
  }
  throw new FatalRunError("That approved action has no executor.");
}

async function publishZernio(approval: ApprovalRecord) {
  if (!process.env.ZERNIO_API_KEY?.trim()) throw new FatalRunError("Zernio is not enabled.");
  if (!approval.exactContent) throw new HashMismatchError("A post or reply needs exact text.");
  const args = (approval.args && typeof approval.args === "object" ? approval.args : {}) as {
    content?: string;
    platform?: string;
    accountId?: string;
    replyToId?: string;
    conversationId?: string;
  };
  if (args.content !== approval.exactContent) throw new HashMismatchError();
  const zernio = new Zernio();
  if (approval.toolName === "zernio_reply" && args.conversationId) {
    return zernio.messages.sendInboxMessage({
      path: { conversationId: args.conversationId },
      headers: { "Idempotency-Key": approval.id },
      body: { accountId: args.accountId ?? "", message: approval.exactContent },
    });
  }
  return zernio.posts.createPost({
    headers: { "Idempotency-Key": approval.id },
    body: {
      content: approval.exactContent,
      publishNow: true,
      platforms: [
        {
          platform: args.platform as "twitter",
          accountId: args.accountId ?? "",
          ...(args.replyToId ? { platformSpecificData: { replyToTweetId: args.replyToId } } : {}),
        },
      ],
    },
  });
}

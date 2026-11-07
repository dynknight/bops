import "server-only";
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { createLanguageModel } from "./create";
import type { AgentRecord, Completion, StoredMessage } from "../runs/types";

type ModelMessages = NonNullable<Parameters<typeof generateText>[0]["messages"]>;

function toModelMessages(messages: StoredMessage[]): ModelMessages {
  const out: unknown[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      out.push({ role: "user", content: message.content });
      continue;
    }
    if (message.role === "assistant" && message.toolCallId && message.toolName) {
      out.push({
        role: "assistant",
        content: [
          ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
          { type: "tool-call" as const, toolCallId: message.toolCallId, toolName: message.toolName, input: message.toolArgs ?? {} },
        ],
      });
      continue;
    }
    if (message.role === "assistant") {
      out.push({ role: "assistant", content: message.content });
      continue;
    }
    if (message.role === "tool" && message.toolCallId) {
      out.push({
        role: "tool",
        content: [
          {
            type: "tool-result" as const,
            toolCallId: message.toolCallId,
            toolName: message.toolName ?? "tool",
            output: { type: "text" as const, value: message.content },
          },
        ],
      });
    }
  }
  return out as ModelMessages;
}

function toolSet(agent: AgentRecord): ToolSet {
  const tools: ToolSet = {};
  if (agent.isChief) {
    tools.delegate = tool({
      description: "Hand a task to a specialist who reports to you. This does not approve any action.",
      inputSchema: z.object({ slug: z.string(), task: z.string() }),
    });
  }
  if (process.env.COMPOSIO_API_KEY?.trim()) {
    tools.composio_read = tool({
      description: "Run one read-only Composio tool. Tools that send or change data are refused.",
      inputSchema: z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()).optional() }),
    });
    tools.composio_write = tool({
      description: "Ask the owner to approve one exact Composio action. You cannot approve it.",
      inputSchema: z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()).optional() }),
    });
  }
  if (process.env.ZERNIO_API_KEY?.trim()) {
    tools.zernio_post = tool({
      description: "Ask the owner to approve the exact text of a social post before it is published.",
      inputSchema: z.object({ content: z.string(), platform: z.string(), accountId: z.string() }),
    });
    tools.zernio_reply = tool({
      description: "Ask the owner to approve the exact text of a reply before it is sent.",
      inputSchema: z.object({
        content: z.string(),
        platform: z.string(),
        accountId: z.string(),
        replyToId: z.string().optional(),
        conversationId: z.string().optional(),
      }),
    });
  }
  return tools;
}

export async function completeTurn(input: {
  provider: string;
  modelId: string;
  system: string;
  messages: StoredMessage[];
  agent: AgentRecord;
}): Promise<Completion> {
  const model = createLanguageModel(input.provider, input.modelId);
  const result = await generateText({
    model,
    system: input.system,
    messages: toModelMessages(input.messages),
    tools: toolSet(input.agent),
    stopWhen: stepCountIs(1),
  });
  const usage = result.usage as { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number };
  return {
    text: result.text ?? "",
    toolCalls: result.toolCalls.map((call) => ({
      id: call.toolCallId,
      name: call.toolName,
      input: "input" in call ? call.input : {},
    })),
    inputTokens: usage.inputTokens ?? usage.promptTokens ?? 0,
    outputTokens: usage.outputTokens ?? usage.completionTokens ?? 0,
    provider: input.provider,
    model: input.modelId,
  };
}

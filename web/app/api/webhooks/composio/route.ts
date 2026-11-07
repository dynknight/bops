import { receiveWebhook } from "@/lib/webhooks/receive";

export function POST(request: Request) {
  return receiveWebhook("composio", request);
}

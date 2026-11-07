import { ChatScreen } from "@/components/chat/chat-screen";

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  return <ChatScreen threadId={threadId} />;
}

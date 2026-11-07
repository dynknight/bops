"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApprovalCard, type ApprovalView } from "../approval/approval-card";
import { ComposerInput } from "./composer-input";

type Agent = { id: string; slug: string; name: string; role: string; color: string; is_chief: boolean };
type Thread = { id: string; title: string; agent_id: string };
type Message = { id: string; role: string; content: string; tool_name: string | null };
type Run = { id: string; status: string; progress: string | null; error: string | null; step_count: number; token_count: number };

export function ChatScreen({ threadId }: { threadId?: string }) {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [agentId, setAgentId] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [approvals, setApprovals] = useState<ApprovalView[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const boot = await fetch("/api/bootstrap").then((response) => response.json());
      if (stop) return;
      setAgents(boot.agents ?? []);
      setThreads(boot.threads ?? []);
      setAgentId((current) => current || boot.agents?.find((agent: Agent) => agent.is_chief)?.id || boot.agents?.[0]?.id || "");
      if (!threadId) return;
      const detail = await fetch(`/api/threads/${threadId}`).then((response) => response.json());
      if (stop || detail.error) return;
      setMessages(detail.messages ?? []);
      setRuns(detail.runs ?? []);
      setApprovals(detail.approvals ?? []);
      setAgentId(detail.thread.agent_id);
    }
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [threadId]);

  const active = runs.find((run) => ["queued", "running", "waiting_approval", "waiting_child"].includes(run.status));
  const agentName = agents.find((agent) => agent.id === agentId)?.name ?? "The agent";

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, agentId, threadId }),
    });
    const body = (await response.json()) as { threadId?: string; error?: string };
    setSending(false);
    if (!response.ok && !body.threadId) {
      setError(body.error ?? "The message did not send.");
      return;
    }
    setText("");
    if (body.threadId && body.threadId !== threadId) router.push(`/chat/${body.threadId}`);
    if (body.error) setError(body.error);
  }

  return (
    <div className="grid h-screen grid-cols-[220px_minmax(0,1fr)]">
      <div className="overflow-y-auto border-r border-line px-3 py-4">
        <div className="px-1 text-[12px] font-medium text-muted">Chats</div>
        <div className="mt-2 flex flex-col gap-0.5">
          {threads.map((thread) => (
            <Link key={thread.id} href={`/chat/${thread.id}`} className={`truncate rounded-lg px-2 py-1 text-[13px] ${thread.id === threadId ? "bg-white font-medium" : "hover:bg-white/70"}`}>
              {thread.title}
            </Link>
          ))}
          {!threads.length && <p className="px-2 text-[12px] text-muted">No chats yet.</p>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="text-[15px] font-semibold">{agentName}</div>
            <div className="text-[12px] text-muted">{agents.find((agent) => agent.id === agentId)?.role}</div>
          </div>
          {!threadId && (
            <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="rounded-full bg-white px-3 py-1 text-[13px] shadow-[0_0_0_1px_#E6E6E3]">
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          )}
        </header>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          {messages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[70%] rounded-2xl bg-ink px-3 py-2 text-[14px] text-white" : "max-w-[80%] rounded-2xl bg-white px-3 py-2 text-[14px] shadow-[0_0_0_1px_#E6E6E3]"}>
              {message.role === "tool" && <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{message.tool_name ?? "Tool"}</div>}
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))}
          {approvals
            .filter((approval) => approval.status === "pending" || approval.status === "approved" || approval.status === "denied")
            .map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} agentName={agentName} />
            ))}
          {active && (
            <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-[13px] shadow-[0_0_0_1px_#E6E6E3]">
              <span>
                {active.progress || active.status} · step {active.step_count} · {active.token_count} tokens
              </span>
              <button
                className="rounded-full bg-[#F2F2F0] px-3 py-1 text-[12.5px] font-medium"
                onClick={() => void fetch(`/api/runs/${active.id}/cancel`, { method: "POST" })}
              >
                Cancel
              </button>
            </div>
          )}
          {error && <p className="text-[13px] text-danger">{error}</p>}
        </div>
        <form onSubmit={(event) => void send(event)} className="border-t border-line px-5 py-3">
          <div className="flex items-end gap-2 rounded-2xl bg-white px-3 py-2 shadow-[0_0_0_1px_#E6E6E3]">
            <ComposerInput value={text} onChange={setText} placeholder={`Message ${agentName}`} className="min-h-6 flex-1 bg-transparent py-1 text-[14px] outline-none" />
            <button disabled={sending} className="rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

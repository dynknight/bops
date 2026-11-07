"use client";

import { useRef, useState } from "react";

/**
 * Approval card adapted from AppApprovalCard in components/app/chat-view.tsx
 * (OrgoAI/bops, Copyright 2026 Nick Vasilescu and Organic Intelligence, Inc.).
 * This prototype keeps the one-shot choice: Deny, or Allow once. The exact
 * text is what gets hashed. There is no "always allow".
 */
export type ApprovalView = {
  id: string;
  action: string;
  exact_content: string | null;
  args: unknown;
  content_hash: string;
  status: string;
  decision_note: string | null;
  tool_name: string;
  expires_at: string;
  hook_ready: boolean;
};

export function ApprovalCard({ approval, agentName, onDone }: { approval: ApprovalView; agentName: string; onDone?: () => void }) {
  const [note, setNote] = useState("");
  const [telling, setTelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keys = useRef(new Map<string, string>());
  const pending = approval.status === "pending";
  const preview = approval.exact_content || JSON.stringify(approval.args, null, 2);

  async function decide(decision: "approved" | "denied") {
    setBusy(true);
    setError(null);
    const keyName = `${approval.id}:${decision}`;
    if (!keys.current.has(keyName)) keys.current.set(keyName, crypto.randomUUID());
    const response = await fetch(`/api/approvals/${approval.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": keys.current.get(keyName)! },
      body: JSON.stringify({ decision, contentHash: approval.content_hash, note: decision === "denied" ? note : null }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; warning?: string };
    setBusy(false);
    if (!response.ok) setError(body.error ?? "That did not go through.");
    else {
      if (body.warning) setError(body.warning);
      onDone?.();
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-white p-3.5 shadow-[0_0_0_1px_#0000000F,0_10px_30px_-16px_#00000059]">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold leading-[18px]">{agentName} wants to {approval.action}</span>
        <span className="text-[12px] leading-4 text-muted">Exact action. It expires {new Date(approval.expires_at).toLocaleString()}.</span>
      </div>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-paper px-3 py-2 font-sans text-[12.5px] leading-[18px] text-[#3A3A38]">{preview}</pre>
      {telling && (
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={`What ${agentName} should do instead (optional)`}
          rows={2}
          className="resize-none rounded-xl bg-paper px-3 py-2 text-[12.5px] leading-[18px] outline-none"
        />
      )}
      {pending ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {telling ? (
            <>
              <button disabled={busy} onClick={() => void decide("denied")} className="rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50">
                Deny
              </button>
              <button disabled={busy} onClick={() => setTelling(false)} className="rounded-full bg-[#F2F2F0] px-3 py-1.5 text-[12.5px] font-medium">
                Back
              </button>
            </>
          ) : (
            <>
              <button disabled={busy} onClick={() => void decide("denied")} className="rounded-full bg-[#F2F2F0] px-3 py-1.5 text-[12.5px] font-medium">
                Deny
              </button>
              <button disabled={busy || !approval.hook_ready} onClick={() => void decide("approved")} className="rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50">
                Allow once
              </button>
              <button disabled={busy} onClick={() => setTelling(true)} className="px-1.5 py-1.5 text-[12.5px] font-medium text-muted">
                Tell the bot what to do instead
              </button>
            </>
          )}
        </div>
      ) : (
        <span className="text-[12.5px] text-muted">{approval.status === "approved" || approval.status === "consumed" || approval.status === "executing" ? "Allowed once." : approval.status === "denied" ? "Denied." : "Closed."}</span>
      )}
      {!approval.hook_ready && pending && <span className="text-[12px] text-muted">The run is still starting. Allow once appears when it is ready.</span>}
      {error && (
        <span role="alert" className="text-[12px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

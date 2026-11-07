"use client";

import { useState } from "react";
import { ApprovalCard, type ApprovalView } from "../approval/approval-card";

export type ApprovalRow = ApprovalView & { agent_name: string; created_at: string };

export function ApprovalsScreen({ initialApprovals }: { initialApprovals: ApprovalRow[] }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/approvals");
    const body = (await response.json()) as { approvals?: ApprovalRow[]; error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not load approvals.");
      return;
    }
    setApprovals(body.approvals ?? []);
  }

  const pending = approvals.filter((item) => item.status === "pending");
  const closed = approvals.filter((item) => item.status !== "pending");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <div>
        <h1 className="text-[22px] font-semibold">Approvals</h1>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          Allow once runs that exact action. Deny does nothing. The choice is bound to the content hash, expires, and a repeat does not run it again. The model cannot approve itself.
        </p>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {!pending.length && <p className="text-[13px] text-muted">Nothing is waiting for you.</p>}
      {pending.map((approval) => (
        <ApprovalCard key={approval.id} approval={approval} agentName={approval.agent_name} onDone={() => void reload()} />
      ))}
      {closed.length > 0 && (
        <section className="mt-2">
          <h2 className="text-[13px] font-medium text-muted">Earlier</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {closed.map((approval) => (
              <li key={approval.id} className="rounded-2xl bg-white px-4 py-3 shadow-[0_0_0_1px_#E6E6E3]">
                <div className="text-[14px] font-medium">{approval.agent_name}</div>
                <div className="text-[13px] text-[#3A3A38]">{approval.action}</div>
                <div className="mt-1 text-[12px] text-muted">{approval.status} · {approval.exact_content || approval.tool_name}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type Total = { provider: string; model: string; input: number; output: number };

export function UsageScreen() {
  const [totals, setTotals] = useState<Total[]>([]);
  const [limits, setLimits] = useState<{ maxSteps: number; maxTokens: number; maxRetries: number; maxDelegations: number } | null>(null);

  useEffect(() => {
    void fetch("/api/usage")
      .then((response) => response.json())
      .then((body) => {
        setTotals(body.totals ?? []);
        setLimits(body.limits ?? null);
      });
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-[22px] font-semibold">Usage</h1>
      <p className="mt-1 text-[13px] text-muted">Tokens recorded this month. Provider keys stay on the server.</p>
      {limits && (
        <p className="mt-4 text-[13px] text-[#3A3A38]">
          Limits per run: {limits.maxSteps} steps, {limits.maxTokens.toLocaleString()} tokens, {limits.maxRetries} retries, {limits.maxDelegations} delegations.
        </p>
      )}
      <table className="mt-4 w-full text-left text-[13px]">
        <thead className="text-muted">
          <tr>
            <th className="py-1 font-medium">Provider</th>
            <th className="font-medium">Model</th>
            <th className="font-medium">In</th>
            <th className="font-medium">Out</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((row) => (
            <tr key={`${row.provider}/${row.model}`} className="border-t border-line">
              <td className="py-2">{row.provider}</td>
              <td>{row.model}</td>
              <td>{row.input}</td>
              <td>{row.output}</td>
            </tr>
          ))}
          {!totals.length && (
            <tr>
              <td colSpan={4} className="py-3 text-muted">
                No model calls yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

import { LIMITS } from "@/lib/limits";
import type { UsageTotal } from "@/lib/usage/summary";

export function UsageScreen({ totals, error }: { totals: UsageTotal[]; error?: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-[22px] font-semibold">Usage</h1>
      <p className="mt-1 text-[13px] text-muted">Tokens recorded this month. A run that has a token count is included even when its usage row was missing. Provider keys stay on the server.</p>
      <p className="mt-4 text-[13px] text-[#3A3A38]">
        Limits per run: {LIMITS.maxSteps} steps, {LIMITS.maxTokens.toLocaleString()} tokens, {LIMITS.maxRetries} retries, {LIMITS.maxDelegations} delegations.
      </p>
      {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
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
              <td>{row.input.toLocaleString()}</td>
              <td>{row.output.toLocaleString()}</td>
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

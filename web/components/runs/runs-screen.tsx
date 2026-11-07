"use client";

import { useEffect, useState } from "react";

type Run = { id: string; status: string; progress: string | null; goal: string; step_count: number; token_count: number; created_at: string };
type Step = { idx: number; kind: string; name: string; status: string };

export function RunsScreen() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);

  async function refresh() {
    const body = await fetch("/api/runs").then((response) => response.json());
    setRuns(body.runs ?? []);
  }

  useEffect(() => {
    let stop = false;
    async function load() {
      const body = await fetch("/api/runs").then((response) => response.json());
      if (!stop) setRuns(body.runs ?? []);
    }
    void load();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-[22px] font-semibold">Runs</h1>
      <p className="mt-1 text-[13px] text-muted">Each chat, delegation, and routine keeps its steps. Cancel stops the run before the next action.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {runs.map((run) => (
          <li key={run.id} className="rounded-2xl bg-white px-4 py-3 shadow-[0_0_0_1px_#E6E6E3]">
            <div className="flex items-center justify-between gap-3">
              <button
                className="min-w-0 text-left"
                onClick={() => {
                  setOpen(run.id);
                  void fetch(`/api/runs/${run.id}`)
                    .then((response) => response.json())
                    .then((body) => setSteps(body.steps ?? []));
                }}
              >
                <div className="truncate text-[14px] font-medium">{run.goal || "Run"}</div>
                <div className="text-[12px] text-muted">
                  {run.status} · {run.progress} · step {run.step_count} · {run.token_count} tokens
                </div>
              </button>
              {["queued", "running", "waiting_approval", "waiting_child"].includes(run.status) && (
                <button
                  className="rounded-full bg-[#F2F2F0] px-3 py-1 text-[12.5px] font-medium"
                  onClick={() => void fetch(`/api/runs/${run.id}/cancel`, { method: "POST" }).then(() => refresh())}
                >
                  Cancel
                </button>
              )}
            </div>
            {open === run.id && (
              <ol className="mt-2 list-decimal pl-5 text-[12px] text-[#3A3A38]">
                {steps.map((step) => (
                  <li key={step.idx}>
                    {step.kind} · {step.name} · {step.status}
                  </li>
                ))}
                {!steps.length && <li>No steps recorded yet.</li>}
              </ol>
            )}
          </li>
        ))}
        {!runs.length && <li className="text-[13px] text-muted">No runs yet.</li>}
      </ul>
    </div>
  );
}

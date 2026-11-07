"use client";

import { useEffect, useState } from "react";

type Agent = { id: string; name: string; is_chief: boolean };
type Routine = { id: string; name: string; prompt: string; next_run_at: string; enabled: boolean; agent_id: string; timezone: string };

export function RoutineScreen() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [name, setName] = useState("Morning note");
  const [prompt, setPrompt] = useState("Summarize what needs me today.");
  const [agentId, setAgentId] = useState("");
  const [cadence, setCadence] = useState("daily");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await fetch("/api/routines").then((response) => response.json());
    setRoutines(list.routines ?? []);
  }

  useEffect(() => {
    let stop = false;
    void (async () => {
      const [boot, list] = await Promise.all([fetch("/api/bootstrap").then((response) => response.json()), fetch("/api/routines").then((response) => response.json())]);
      if (stop) return;
      setAgents(boot.agents ?? []);
      setRoutines(list.routines ?? []);
      setAgentId((current) => current || (boot.agents ?? []).find((agent: Agent) => agent.is_chief)?.id || boot.agents?.[0]?.id || "");
    })();
    return () => {
      stop = true;
    };
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const body =
      cadence === "15"
        ? { kind: "interval", minutes: 15 }
        : cadence === "60"
          ? { kind: "interval", minutes: 60 }
          : { kind: "daily_at", hour: 9, minute: 0 };
    const response = await fetch("/api/routines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, prompt, agentId, cadence: body }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) setError(json.error ?? "Could not save the routine.");
    else void refresh();
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-[22px] font-semibold">Routines</h1>
      <p className="mt-1 text-[13px] leading-5 text-muted">
        Times are America/Los_Angeles, stored in UTC. A dispatcher claims each due slot once, so a second call does not run it again. You can close the browser.
      </p>
      <form onSubmit={(event) => void create(event)} className="mt-6 grid gap-3 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_#E6E6E3]">
        <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl bg-paper px-3 py-2 text-[14px] outline-none" placeholder="Name" />
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} className="rounded-xl bg-paper px-3 py-2 text-[14px] outline-none" />
        <div className="flex gap-2">
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="rounded-xl bg-paper px-2 py-2 text-[13px]">
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <select value={cadence} onChange={(event) => setCadence(event.target.value)} className="rounded-xl bg-paper px-2 py-2 text-[13px]">
            <option value="daily">Daily at 9:00 PT</option>
            <option value="60">Every hour</option>
            <option value="15">Every 15 minutes</option>
          </select>
          <button className="rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium text-white">Add</button>
        </div>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
      <ul className="mt-4 flex flex-col gap-2">
        {routines.map((routine) => (
          <li key={routine.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_0_0_1px_#E6E6E3]">
            <div>
              <div className="text-[14px] font-medium">{routine.name}</div>
              <div className="text-[12px] text-muted">Next {new Date(routine.next_run_at).toLocaleString()} UTC · {routine.timezone}</div>
            </div>
            <button
              className="rounded-full bg-[#F2F2F0] px-3 py-1 text-[12.5px] font-medium"
              onClick={() =>
                void fetch(`/api/routines/${routine.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ enabled: !routine.enabled }),
                }).then(() => refresh())
              }
            >
              {routine.enabled ? "On" : "Off"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

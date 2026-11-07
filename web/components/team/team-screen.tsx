"use client";

import { useEffect, useState } from "react";

type Agent = {
  id: string;
  slug: string;
  name: string;
  role: string;
  color: string;
  is_chief: boolean;
  persona: string;
  reports_to: string | null;
};
type Providers = Record<string, boolean>;
type ModelChoice = { provider: string; modelId: string };

const USES = ["chat", "tools", "routine"] as const;

export function TeamScreen() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providers, setProviders] = useState<Providers>({});
  const [selected, setSelected] = useState<string>("");
  const [models, setModels] = useState<Record<string, ModelChoice>>({
    chat: { provider: "google", modelId: "gemini-2.5-flash" },
    tools: { provider: "google", modelId: "gemini-2.5-flash" },
    routine: { provider: "google", modelId: "gemini-2.5-flash" },
  });
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/bootstrap")
      .then((response) => response.json())
      .then((body) => {
        setAgents(body.agents ?? []);
        setProviders(body.providers ?? {});
        const chief = (body.agents ?? []).find((agent: Agent) => agent.is_chief);
        if (chief) setSelected(chief.id);
      });
  }, []);

  const agent = agents.find((item) => item.id === selected) ?? agents[0];
  const chief = agents.find((item) => item.is_chief);
  const reports = agents.filter((item) => item.reports_to && item.reports_to === chief?.id);
  const enabled = Object.entries(providers).filter(([, on]) => on).map(([name]) => name);
  const choices = enabled.length ? enabled : ["google"];

  function edit(patch: Partial<Agent>) {
    setAgents((current) => current.map((item) => (item.id === agent?.id ? { ...item, ...patch } : item)));
  }

  async function save() {
    if (!agent) return;
    setSaved(null);
    const response = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: agent.name, role: agent.role, persona: agent.persona, models }),
    });
    const body = (await response.json()) as { error?: string };
    setSaved(response.ok ? "Saved." : (body.error ?? "Could not save."));
  }

  if (!agent) return <p className="p-8 text-[14px] text-muted">Sign in to see the team. The first visit seeds the chief of staff and three specialists.</p>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-[22px] font-semibold">Team</h1>
      <p className="mt-1 text-[13px] text-muted">Who reports to whom, and how each one works. The chief of staff hands work down.</p>
      <div className="mt-6 flex flex-col items-center gap-4">
        <Card agent={chief ?? agent} active={agent.id === (chief ?? agent).id} onPick={() => setSelected((chief ?? agent).id)} wide />
        <div className="h-6 w-px bg-line" />
        <div className="flex flex-wrap justify-center gap-3">
          {reports.map((item) => (
            <Card key={item.id} agent={item} active={agent.id === item.id} onPick={() => setSelected(item.id)} />
          ))}
        </div>
      </div>
      <section className="mt-8 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_#E6E6E3]">
        <div className="text-[12px] font-medium text-muted">{agent.is_chief ? "Chief of staff" : `Reports to ${chief?.name ?? "the chief"}`}</div>
        <label className="mt-3 block text-[12px] font-medium">Name</label>
        <input value={agent.name} onChange={(event) => edit({ name: event.target.value })} className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-[14px] outline-none" />
        <label className="mt-3 block text-[12px] font-medium">Role</label>
        <input value={agent.role} onChange={(event) => edit({ role: event.target.value })} className="mt-1 w-full rounded-xl bg-paper px-3 py-2 text-[14px] outline-none" />
        <label className="mt-3 block text-[12px] font-medium">How I work</label>
        <textarea value={agent.persona} onChange={(event) => edit({ persona: event.target.value })} rows={4} className="mt-1 w-full resize-y rounded-xl bg-paper px-3 py-2 text-[14px] outline-none" />
        <div className="mt-4 grid gap-3">
          {USES.map((useCase) => (
            <div key={useCase} className="grid grid-cols-[90px_1fr_1.4fr] items-center gap-2">
              <span className="text-[12px] capitalize text-muted">{useCase}</span>
              <select
                value={models[useCase]?.provider ?? "google"}
                onChange={(event) => setModels((current) => ({ ...current, [useCase]: { ...current[useCase], provider: event.target.value } }))}
                className="rounded-xl bg-paper px-2 py-1.5 text-[13px]"
              >
                {choices.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider}
                    {!providers[provider] ? " (key not set)" : ""}
                  </option>
                ))}
              </select>
              <input
                value={models[useCase]?.modelId ?? ""}
                onChange={(event) => setModels((current) => ({ ...current, [useCase]: { provider: current[useCase]?.provider ?? "google", modelId: event.target.value } }))}
                className="rounded-xl bg-paper px-2 py-1.5 text-[13px] outline-none"
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">Google Gemini is the free default. Other providers appear when their key is set, and a missing key never falls back to a paid one.</p>
        <button onClick={() => void save()} className="mt-4 rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium text-white">
          Save
        </button>
        {saved && <span className="ml-3 text-[13px] text-muted">{saved}</span>}
      </section>
    </div>
  );
}

function Card({ agent, active, onPick, wide = false }: { agent: Agent; active: boolean; onPick: () => void; wide?: boolean }) {
  return (
    <button onClick={onPick} className={`rounded-2xl bg-white px-3 py-3 text-left shadow-[0_0_0_1px_#E6E6E3] ${wide ? "w-56" : "w-40"} ${active ? "shadow-[0_0_0_1.5px_#0A0A0A]" : ""}`}>
      <span className="inline-block size-2.5 rounded-full" style={{ background: agent.color }} />
      <div className="mt-2 text-[14px] font-semibold">{agent.name}</div>
      <div className="text-[12px] text-muted">{agent.is_chief ? "Chief of staff" : agent.role}</div>
    </button>
  );
}

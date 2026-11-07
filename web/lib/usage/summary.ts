export type UsageTotal = { provider: string; model: string; input: number; output: number };

export type UsageEventRow = {
  runId: string | null;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/**
 * Events are the accurate split. A run that already has a token count but no
 * event still shows up, so the usage page matches the Runs list.
 */
export function combineUsage(input: {
  events: UsageEventRow[];
  runs: { id: string; tokenCount: number }[];
  modelSteps: { runId: string; name: string }[];
}): UsageTotal[] {
  const covered = new Set<string>();
  const totals = new Map<string, UsageTotal>();
  function add(provider: string, model: string, inputTokens: number, outputTokens: number) {
    const key = `${provider}/${model}`;
    const row = totals.get(key) ?? { provider, model, input: 0, output: 0 };
    row.input += inputTokens;
    row.output += outputTokens;
    totals.set(key, row);
  }
  for (const event of input.events) {
    const inputTokens = Number(event.inputTokens) || 0;
    const outputTokens = Number(event.outputTokens) || 0;
    if (inputTokens + outputTokens <= 0) continue;
    if (event.runId) covered.add(event.runId);
    add(event.provider || "unknown", event.model || "unknown", inputTokens, outputTokens);
  }
  for (const run of input.runs) {
    if (run.tokenCount <= 0 || covered.has(run.id)) continue;
    const step = input.modelSteps.find((item) => item.runId === run.id);
    const slash = step?.name.indexOf("/") ?? -1;
    const provider = slash > 0 ? step!.name.slice(0, slash) : "recorded";
    const model = slash > 0 ? step!.name.slice(slash + 1) : "run total";
    add(provider, model, run.tokenCount, 0);
  }
  return [...totals.values()];
}

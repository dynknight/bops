import { UsageScreen } from "@/components/usage/usage-screen";
import { loadUsage } from "@/lib/usage/load";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const usage = await loadUsage();
  return <UsageScreen totals={usage.totals} error={usage.totals.length ? undefined : usage.error} />;
}

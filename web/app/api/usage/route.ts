import { isOwner, requireOwnerApi } from "@/lib/auth/session";
import { LIMITS } from "@/lib/limits";
import { loadUsage } from "@/lib/usage/load";

export async function GET() {
  const owner = await requireOwnerApi();
  if (!isOwner(owner)) return owner;
  const usage = await loadUsage();
  if (!usage.totals.length && usage.error) return Response.json({ error: usage.error, totals: [], limits: LIMITS }, { status: 500 });
  return Response.json({ totals: usage.totals, limits: LIMITS });
}

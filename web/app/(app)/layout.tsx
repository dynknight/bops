import { requireOwner } from "@/lib/auth/session";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  return <Shell login={owner.login}>{children}</Shell>;
}

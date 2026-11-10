import { getOwner } from "@/lib/auth/session";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const owner = await getOwner();
  if (!owner) return <Unavailable />;
  return <Shell login={owner.login}>{children}</Shell>;
}

function Unavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-[28px] font-semibold tracking-tight">Bops Web</h1>
      <p className="mt-2 text-[14px] leading-5 text-muted">
        The server could not open the dynknight profile. Check the Supabase URL, the anon key, and the service role key on the server.
      </p>
    </main>
  );
}

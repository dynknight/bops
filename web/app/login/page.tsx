import { publicSupabaseEnv } from "@/lib/supabase/env";
import { LoginButton } from "./login-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const configured = Boolean(publicSupabaseEnv());
  const denied = params.error === "denied";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-[28px] font-semibold tracking-tight">Bops Web</h1>
      <p className="mt-2 text-[14px] leading-5 text-muted">A personal, non-commercial prototype for Heidi. Chief of staff, a few specialists, and your approval before anything is sent.</p>
      {denied && (
        <p role="alert" className="mt-4 rounded-xl bg-white px-3 py-2 text-[13px] text-danger shadow-[0_0_0_1px_#E6E6E3]">
          This prototype only signs in the GitHub account dynknight.
        </p>
      )}
      {!configured && <p className="mt-4 text-[13px] leading-5 text-muted">Supabase is not configured yet. Follow SETUP.md, then set the public URL and anon key.</p>}
      {configured && <LoginButton />}
      <p className="mt-8 text-[12px] leading-4 text-muted">Adapted from Bops by Nick Vasilescu and Organic Intelligence, Inc. Licensed under FSL-1.1-ALv2. This is not a Bops product and does not use the Bops logo.</p>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/chat", "Chat"],
  ["/team", "Team"],
  ["/routines", "Routines"],
  ["/runs", "Runs"],
  ["/usage", "Usage"],
] as const;

export function Shell({ login, children }: { login: string; children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-paper px-3 py-4">
        <div className="px-2">
          <div className="text-[15px] font-semibold tracking-tight">Bops Web</div>
          <div className="mt-0.5 text-[12px] leading-4 text-muted">Personal prototype</div>
        </div>
        <nav className="mt-5 flex flex-col gap-0.5">
          {LINKS.map(([href, label]) => {
            const active = path === href || path.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={`rounded-xl px-2.5 py-1.5 text-[13.5px] ${active ? "bg-white font-medium shadow-[0_0_0_1px_#E6E6E3]" : "text-[#3A3A38] hover:bg-white/70"}`}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 text-[11.5px] leading-4 text-muted">
          <div>{login}</div>
          <form action="/api/auth/sign-out" method="post" className="mt-2">
            <button className="text-[12px] font-medium text-ink">Sign out</button>
          </form>
          <p className="mt-3">Adapted from Bops. Copyright 2026 Nick Vasilescu and Organic Intelligence, Inc. FSL-1.1-ALv2.</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

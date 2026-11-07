import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { githubLoginFromUser, isOwnerLogin } from "./lib/auth/allowlist";

const OPEN = [/^\/login$/, /^\/auth\/callback$/, /^\/api\/health$/, /^\/api\/cron\//, /^\/api\/webhooks\//];

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  if (!url || !key) {
    if (path === "/login" || path === "/" || path.startsWith("/api/health")) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const login = githubLoginFromUser(data.user);
  const owner = Boolean(data.user && isOwnerLogin(login));
  if (OPEN.some((pattern) => pattern.test(path))) return response;
  if (!owner && path.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in as dynknight." }, { status: 401 });
  }
  if (!owner) {
    const next = NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
    return next;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};

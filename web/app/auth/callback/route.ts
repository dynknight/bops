import { isOwnerLogin, githubLoginFromUser } from "@/lib/auth/allowlist";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=missing", request.url));
  const supabase = await createUserClient();
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.user) {
    return NextResponse.redirect(new URL("/login?error=oauth", request.url));
  }
  const login = githubLoginFromUser(exchanged.data.user);
  if (!isOwnerLogin(login)) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(exchanged.data.user.id);
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=denied", request.url));
  }
  const admin = createAdminClient();
  const name =
    (typeof exchanged.data.user.user_metadata.full_name === "string" && exchanged.data.user.user_metadata.full_name) ||
    (typeof exchanged.data.user.user_metadata.name === "string" && exchanged.data.user.user_metadata.name) ||
    "dynknight";
  await admin.from("profiles").upsert({ id: exchanged.data.user.id, github_login: "dynknight", display_name: name });
  await admin.rpc("seed_agents", { p_owner: exchanged.data.user.id });
  return NextResponse.redirect(new URL("/chat", request.url));
}

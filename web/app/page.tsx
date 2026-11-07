import { redirect } from "next/navigation";
import { getOwner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const owner = await getOwner();
  redirect(owner ? "/chat" : "/login");
}

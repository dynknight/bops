import { dispatchDueRoutines } from "@/lib/routines/dispatch";
import { verifyBearer } from "@/lib/webhooks/verify";

export const maxDuration = 60;

async function run(request: Request) {
  if (!verifyBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await dispatchDueRoutines(new Date());
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dispatch failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;

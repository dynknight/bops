import { providerFlags } from "@/lib/models/providers";
import { LIMITS } from "@/lib/limits";

export function GET() {
  return Response.json({
    ok: true,
    product: "Bops Web",
    providers: providerFlags(process.env),
    limits: LIMITS,
  });
}

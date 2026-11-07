import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ["@composio/core", "@zernio/node"],
  // The parent repo has its own lockfile. Keep this app's build inside web/.
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default withWorkflow(nextConfig);

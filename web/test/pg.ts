import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function createTestDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(readFileSync(join(root, "test/sql/auth_shim.sql"), "utf8"));
  const migrations = readdirSync(join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  for (const name of migrations) {
    await db.exec(readFileSync(join(root, "supabase/migrations", name), "utf8"));
  }
  return db;
}

export async function setAuth(db: PGlite, role: "authenticated" | "service_role" | "anon", userId?: string) {
  await db.exec("reset role");
  await db.exec(`select set_config('request.jwt.claim.role', '${role}', false)`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ""}', false)`);
  await db.exec(`set role ${role}`);
}

export async function asSuper(db: PGlite) {
  await db.exec("reset role");
  await db.exec(`select set_config('request.jwt.claim.role', '', false)`);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
}

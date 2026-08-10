import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const environment = process.env.ATLAS_ENV;
const databaseEnvironment = process.env.ATLAS_DATABASE_ENVIRONMENT;
const databaseUrl = process.env.DATABASE_URL || "";
if (environment !== "homologation" || databaseEnvironment !== environment) {
  console.error("ATLAS DATABASE CONNECTION: bloqueada. Use somente o banco identificado como homologation.");
  process.exit(1);
}

try {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname === "/") throw new Error();
} catch {
  console.error("ATLAS DATABASE CONNECTION: DATABASE_URL ausente ou inválida.");
  process.exit(1);
}

const prisma = resolve("node_modules/.bin/prisma");
if (!existsSync(prisma)) {
  console.error("ATLAS DATABASE CONNECTION: dependências ausentes. Execute npm ci.");
  process.exit(1);
}

const result = spawnSync(prisma, ["db", "execute", "--stdin"], {
  cwd: process.cwd(),
  env: process.env,
  input: "select 1;",
  encoding: "utf8",
  timeout: 30_000,
});
if (result.status !== 0) {
  console.error("ATLAS DATABASE CONNECTION: falhou sem executar alterações. Revise host, senha, SSL e allowlist.");
  process.exit(1);
}
console.log("ATLAS DATABASE CONNECTION: PASSED (homologation; SELECT 1; alterações executadas: 0)");

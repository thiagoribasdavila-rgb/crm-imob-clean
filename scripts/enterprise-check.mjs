import { access, readFile } from "node:fs/promises";
import process from "node:process";

const required = [
  "app/api/health/route.ts",
  "app/api/ready/route.ts",
  "lib/security/rate-limit.ts",
  "lib/security/webhook-signature.ts",
  "lib/observability/logger.ts",
  "lib/platform/feature-flags.ts",
  "docs/ATLAS_ENGINEERING_STANDARD.md",
  ".github/workflows/atlas-security.yml",
  "supabase/migrations/20260711060000_atlas_level6_resilience.sql",
];

const failures = [];
for (const path of required) {
  try {
    await access(path);
  } catch {
    failures.push(`Arquivo obrigatório ausente: ${path}`);
  }
}

try {
  const nextConfig = await readFile("next.config.ts", "utf8");
  for (const header of ["Strict-Transport-Security", "X-Content-Type-Options", "Permissions-Policy"]) {
    if (!nextConfig.includes(header)) failures.push(`Header de segurança ausente: ${header}`);
  }
} catch (error) {
  failures.push(`Falha ao revisar next.config.ts: ${String(error)}`);
}

try {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  for (const script of ["typecheck", "lint", "build", "release:check"]) {
    if (!packageJson.scripts?.[script]) failures.push(`Script obrigatório ausente: ${script}`);
  }
} catch (error) {
  failures.push(`package.json inválido: ${String(error)}`);
}

if (failures.length) {
  console.error("\nATLAS ENTERPRISE CHECK: FAILED\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("ATLAS ENTERPRISE CHECK: PASSED");
console.log(`Controles verificados: ${required.length + 7}`);

import { readFileSync } from "node:fs";

const security = readFileSync("lib/api/security.ts", "utf8");
const login = readFileSync("app/(auth)/login/page.tsx", "utf8");
const shell = readFileSync("components/atlas/app-shell.tsx", "utf8");
const guard = readFileSync("components/SupabaseGuard.tsx", "utf8");
const authContext = readFileSync("lib/auth/atlas-auth-context.ts", "utf8");
const failures = [];

for (const marker of [
  '.from("profiles")',
  '.select("*")',
  "resolveLegacyAccessRole",
  "resolveLegacyCommercialRole",
  "organizationRecord.status",
  "profileRecord.active !== true",
  "PROFILE_ORGANIZATION_REQUIRED",
]) if (!security.includes(marker)) failures.push(`contexto pós-login sem ${marker}`);

for (const marker of [
  "data.session?.user",
  "confirmServerSession",
  "readSessionFailure",
  "storeAtlasAuthContext",
  'return "/command-center"',
]) if (!login.includes(marker)) failures.push(`cliente pós-login sem ${marker}`);

for (const marker of [
  'ATLAS_AUTH_CONTEXT_KEY = "atlas:auth-context"',
  'fetch("/api/v1/auth/me"',
  'cache: "no-store"',
  "authContextToShellIdentity",
]) if (!authContext.includes(marker)) failures.push(`contexto oficial sem ${marker}`);

if (!shell.includes("readAtlasAuthContext") || !shell.includes("authContextToShellIdentity")) failures.push("shell sem contexto oficial adaptado");
if (shell.includes('.from("profiles")') || shell.includes('.from("organizations")')) failures.push("shell ainda replica autorização do banco no navegador");
if (!guard.includes("fetchAtlasAuthContext") || guard.includes("getSession(") || guard.includes('.from("profiles")')) failures.push("guard não usa exclusivamente o contexto oficial");

if (failures.length) {
  console.error("ATLAS POST LOGIN: FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("ATLAS POST LOGIN: PASSED (Auth → contexto oficial no servidor → organização/RBAC → dashboard adaptativo)");

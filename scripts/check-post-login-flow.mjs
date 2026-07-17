import { readFileSync } from "node:fs";

const security = readFileSync("lib/api/security.ts", "utf8");
const login = readFileSync("app/(auth)/login/page.tsx", "utf8");
const shell = readFileSync("components/atlas/app-shell.tsx", "utf8");
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
  "atlas:auth-context",
  'return "/dashboard"',
]) if (!login.includes(marker)) failures.push(`cliente pós-login sem ${marker}`);

if (!shell.includes('select("*")') || !shell.includes("profile?.name") || !shell.includes("rawAccessRole")) failures.push("shell incompatível com perfil legado");

if (failures.length) {
  console.error("ATLAS POST LOGIN: FAILED");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("ATLAS POST LOGIN: PASSED (Auth → profile legado → organização por status → dashboard adaptativo)");

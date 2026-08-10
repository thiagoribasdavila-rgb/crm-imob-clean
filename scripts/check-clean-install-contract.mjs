import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const errors = [];
const read = (file) => readFileSync(resolve(root, file), "utf8");

for (const file of [
  "INSTALACAO.md",
  "CHECKLIST_FINAL.md",
  "docs/ATLAS_ONE_V1000_CLEAN_RELEASE.md",
  "supabase/seed.sql",
  "app/(auth)/setup/page.tsx",
]) {
  if (!existsSync(resolve(root, file))) errors.push(`arquivo ausente: ${file}`);
}

const seed = read("supabase/seed.sql");
if (/\b(insert|copy|create\s+user)\b/i.test(seed.replace(/--.*$/gm, ""))) {
  errors.push("seed contém dados ou usuários");
}

const route = read("app/api/bootstrap/admin/route.ts");
for (const evidence of [
  '.from("organizations")',
  '.insert({ name, slug, status: "ACTIVE" })',
  'access_role: "admin"',
  'commercial_role: "director"',
  "createdOrganizationId",
  "deleteUser(userId)",
]) {
  if (!route.includes(evidence)) errors.push(`bootstrap sem evidência: ${evidence}`);
}

const setup = read("app/(auth)/setup/page.tsx");
if (!setup.includes('fetch("/api/bootstrap/admin"') || !setup.includes("x-atlas-bootstrap-secret")) {
  errors.push("onboarding não usa a rota protegida");
}
if (/localStorage|sessionStorage/.test(setup)) {
  errors.push("onboarding não pode persistir segredo no navegador");
}

const packaging = read("scripts/package-hostinger.mjs");
for (const evidence of [
  "ATLAS_ONE_V1000_FINAL_CLEAN.zip",
  '"INSTALACAO.md"',
  '"CHECKLIST_FINAL.md"',
  '"supabase/seed.sql"',
  '"app/(auth)/setup/page.tsx"',
]) {
  if (!packaging.includes(evidence)) errors.push(`empacotamento sem evidência: ${evidence}`);
}

const envTemplate = read(".env.homologation.example");
if (!envTemplate.includes("ATLAS_BOOTSTRAP_SECRET=")) {
  errors.push("template de homologação sem segredo temporário");
}

if (errors.length) {
  console.error("ATLAS CLEAN INSTALL: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("ATLAS CLEAN INSTALL: PASSED (zero base, onboarding único, pacote sem segredos)");

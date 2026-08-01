import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/admin-bootstrap.json"), "utf8"));
const route = readFileSync(resolve(root, "app/api/bootstrap/admin/route.ts"), "utf8");
const bootstrap = readFileSync(resolve(root, "scripts/bootstrap-admin.mjs"), "utf8");
const diagnose = readFileSync(resolve(root, "scripts/diagnose-bootstrap.mjs"), "utf8");
const preflight = readFileSync(resolve(root, "scripts/preflight-production.mjs"), "utf8");
const errors = [];

if (!route.includes('process.env.ATLAS_ENV === "development"') || !route.includes('process.env.ATLAS_ENV === "homologation"')) errors.push("rota não restringe ambientes permitidos");
if (!route.includes("timingSafeEqual") || !route.includes("expected.length < 32")) errors.push("segredo sem comparação constante ou força mínima");
if (!route.includes('bootstrap: profilesCount === 0 ? "available" : "locked"')) errors.push("diagnóstico não expõe bloqueio de uso único");
if (!route.includes("bootstrapInProgress") || !route.includes("existingProfiles")) errors.push("rota sem proteção de concorrência e perfil existente");
if (!route.includes('Cache-Control", "no-store')) errors.push("respostas sensíveis podem ser armazenadas");
if (!route.includes("passwordCategories < 3") || !route.includes("password.length > 128")) errors.push("senha inicial sem política completa");
if (!route.includes("deleteUser(userId)")) errors.push("falha de profile não reverte usuário Auth");
if (!bootstrap.includes("--confirm=CREATE_FIRST_ADMIN") || !bootstrap.includes('"development", "homologation"')) errors.push("CLI sem confirmação ou bloqueio de produção");
for (const mutation of ["createUser(", "deleteUser(", '.from("profiles").upsert']) if (diagnose.includes(mutation)) errors.push(`diagnóstico não é somente leitura: ${mutation}`);
if (!diagnose.includes("mutatingActionsPerformed: 0")) errors.push("diagnóstico não declara ausência de mutações");
if (!preflight.includes('!value("ATLAS_BOOTSTRAP_SECRET")')) errors.push("preflight não exige remoção do segredo");
if (contract.diagnosticMode !== "read-only" || contract.forbiddenEnvironment !== "production" || contract.secretMinimumLength !== 32) errors.push("contrato de bootstrap inválido");

if (errors.length) { console.error("ATLAS ADMIN BOOTSTRAP: FAILED"); errors.forEach((error) => console.error(`- ${error}`)); process.exit(1); }
console.log("ATLAS ADMIN BOOTSTRAP: PASSED (uso único; diagnóstico somente leitura; produção bloqueada)");

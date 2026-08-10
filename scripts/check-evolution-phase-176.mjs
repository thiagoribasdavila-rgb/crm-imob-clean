import { existsSync, readFileSync } from "node:fs";
import {
  buildLocalE2ERoleProvisioningPlan,
  evaluateLocalE2EProvisionerEnvironment,
  LOCAL_E2E_PROVISIONER_ENV,
} from "../lib/testing/local-e2e-role-provisioning.mjs";

const fail = (message) => {
  throw new Error(`[phase-176] ${message}`);
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const requiredFiles = [
  "config/evolution-phase-176-conversion-core-local-role-provisioning.json",
  "docs/EVOLUTION_PHASE_176_CONVERSION_CORE_LOCAL_ROLE_PROVISIONING.md",
  "lib/testing/local-e2e-role-provisioning.mjs",
  "scripts/provision-isolated-e2e-roles-phase-176.mjs",
  "scripts/run-conversion-core-isolated-e2e-phase-176.mjs",
  "tests/contracts/conversion-core-local-role-provisioning.test.mjs",
];
for (const path of requiredFiles) {
  if (!existsSync(path)) fail(`arquivo ausente: ${path}`);
}

const config = readJson(requiredFiles[0]);
if (config.phase !== 176 || config.status !== "implemented") fail("fase ou status inválido");
if (config.evidenceLevel !== "local_role_provisioning_contract_ready_runtime_blocked") {
  fail("evidência inflada ou incorreta");
}
if (config.runtimeHomologated !== false) fail("runtime não pode constar homologado");
if (config.provisioningContract.serviceRolePassedToBrowser !== false) {
  fail("chave administrativa não pode alcançar o navegador");
}
if (config.provisioningContract.seedModified !== false) {
  fail("seed limpo não poderia ser alterado");
}
if (config.runtimeEvidence.authenticatedJourneyExecuted !== false) {
  fail("jornada não executada não pode constar aprovada");
}
for (const key of [
  "authenticatedIsolatedRuntimePassed",
  "sourceTraceabilityPassed",
  "buildAllowed",
  "zipAllowed",
  "deployAllowed",
]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}

const plan = buildLocalE2ERoleProvisioningPlan();
if (plan.roles.length !== 4) fail("plano precisa conter quatro papéis");
const manager = plan.roles.find((role) => role.key === "GERENTE");
const broker = plan.roles.find((role) => role.key === "CORRETOR");
if (manager?.reportsTo !== "DIRETOR" || broker?.reportsTo !== "GERENTE") {
  fail("hierarquia oficial foi alterada");
}
const serializedPlan = JSON.stringify(plan);
if (
  plan.secretsIncluded !== false ||
  serializedPlan.includes("local-admin-password") ||
  serializedPlan.includes("@isolated.test")
) {
  fail("plano não pode conter credenciais literais");
}

const assessment = evaluateLocalE2EProvisionerEnvironment({});
if (assessment.ready || !assessment.missing.includes(LOCAL_E2E_PROVISIONER_ENV)) {
  fail("provisionador deveria recusar ambiente vazio");
}

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 176) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const [name, command] of Object.entries({
  "evolution:phase-176:assess": "node scripts/run-conversion-core-isolated-e2e-phase-176.mjs",
  "evolution:phase-176:execute": "node scripts/run-conversion-core-isolated-e2e-phase-176.mjs --execute",
  "evolution:phase-176:provision": "node scripts/provision-isolated-e2e-roles-phase-176.mjs --execute",
  "evolution:phase-176:check": "node scripts/check-evolution-phase-176.mjs",
})) {
  if (packageJson.scripts?.[name] !== command) fail(`script ausente: ${name}`);
}

console.log(
  "[phase-176] PASS — provisionamento local idempotente pronto; runtime, build, ZIP e deploy permanecem bloqueados.",
);

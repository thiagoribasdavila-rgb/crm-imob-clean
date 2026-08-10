import { existsSync, readFileSync } from "node:fs";

const fail = (message) => {
  throw new Error(`[phase-172] ${message}`);
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const configPath = "config/evolution-phase-172-conversion-core-canonical-inventory.json";
const docsPath = "docs/EVOLUTION_PHASE_172_CONVERSION_CORE_CANONICAL_INVENTORY.md";
const testPath = "tests/contracts/conversion-core-canonical-inventory.test.mjs";

for (const path of [configPath, docsPath, testPath]) {
  if (!existsSync(path)) fail(`arquivo ausente: ${path}`);
}

const config = readJson(configPath);
if (config.phase !== 172 || config.status !== "implemented") fail("fase ou status inválido");
if (config.moduleId !== "conversion-core") fail("módulo incorreto");
if (config.capabilities.length !== 6) fail("inventário deve conter seis capacidades");

const ids = new Set();
const frontendOwners = new Set();
const apiOwners = new Set();
for (const capability of config.capabilities) {
  if (ids.has(capability.id)) fail(`capacidade duplicada: ${capability.id}`);
  if (frontendOwners.has(capability.frontendOwner)) fail(`frontend concorrente: ${capability.frontendOwner}`);
  if (apiOwners.has(capability.apiOwner)) fail(`API concorrente: ${capability.apiOwner}`);
  ids.add(capability.id);
  frontendOwners.add(capability.frontendOwner);
  apiOwners.add(capability.apiOwner);

  for (const path of [capability.frontendOwner, capability.apiOwner, ...capability.contractEvidence]) {
    if (!existsSync(path)) fail(`referência inexistente: ${path}`);
  }
  if (capability.status !== "contract_verified_runtime_pending") {
    fail(`capacidade promovida sem runtime: ${capability.id}`);
  }
}

if (config.baseline.canonicalOwnerConflicts !== 0) fail("há conflito de proprietário");
if (config.baseline.authenticatedRuntimeEvidenceComplete !== false) fail("runtime não pode constar como completo");
for (const key of ["databaseMutation", "externalCall", "buildExecuted", "zipGenerated"]) {
  if (config[key] !== false) fail(`${key} deve permanecer false`);
}

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 172) fail("programa principal não avançou para a fase 172");

const packageJson = readJson("package.json");
if (packageJson.scripts?.["evolution:phase-172:check"] !== "node scripts/check-evolution-phase-172.mjs") {
  fail("script npm da fase 172 ausente");
}

console.log("[phase-172] PASS — inventário canônico concluído; runtime, build e ZIP permanecem bloqueados.");

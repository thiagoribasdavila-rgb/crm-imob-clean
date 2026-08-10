import { existsSync, readFileSync } from "node:fs";

const fail = (message) => { throw new Error(`[phase-173] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const read = (path) => readFileSync(path, "utf8");

const configPath = "config/evolution-phase-173-conversion-core-isolated-preflight.json";
const docsPath = "docs/EVOLUTION_PHASE_173_CONVERSION_CORE_ISOLATED_PREFLIGHT.md";
const testPath = "tests/contracts/conversion-core-isolated-preflight.test.mjs";
for (const path of [configPath, docsPath, testPath]) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(configPath);
if (config.phase !== 173 || config.status !== "implemented") fail("fase ou status inválido");
if (config.moduleId !== "conversion-core") fail("módulo incorreto");
if (config.evidenceLevel !== "static_and_contract_preflight" || config.runtimeHomologated !== false) fail("nível de evidência inflado");
if (config.continuityChain.length !== 5 || config.continuityChain.some((item) => item.status !== "verified")) fail("cadeia de continuidade incompleta");

for (const item of config.continuityChain) {
  if (!existsSync(item.source)) fail(`fonte ausente: ${item.source}`);
  const source = read(item.source);
  for (const token of item.requiredEvidence) if (!source.includes(token)) fail(`evidência ausente em ${item.source}: ${token}`);
}
for (const path of config.contractEvidence) if (!existsSync(path)) fail(`contrato ausente: ${path}`);
for (const key of ["productionCredentialsUsed", "productionDatabaseTouched", "externalIntegrationsCalled", "mockDataPromotedAsReal", "buildExecuted", "zipGenerated"]) {
  if (config.safety[key] !== false) fail(`${key} deve permanecer false`);
}
for (const key of ["authenticatedIsolatedRuntimePassed", "sourceTraceabilityPassed", "buildAllowed", "zipAllowed", "deployAllowed"]) {
  if (config.releaseGate[key] !== false) fail(`${key} deve permanecer bloqueado`);
}

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 173) fail("programa principal não avançou para a fase 173");
const packageJson = readJson("package.json");
if (packageJson.scripts?.["evolution:phase-173:check"] !== "node scripts/check-evolution-phase-173.mjs") fail("script npm ausente");

console.log("[phase-173] PASS — continuidade contratual comprovada; runtime isolado, build e ZIP permanecem bloqueados.");

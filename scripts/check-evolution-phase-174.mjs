import { existsSync, readFileSync } from "node:fs";
import {
  evaluateIsolatedE2EEnvironment,
  ISOLATED_E2E_ENV,
} from "../lib/testing/isolated-e2e-readiness.mjs";

const fail = (message) => { throw new Error(`[phase-174] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const requiredFiles = [
  "config/evolution-phase-174-conversion-core-isolated-e2e-gate.json",
  "docs/EVOLUTION_PHASE_174_CONVERSION_CORE_ISOLATED_E2E_GATE.md",
  "lib/testing/isolated-e2e-readiness.mjs",
  "scripts/run-conversion-core-isolated-e2e-phase-174.mjs",
  "tests/contracts/conversion-core-isolated-e2e-gate.test.mjs",
  "tests/e2e/authenticated-journeys.spec.mjs"
];
for (const path of requiredFiles) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(requiredFiles[0]);
if (config.phase !== 174 || config.status !== "implemented") fail("fase ou status inválido");
if (config.evidenceLevel !== "isolated_e2e_gate_ready_runtime_blocked") fail("evidência inflada ou incorreta");
if (config.runtimeHomologated !== false) fail("runtime não pode constar homologado");
if (config.environmentContract.serviceRoleAccepted !== false) fail("service role não pode ser aceita");
if (config.runtimeEvidence.authenticatedJourneyExecuted !== false) fail("jornada não executada não pode constar aprovada");
if (config.runtimeEvidence.workspaceEnvIsolated !== false) fail(".env.local presente precisa bloquear o runtime isolado");
for (const key of ["authenticatedIsolatedRuntimePassed", "sourceTraceabilityPassed", "buildAllowed", "zipAllowed", "deployAllowed"]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}

const values = {
  [ISOLATED_E2E_ENV.baseUrl]: "http://127.0.0.1:3000",
  [ISOLATED_E2E_ENV.supabaseUrl]: "http://127.0.0.1:54321",
  [ISOLATED_E2E_ENV.publishableKey]: "local-key",
  [ISOLATED_E2E_ENV.adminEmail]: "admin@isolated.test",
  [ISOLATED_E2E_ENV.adminPassword]: "admin-password",
  [ISOLATED_E2E_ENV.directorEmail]: "director@isolated.test",
  [ISOLATED_E2E_ENV.directorPassword]: "director-password",
  [ISOLATED_E2E_ENV.managerEmail]: "manager@isolated.test",
  [ISOLATED_E2E_ENV.managerPassword]: "manager-password",
  [ISOLATED_E2E_ENV.brokerEmail]: "broker@isolated.test",
  [ISOLATED_E2E_ENV.brokerPassword]: "broker-password"
};
const localContract = evaluateIsolatedE2EEnvironment(values, {
  dockerAvailable: false,
  localSupabaseAvailable: false,
  workspaceEnvIsolated: false
});
if (!localContract.contractReady || localContract.runtimeReady) fail("gate local não falhou de modo seguro");

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 174) fail("programa principal não avançou");
const packageJson = readJson("package.json");
if (packageJson.scripts?.["evolution:phase-174:check"] !== "node scripts/check-evolution-phase-174.mjs") fail("script de check ausente");
if (packageJson.scripts?.["evolution:phase-174:execute"] !== "node scripts/run-conversion-core-isolated-e2e-phase-174.mjs --execute") fail("script de execução ausente");

console.log("[phase-174] PASS — gate E2E isolado pronto; runtime, build, ZIP e deploy permanecem bloqueados.");

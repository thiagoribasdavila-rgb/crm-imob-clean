import { existsSync, readFileSync } from "node:fs";
import {
  buildMigrationReconciliationPlan,
  loadCurrentRemoteLedgerEvidence,
} from "../lib/testing/supabase-migration-reconciliation-planner.mjs";

const fail = (message) => { throw new Error(`[phase-180] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-180-conversion-core-supabase-migration-reconciliation-planner.json",
  "docs/EVOLUTION_PHASE_180_CONVERSION_CORE_SUPABASE_MIGRATION_RECONCILIATION_PLANNER.md",
  "lib/testing/supabase-migration-reconciliation-planner.mjs",
  "scripts/run-conversion-core-supabase-phase-180.mjs",
  "tests/contracts/conversion-core-supabase-migration-reconciliation-planner.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 180 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
if (config.currentState.historicalSnapshotAcceptedAsCurrent !== false) fail("snapshot histórico foi promovido indevidamente");
const plan = buildMigrationReconciliationPlan({
  root: process.cwd(),
  evidence: loadCurrentRemoteLedgerEvidence(process.cwd()),
});
if (plan.operationalEnvironmentTouched || plan.remoteContacted || plan.remoteWriteExecuted) fail("ambiente operacional tocado");
if (plan.directPushAuthorized || plan.buildAuthorized || plan.zipAuthorized || plan.deployAuthorized) fail("release ou push autorizado sem evidência");
if (plan.historicalSnapshotAcceptedAsCurrent !== false) fail("histórico aceito como evidência atual");
for (const key of ["currentRemoteEvidenceCollected", "migrationHistoryReconciled", "collisionNamesResolved", "directPushAllowed", "buildAllowed", "zipAllowed", "deployAllowed"]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 180) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-180:assess", "evolution:phase-180:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-180] PASS — reconciliação fail-closed preparada; Supabase remoto, migrations, build, ZIP e deploy permanecem intocados.");


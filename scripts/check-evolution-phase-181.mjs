import { existsSync, readFileSync } from "node:fs";
import {
  buildMigrationCollisionLineage,
  loadHistoricalCollisionSnapshot,
} from "../lib/testing/supabase-migration-collision-lineage.mjs";

const fail = (message) => { throw new Error(`[phase-181] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-181-conversion-core-supabase-migration-collision-lineage.json",
  "docs/EVOLUTION_PHASE_181_CONVERSION_CORE_SUPABASE_MIGRATION_COLLISION_LINEAGE.md",
  "lib/testing/supabase-migration-collision-lineage.mjs",
  "scripts/run-conversion-core-supabase-phase-181.mjs",
  "tests/contracts/conversion-core-supabase-migration-collision-lineage.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 181 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");

const lineage = buildMigrationCollisionLineage({
  root: process.cwd(),
  historicalSnapshot: loadHistoricalCollisionSnapshot(process.cwd()),
});
if (lineage.collisionCount !== 3 || lineage.collidingFileCount !== 6) fail("colisões locais divergentes");
if (lineage.matchedHistoricalMappingCount !== 6) fail("linhagem histórica incompleta");
if (lineage.currentResolutionCount !== 0) fail("colisão marcada como resolvida sem prova atual");
if (lineage.historicalSnapshotAcceptedAsCurrent !== false) fail("histórico aceito como evidência atual");
if (lineage.operationalEnvironmentTouched || lineage.currentRemoteContacted || lineage.remoteWriteExecuted) {
  fail("ambiente operacional tocado");
}
for (const key of [
  "migrationApplied",
  "migrationHistoryRepaired",
  "migrationFileRenamed",
  "databaseReset",
  "directPushAuthorized",
  "buildAuthorized",
  "zipAuthorized",
  "deployAuthorized"
]) {
  if (lineage[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
for (const key of [
  "currentNamedRemoteEvidenceCollected",
  "migrationHistoryReconciled",
  "collisionNamesResolved",
  "directPushAllowed",
  "buildAllowed",
  "zipAllowed",
  "deployAllowed"
]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 181) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-181:assess", "evolution:phase-181:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-181] PASS — seis linhagens catalogadas; Supabase remoto, migrations, build, ZIP e deploy permanecem intocados.");

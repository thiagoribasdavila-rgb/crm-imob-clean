import { existsSync, readFileSync } from "node:fs";
import { buildMigrationCollisionDossier } from "../lib/testing/supabase-migration-collision-dossier.mjs";

const fail = (message) => { throw new Error(`[phase-178] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-178-conversion-core-supabase-migration-collision-dossier.json",
  "docs/EVOLUTION_PHASE_178_CONVERSION_CORE_SUPABASE_MIGRATION_COLLISION_DOSSIER.md",
  "lib/testing/supabase-migration-collision-dossier.mjs",
  "scripts/run-conversion-core-supabase-phase-178.mjs",
  "tests/contracts/conversion-core-supabase-migration-collision-dossier.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 178 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime não pode constar homologado");
const dossier = buildMigrationCollisionDossier(process.cwd());
if (dossier.collisionCount !== 3) fail("inventário de colisões divergente");
if (dossier.migrationCount !== config.collisionEvidence.migrationFiles) fail("inventário de migrations divergente");
if (dossier.uniqueVersionCount !== config.collisionEvidence.uniqueVersions) fail("versões únicas divergentes");
if (dossier.resolved) fail("colisões não podem constar resolvidas sem evidência remota");
for (const collision of dossier.collisions) {
  if (collision.safeToRename || collision.safeToApply || collision.safeToRepairHistory) {
    fail(`ação insegura autorizada para ${collision.version}`);
  }
}
for (const key of ["remoteHistoryEvidenceCollected", "migrationHistoryReconciled", "localMigrationRuntimePassed", "sourceTraceabilityPassed", "buildAllowed", "zipAllowed", "deployAllowed"]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 178) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-178:assess", "evolution:phase-178:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-178] PASS — dossiê estático gerado; histórico remoto, build, ZIP e deploy permanecem bloqueados.");


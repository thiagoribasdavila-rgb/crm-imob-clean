import { existsSync, readFileSync } from "node:fs";
import {
  assertLocalOnlySupabaseCommand,
  evaluateLocalMigrationGate,
} from "../lib/testing/local-supabase-migration-gate.mjs";

const fail = (message) => { throw new Error(`[phase-177] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-177-conversion-core-local-supabase-migration-gate.json",
  "docs/EVOLUTION_PHASE_177_CONVERSION_CORE_LOCAL_SUPABASE_MIGRATION_GATE.md",
  "lib/testing/local-supabase-migration-gate.mjs",
  "scripts/run-conversion-core-local-supabase-phase-177.mjs",
  "tests/contracts/conversion-core-local-supabase-migration-gate.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 177 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime não pode constar homologado");
for (const key of ["localMigrationRuntimePassed", "migrationHistoryReconciled", "sourceTraceabilityPassed", "buildAllowed", "zipAllowed", "deployAllowed"]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const assessment = evaluateLocalMigrationGate({
  runtime: { dockerAvailable: false, supabaseCliAvailable: true },
});
if (assessment.ready) fail("workspace real não pode passar com timestamps duplicados e sem Docker");
if (assessment.catalog.migrationCount !== config.migrationEvidence.migrationFiles) fail("inventário divergente");
if (assessment.catalog.duplicates.length !== config.migrationEvidence.duplicateVersions) fail("duplicidades divergentes");
assertLocalOnlySupabaseCommand(["db", "reset", "--local", "--no-seed"]);
for (const command of [["db", "push"], ["migration", "repair"], ["db", "reset", "--linked"]]) {
  try { assertLocalOnlySupabaseCommand(command); fail(`comando remoto aceito: ${command.join(" ")}`); } catch (error) {
    if (String(error).includes("comando remoto aceito")) throw error;
  }
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 177) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-177:assess", "evolution:phase-177:execute", "evolution:phase-177:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-177] PASS — gate local implementado; remoto, build, ZIP e deploy permanecem bloqueados.");


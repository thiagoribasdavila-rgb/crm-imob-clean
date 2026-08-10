import { existsSync, readFileSync } from "node:fs";
import { assessRemoteMigrationLedgerCollection } from "../lib/testing/supabase-remote-migration-ledger-collector.mjs";

const fail = (message) => { throw new Error(`[phase-179] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-179-conversion-core-supabase-read-only-ledger-collector.json",
  "docs/EVOLUTION_PHASE_179_CONVERSION_CORE_SUPABASE_READ_ONLY_LEDGER_COLLECTOR.md",
  "lib/testing/supabase-remote-migration-ledger-collector.mjs",
  "scripts/run-conversion-core-supabase-phase-179.mjs",
  "tests/contracts/conversion-core-supabase-remote-ledger-collector.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);
const config = readJson(required[0]);
if (config.phase !== 179 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
if (config.legacySnapshot.acceptedAsCurrentEvidence !== false) fail("snapshot legado não pode provar o estado atual");
const preflight = assessRemoteMigrationLedgerCollection({ argv: [], env: {} });
if (preflight.status !== "preflight_only_remote_not_contacted" || preflight.remoteContacted) fail("preflight deveria permanecer totalmente local");
for (const key of ["remoteHistoryEvidenceCollected", "migrationHistoryReconciled", "collisionNamesResolved", "directPushAllowed", "buildAllowed", "zipAllowed", "deployAllowed"]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 179) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-179:assess", "evolution:phase-179:collect", "evolution:phase-179:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-179] PASS — coletor read-only preparado; nenhuma conexão remota, escrita, migration, build, ZIP ou deploy foi executado.");


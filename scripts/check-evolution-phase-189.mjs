import { existsSync, readFileSync } from "node:fs";
import { createNamedRemoteCaptureReceiptLedgerCheckpoint } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint.mjs";

const fail = (message) => { throw new Error(`[phase-189] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-189-conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint.json",
  "docs/EVOLUTION_PHASE_189_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint.mjs",
  "scripts/run-conversion-core-supabase-phase-189.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 189 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = createNamedRemoteCaptureReceiptLedgerCheckpoint();
if (blocked.ok !== false || blocked.reason !== "receipt_ledger_directory_required") {
  fail("ausência de diretórios privados deveria falhar fechada");
}
for (const key of Object.keys(config.safety)) {
  if (config.safety[key] !== false) fail(`${key} deveria permanecer falso`);
}
for (const key of [
  "authorizationRecorded",
  "authorizationConsumed",
  "handoffIssued",
  "procedureExecuted",
  "currentNamedRemoteEvidenceCollected",
  "migrationHistoryReconciled",
  "collisionNamesResolved",
  "buildAllowed",
  "zipAllowed",
  "deployAllowed",
]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 189) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-189:assess", "evolution:phase-189:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-189] PASS — checkpoint local imutável e verificável; remoto, banco e release permanecem intocados.");

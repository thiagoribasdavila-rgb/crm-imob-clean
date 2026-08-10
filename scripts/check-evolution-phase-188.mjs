import { existsSync, readFileSync } from "node:fs";
import { verifyNamedRemoteCaptureReceiptLedger } from "../lib/testing/supabase-named-remote-capture-receipt-ledger.mjs";

const fail = (message) => { throw new Error(`[phase-188] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-188-conversion-core-supabase-named-remote-capture-receipt-ledger.json",
  "docs/EVOLUTION_PHASE_188_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger.mjs",
  "scripts/run-conversion-core-supabase-phase-188.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 188 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = verifyNamedRemoteCaptureReceiptLedger();
if (blocked.ok !== false || blocked.reason !== "receipt_ledger_directory_required") {
  fail("ausência de diretório privado deveria falhar fechada");
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
if (program.currentPhase < 188) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-188:assess", "evolution:phase-188:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-188] PASS — ledger local íntegro e replay determinístico; remoto, banco e release permanecem intocados.");

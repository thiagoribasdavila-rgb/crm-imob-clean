import { existsSync, readFileSync } from "node:fs";
import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChain } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain.mjs";

const fail = (message) => { throw new Error(`[phase-190] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-190-conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain.json",
  "docs/EVOLUTION_PHASE_190_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain.mjs",
  "scripts/run-conversion-core-supabase-phase-190.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 190 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = verifyNamedRemoteCaptureReceiptLedgerCheckpointChain();
if (blocked.ok !== false || blocked.reason !== "checkpoint_chain_head_file_name_invalid") {
  fail("ausência de head deveria falhar fechada");
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
if (program.currentPhase < 190) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-190:assess", "evolution:phase-190:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-190] PASS — cadeia hash local detecta remoção, reordenação, órfãos e adulteração; remoto, banco e release permanecem intocados.");

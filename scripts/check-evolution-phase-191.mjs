import { existsSync, readFileSync } from "node:fs";
import { inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.mjs";

const fail = (message) => { throw new Error(`[phase-191] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-191-conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.json",
  "docs/EVOLUTION_PHASE_191_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.mjs",
  "scripts/run-conversion-core-supabase-phase-191.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 191 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof();
if (blocked.ok !== false || blocked.reason !== "checkpoint_chain_proof_file_name_invalid") {
  fail("ausência de prova deveria falhar fechada");
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
if (program.currentPhase < 191) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-191:assess", "evolution:phase-191:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-191] PASS — prova portátil redigida preserva somente hashes e contagens, valida a origem e mantém remoto, banco e release intocados.");

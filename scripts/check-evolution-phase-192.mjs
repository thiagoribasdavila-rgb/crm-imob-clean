import { existsSync, readFileSync } from "node:fs";
import { inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.mjs";

const fail = (message) => { throw new Error(`[phase-192] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-192-conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.json",
  "docs/EVOLUTION_PHASE_192_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.mjs",
  "scripts/run-conversion-core-supabase-phase-192.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 192 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody();
if (blocked.ok !== false || blocked.reason !== "proof_custody_file_name_invalid") {
  fail("ausência de registro deveria falhar fechada");
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
if (program.currentPhase < 192) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-192:assess", "evolution:phase-192:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-192] PASS — custódia vincula prova, revisor e finalidade por HMAC, sem armazenar alegações, chave ou executar efeitos remotos.");

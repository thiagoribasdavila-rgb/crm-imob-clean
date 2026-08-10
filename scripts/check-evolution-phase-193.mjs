import { existsSync, readFileSync } from "node:fs";
import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.mjs";

const fail = (message) => { throw new Error(`[phase-193] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-193-conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.json",
  "docs/EVOLUTION_PHASE_193_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.mjs",
  "scripts/run-conversion-core-supabase-phase-193.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 193 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex();
if (blocked.ok !== false || blocked.reason !== "proof_custody_index_head_file_name_invalid") {
  fail("ausência de índice deveria falhar fechada");
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
for (const key of [
  "reviewerIncluded",
  "purposeIncluded",
  "pseudonymizationKeyIncluded",
  "pseudonymsIncluded",
  "credentialsIncluded",
  "personalDataIncluded",
]) {
  if (config.currentState[key] !== false) fail(`${key} deveria permanecer falso`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 193) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-193:assess", "evolution:phase-193:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-193] PASS — índice privado append-only vincula custódias e provas por hash, sem copiar alegações, pseudônimos, chave ou executar efeitos remotos.");

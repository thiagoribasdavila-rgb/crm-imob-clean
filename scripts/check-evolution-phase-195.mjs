import { existsSync, readFileSync } from "node:fs";
import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot-export-authorization.mjs";

const fail = (message) => { throw new Error(`[phase-195] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-195-conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot-export-authorization.json",
  "docs/EVOLUTION_PHASE_195_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_EXPORT_AUTHORIZATION.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot-export-authorization.mjs",
  "scripts/run-conversion-core-supabase-phase-195.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot-export-authorization.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 195 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization();
if (blocked.ok !== false || blocked.reason !== "snapshot_export_authorization_file_name_invalid") {
  fail("ausência de manifesto deveria falhar fechada");
}
for (const [key, value] of Object.entries(config.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);
for (const [key, value] of Object.entries(config.releaseGate)) if (value !== false) fail(`${key} deveria permanecer bloqueado`);
for (const key of ["recipientIncluded", "approverIncluded", "credentialsIncluded", "personalDataIncluded"]) {
  if (config.currentState[key] !== false) fail(`${key} deveria permanecer falso`);
}
if (config.currentState.maximumValidityMinutes !== 15) fail("validade máxima deveria ser quinze minutos");
if (readJson("config/evolution-program-3000.json").currentPhase < 195) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-195:assess", "evolution:phase-195:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-195] PASS — autorização separada, curta e pseudonimizada vincula um único snapshot sem executar exportação ou efeitos remotos.");

import { existsSync, readFileSync } from "node:fs";
import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.mjs";

const fail = (message) => { throw new Error(`[phase-194] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-194-conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.json",
  "docs/EVOLUTION_PHASE_194_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT.md",
  "lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.mjs",
  "scripts/run-conversion-core-supabase-phase-194.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 194 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot();
if (blocked.ok !== false || blocked.reason !== "proof_custody_index_snapshot_file_name_invalid") {
  fail("ausência de snapshot deveria falhar fechada");
}
for (const [key, value] of Object.entries(config.safety)) if (value !== false) fail(`${key} deveria permanecer falso`);
for (const [key, value] of Object.entries(config.releaseGate)) if (value !== false) fail(`${key} deveria permanecer bloqueado`);
for (const key of ["claimsIncluded", "reviewerIncluded", "purposeIncluded", "pseudonymizationKeyIncluded", "pseudonymsIncluded", "credentialsIncluded", "personalDataIncluded"]) {
  if (config.currentState[key] !== false) fail(`${key} deveria permanecer falso`);
}
if (readJson("config/evolution-program-3000.json").currentPhase < 194) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-194:assess", "evolution:phase-194:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-194] PASS — snapshot portátil verifica cada hash contra o índice privado, sem carregar alegações, pseudônimos, credenciais ou efeitos remotos.");

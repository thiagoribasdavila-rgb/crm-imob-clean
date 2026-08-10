import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.mjs";

const assessment = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot();

console.log(JSON.stringify({
  phase: 194,
  mode: "local_portable_proof_custody_index_snapshot",
  ...assessment,
}, null, 2));
console.error("[phase-194] Sem snapshot privado explicitamente informado, nenhuma leitura ou escrita ocorre; remoto, banco, migrations e release permanecem intocados.");

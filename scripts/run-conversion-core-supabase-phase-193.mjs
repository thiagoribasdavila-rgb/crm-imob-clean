import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.mjs";

const assessment = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex();

console.log(JSON.stringify({
  phase: 193,
  mode: "local_private_append_only_proof_custody_index",
  ...assessment,
}, null, 2));
console.error("[phase-193] Sem índice e head privados explicitamente informados, nenhuma entrada é criada ou lida; custódias, pseudônimos, remoto, banco e release permanecem intocados.");

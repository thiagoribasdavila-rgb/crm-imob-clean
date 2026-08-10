import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChain } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain.mjs";

const assessment = verifyNamedRemoteCaptureReceiptLedgerCheckpointChain();

console.log(JSON.stringify({
  phase: 190,
  mode: "local_private_receipt_ledger_checkpoint_hash_chain",
  ...assessment,
}, null, 2));
console.error("[phase-190] Sem head e diretórios privados explicitamente informados, nenhuma cadeia é criada ou lida; remoto, banco e release permanecem intocados.");

import { inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.mjs";

const assessment = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof();

console.log(JSON.stringify({
  phase: 191,
  mode: "local_private_redacted_checkpoint_chain_proof",
  ...assessment,
}, null, 2));
console.error("[phase-191] Sem prova e diretório privado explicitamente informados, nenhum arquivo é criado ou lido; remoto, banco e release permanecem intocados.");

import { inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.mjs";

const assessment = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody();

console.log(JSON.stringify({
  phase: 192,
  mode: "local_private_pseudonymized_proof_custody",
  ...assessment,
}, null, 2));
console.error("[phase-192] Sem registro e diretório privado explicitamente informados, nenhum arquivo é criado ou lido; revisor, finalidade, chave, remoto, banco e release permanecem intocados.");

import { createNamedRemoteCaptureReceiptLedgerCheckpoint } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint.mjs";

const assessment = createNamedRemoteCaptureReceiptLedgerCheckpoint();

console.log(JSON.stringify({
  phase: 189,
  mode: "local_private_receipt_ledger_immutable_checkpoint",
  ...assessment,
}, null, 2));
console.error("[phase-189] Sem diretórios privados explicitamente informados, nenhum checkpoint é criado; remoto, banco e release permanecem intocados.");

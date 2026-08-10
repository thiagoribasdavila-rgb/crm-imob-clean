import { verifyNamedRemoteCaptureReceiptLedger } from "../lib/testing/supabase-named-remote-capture-receipt-ledger.mjs";

const assessment = verifyNamedRemoteCaptureReceiptLedger();

console.log(JSON.stringify({
  phase: 188,
  mode: "local_private_receipt_ledger_integrity_replay",
  ...assessment,
}, null, 2));
console.error("[phase-188] Sem diretório privado explicitamente informado, a verificação falha fechada; remoto, banco e release permanecem intocados.");

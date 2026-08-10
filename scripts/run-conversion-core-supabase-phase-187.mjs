import { buildNamedRemoteCaptureConsumptionReceipt } from "../lib/testing/supabase-named-remote-capture-consumption-receipt.mjs";

const assessment = buildNamedRemoteCaptureConsumptionReceipt();

console.log(JSON.stringify({
  phase: 187,
  mode: "local_immutable_idempotent_consumption_receipt",
  ...assessment,
}, null, 2));
console.error("[phase-187] Sem handoff consumido válido, nenhum recibo é criado; remoto, banco e release permanecem intocados.");

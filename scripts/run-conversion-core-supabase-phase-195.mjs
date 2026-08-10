import { verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization } from "../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot-export-authorization.mjs";

const assessment = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization();

console.log(JSON.stringify({
  phase: 195,
  mode: "local_private_snapshot_export_authorization",
  ...assessment,
}, null, 2));
console.error("[phase-195] Sem manifesto privado explicitamente informado, nenhuma autorização ou exportação ocorre; remoto, banco, migrations e release permanecem intocados.");

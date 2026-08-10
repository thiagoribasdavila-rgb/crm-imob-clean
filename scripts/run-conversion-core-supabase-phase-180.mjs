import {
  buildMigrationReconciliationPlan,
  loadCurrentRemoteLedgerEvidence,
} from "../lib/testing/supabase-migration-reconciliation-planner.mjs";

const root = process.cwd();
const evidence = loadCurrentRemoteLedgerEvidence(root);
const plan = buildMigrationReconciliationPlan({ root, evidence });
console.log(JSON.stringify({ phase: 180, mode: "local_fail_closed_reconciliation_plan", ...plan }, null, 2));
if (!plan.evidenceAccepted) {
  console.error("[phase-180] Bloqueado com segurança: falta evidência remota atual produzida pela fase 179.");
}


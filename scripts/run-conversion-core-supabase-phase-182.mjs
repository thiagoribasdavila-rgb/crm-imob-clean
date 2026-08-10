import { assessNamedRemoteMigrationEvidence } from "../lib/testing/supabase-named-remote-evidence-contract.mjs";

const assessment = assessNamedRemoteMigrationEvidence({ root: process.cwd() });
console.log(JSON.stringify({ phase: 182, mode: "local_named_remote_evidence_contract", ...assessment }, null, 2));
console.error(
  "[phase-182] Contrato criado localmente; nenhuma evidência remota foi coletada e toda mutação/release permanece bloqueada.",
);

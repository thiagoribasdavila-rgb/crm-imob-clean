import { assessNamedRemoteCaptureAuthorization } from "../lib/testing/supabase-named-remote-capture-authorization-gate.mjs";

const assessment = assessNamedRemoteCaptureAuthorization({ root: process.cwd() });

console.log(JSON.stringify({
  phase: 185,
  mode: "local_hash_bound_human_authorization_gate",
  ...assessment,
}, null, 2));
console.error("[phase-185] Gate local aguardando revisão humana; nenhum executor remoto foi criado ou acionado.");

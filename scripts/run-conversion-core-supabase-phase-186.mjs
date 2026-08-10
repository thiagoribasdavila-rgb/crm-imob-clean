import { createNamedRemoteCaptureHandoffSession } from "../lib/testing/supabase-named-remote-capture-handoff.mjs";

const assessment = createNamedRemoteCaptureHandoffSession({ root: process.cwd() });

console.log(JSON.stringify({
  phase: 186,
  mode: "local_ephemeral_single_use_adapter_handoff",
  ...assessment,
}, (_key, value) => typeof value === "function" ? "[process-local function]" : value, 2));
console.error("[phase-186] Sem revisão válida, o handoff falha fechado; nenhum contato remoto foi realizado.");

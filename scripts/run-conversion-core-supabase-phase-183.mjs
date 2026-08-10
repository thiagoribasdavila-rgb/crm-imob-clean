import { buildNamedRemoteCaptureTemplate } from "../lib/testing/supabase-named-remote-capture-adapter.mjs";

const template = buildNamedRemoteCaptureTemplate({ root: process.cwd() });
console.log(JSON.stringify({
  phase: 183,
  mode: "local_named_remote_capture_adapter_template",
  status: "adapter_ready_remote_capture_not_performed",
  template,
  remoteContacted: false,
  remoteWriteExecuted: false,
  migrationApplied: false,
  migrationHistoryRepaired: false,
  migrationFileRenamed: false,
  buildAuthorized: false,
  zipAuthorized: false,
  deployAuthorized: false,
}, null, 2));
console.error("[phase-183] Adaptador local pronto; nenhuma captura remota foi executada e toda mutação/release permanece bloqueada.");


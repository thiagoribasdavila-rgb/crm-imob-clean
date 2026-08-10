import {
  buildNamedRemoteCaptureProcedure,
  validateNamedRemoteCaptureProcedure,
} from "../lib/testing/supabase-named-remote-capture-procedure.mjs";

const procedure = buildNamedRemoteCaptureProcedure({ root: process.cwd() });
const validation = validateNamedRemoteCaptureProcedure(procedure, { root: process.cwd() });

console.log(JSON.stringify({
  phase: 184,
  mode: "local_single_use_named_remote_capture_procedure",
  status: validation.reason,
  procedure,
  remoteContacted: false,
  remoteWriteExecuted: false,
  migrationApplied: false,
  migrationHistoryRepaired: false,
  migrationFileRenamed: false,
  buildAuthorized: false,
  zipAuthorized: false,
  deployAuthorized: false,
}, null, 2));
console.error("[phase-184] Procedimento preparado e não executado; contato remoto e toda mutação/release continuam bloqueados.");

import { existsSync, readFileSync } from "node:fs";
import { createNamedRemoteCaptureHandoffSession } from "../lib/testing/supabase-named-remote-capture-handoff.mjs";

const fail = (message) => { throw new Error(`[phase-186] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-186-conversion-core-supabase-named-remote-capture-handoff.json",
  "docs/EVOLUTION_PHASE_186_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_HANDOFF.md",
  "lib/testing/supabase-named-remote-capture-handoff.mjs",
  "scripts/run-conversion-core-supabase-phase-186.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-handoff.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 186 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = createNamedRemoteCaptureHandoffSession({ root: process.cwd() });
if (blocked.ok !== false || blocked.reason !== "handoff_authorization_review_invalid") {
  fail("ausência de autorização deveria impedir criação do handoff");
}
for (const key of Object.keys(config.safety)) {
  if (config.safety[key] !== false) fail(`${key} deveria permanecer falso`);
}
for (const key of [
  "authorizationRecorded",
  "authorizationConsumed",
  "handoffIssued",
  "procedureExecuted",
  "currentNamedRemoteEvidenceCollected",
  "migrationHistoryReconciled",
  "collisionNamesResolved",
  "buildAllowed",
  "zipAllowed",
  "deployAllowed",
]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 186) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-186:assess", "evolution:phase-186:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-186] PASS — handoff local é curto, de uso único e fail-closed; remoto e release permanecem intocados.");

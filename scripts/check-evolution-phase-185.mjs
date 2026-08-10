import { existsSync, readFileSync } from "node:fs";
import {
  assessNamedRemoteCaptureAuthorization,
  buildNamedRemoteCaptureAuthorizationRequest,
} from "../lib/testing/supabase-named-remote-capture-authorization-gate.mjs";

const fail = (message) => { throw new Error(`[phase-185] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-185-conversion-core-supabase-named-remote-capture-authorization-gate.json",
  "docs/EVOLUTION_PHASE_185_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_AUTHORIZATION_GATE.md",
  "lib/testing/supabase-named-remote-capture-authorization-gate.mjs",
  "scripts/run-conversion-core-supabase-phase-185.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-authorization-gate.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 185 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const request = buildNamedRemoteCaptureAuthorizationRequest({ root: process.cwd() });
if (
  request.executionAvailableInThisPhase !== false ||
  request.operationBinding.requiredLogicalNameCount !== 6 ||
  request.reviewRequirements.maximumValidityMinutes !== 15
) fail("pedido de autorização local inválido");
const assessment = assessNamedRemoteCaptureAuthorization({ root: process.cwd() });
if (assessment.valid !== false || assessment.remoteExecutionAuthorized !== false) {
  fail("ausência de revisão deveria falhar fechada");
}
for (const key of Object.keys(config.safety)) {
  if (config.safety[key] !== false) fail(`${key} deveria permanecer falso`);
}
for (const key of [
  "authorizationRecorded",
  "authorizationConsumed",
  "procedureExecuted",
  "currentNamedRemoteEvidenceCollected",
  "migrationHistoryReconciled",
  "collisionNamesResolved",
  "directPushAllowed",
  "buildAllowed",
  "zipAllowed",
  "deployAllowed",
]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 185) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-185:assess", "evolution:phase-185:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-185] PASS — gate local fail-closed; remoto, migrations, build, ZIP e deploy permanecem intocados.");

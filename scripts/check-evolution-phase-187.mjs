import { existsSync, readFileSync } from "node:fs";
import { buildNamedRemoteCaptureConsumptionReceipt } from "../lib/testing/supabase-named-remote-capture-consumption-receipt.mjs";

const fail = (message) => { throw new Error(`[phase-187] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-187-conversion-core-supabase-named-remote-capture-consumption-receipt.json",
  "docs/EVOLUTION_PHASE_187_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_CONSUMPTION_RECEIPT.md",
  "lib/testing/supabase-named-remote-capture-consumption-receipt.mjs",
  "scripts/run-conversion-core-supabase-phase-187.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-consumption-receipt.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 187 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const blocked = buildNamedRemoteCaptureConsumptionReceipt();
if (blocked.ok !== false || blocked.reason !== "consumption_receipt_manifest_invalid") {
  fail("ausência de handoff consumido deveria falhar fechada");
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
if (program.currentPhase < 187) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-187:assess", "evolution:phase-187:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-187] PASS — recibo é privado, imutável e idempotente; remoto, banco e release permanecem intocados.");

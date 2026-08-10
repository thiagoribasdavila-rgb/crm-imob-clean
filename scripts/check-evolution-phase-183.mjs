import { existsSync, readFileSync } from "node:fs";
import { buildNamedRemoteCaptureTemplate } from "../lib/testing/supabase-named-remote-capture-adapter.mjs";

const fail = (message) => { throw new Error(`[phase-183] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-183-conversion-core-supabase-named-remote-capture-adapter.json",
  "docs/EVOLUTION_PHASE_183_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_ADAPTER.md",
  "lib/testing/supabase-named-remote-capture-adapter.mjs",
  "scripts/run-conversion-core-supabase-phase-183.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-adapter.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 183 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const template = buildNamedRemoteCaptureTemplate({ root: process.cwd() });
if (template.requiredLogicalNames.length !== 6) fail("template deveria listar seis nomes lógicos");
if (template.remoteContacted !== false || template.migrations.length !== 0) fail("template não pode simular captura");
if (template.sqlBodiesIncluded || template.secretsIncluded) fail("template reteve conteúdo proibido");
for (const key of [
  "remoteContacted",
  "remoteWriteExecuted",
  "migrationApplied",
  "migrationHistoryRepaired",
  "migrationFileRenamed",
  "databaseReset",
  "buildExecuted",
  "zipGenerated",
  "deployExecuted",
]) {
  if (config.safety[key] !== false) fail(`${key} deveria permanecer falso`);
}
for (const key of [
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
if (program.currentPhase < 183) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-183:assess", "evolution:phase-183:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-183] PASS — adaptador local validado; remoto, migrations, build, ZIP e deploy permanecem intocados.");


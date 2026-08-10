import { existsSync, readFileSync } from "node:fs";
import {
  buildNamedRemoteCaptureProcedure,
  validateNamedRemoteCaptureProcedure,
  validateReadOnlyNamedMetadataSql,
} from "../lib/testing/supabase-named-remote-capture-procedure.mjs";

const fail = (message) => { throw new Error(`[phase-184] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-184-conversion-core-supabase-named-remote-capture-procedure.json",
  "docs/EVOLUTION_PHASE_184_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_CAPTURE_PROCEDURE.md",
  "lib/testing/supabase-named-remote-capture-procedure.mjs",
  "scripts/run-conversion-core-supabase-phase-184.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-capture-procedure.test.mjs",
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 184 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
if (!validateReadOnlyNamedMetadataSql().valid) fail("consulta fixa deixou de ser somente leitura");
const procedure = buildNamedRemoteCaptureProcedure({ root: process.cwd() });
const validation = validateNamedRemoteCaptureProcedure(procedure, { root: process.cwd() });
if (!validation.valid || validation.requiredLogicalNameCount !== 6) fail("procedimento local inválido");
for (const key of Object.keys(config.safety)) {
  if (config.safety[key] !== false) fail(`${key} deveria permanecer falso`);
}
for (const key of [
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
if (program.currentPhase < 184) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-184:assess", "evolution:phase-184:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-184] PASS — procedimento somente leitura preparado; remoto, migrations, build, ZIP e deploy permanecem intocados.");

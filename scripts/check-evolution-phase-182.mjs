import { existsSync, readFileSync } from "node:fs";
import { assessNamedRemoteMigrationEvidence } from "../lib/testing/supabase-named-remote-evidence-contract.mjs";

const fail = (message) => { throw new Error(`[phase-182] ${message}`); };
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const required = [
  "config/evolution-phase-182-conversion-core-supabase-named-remote-evidence-contract.json",
  "docs/EVOLUTION_PHASE_182_CONVERSION_CORE_SUPABASE_NAMED_REMOTE_EVIDENCE_CONTRACT.md",
  "lib/testing/supabase-named-remote-evidence-contract.mjs",
  "scripts/run-conversion-core-supabase-phase-182.mjs",
  "tests/contracts/conversion-core-supabase-named-remote-evidence-contract.test.mjs"
];
for (const path of required) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const config = readJson(required[0]);
if (config.phase !== 182 || config.status !== "implemented") fail("fase ou status inválido");
if (config.runtimeHomologated !== false) fail("runtime remoto não pode constar homologado");
const assessment = assessNamedRemoteMigrationEvidence({ root: process.cwd() });
if (assessment.status !== "blocked_current_named_remote_evidence_unavailable") fail("avaliação deveria falhar fechada");
if (assessment.evidenceRequest.requiredMappingCount !== 6) fail("contrato deveria exigir seis mapeamentos");
if (assessment.evidenceRequest.sqlBodiesIncluded || assessment.evidenceRequest.secretsIncluded) fail("contrato reteve conteúdo proibido");
for (const key of [
  "currentRemoteContacted",
  "operationalEnvironmentTouched",
  "remoteWriteExecuted",
  "migrationApplied",
  "migrationHistoryRepaired",
  "migrationFileRenamed",
  "databaseReset",
  "directPushAuthorized",
  "buildAuthorized",
  "zipAuthorized",
  "deployAuthorized"
]) {
  if (assessment[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
for (const key of [
  "currentNamedRemoteEvidenceCollected",
  "migrationHistoryReconciled",
  "collisionNamesResolved",
  "directPushAllowed",
  "buildAllowed",
  "zipAllowed",
  "deployAllowed"
]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}
const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 182) fail("programa principal não avançou");
const packageJson = readJson("package.json");
for (const name of ["evolution:phase-182:assess", "evolution:phase-182:check"]) {
  if (!packageJson.scripts?.[name]) fail(`script ausente: ${name}`);
}
console.log("[phase-182] PASS — contrato exige seis provas atuais; remoto, migrations, build, ZIP e deploy permanecem intocados.");

import { existsSync, readFileSync } from "node:fs";
import { assessDisposableWorkspacePlan } from "../lib/testing/disposable-workspace.mjs";

const fail = (message) => {
  throw new Error(`[phase-175] ${message}`);
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const requiredFiles = [
  "config/evolution-phase-175-conversion-core-disposable-workspace.json",
  "docs/EVOLUTION_PHASE_175_CONVERSION_CORE_DISPOSABLE_WORKSPACE.md",
  "lib/testing/disposable-workspace.mjs",
  "scripts/run-conversion-core-isolated-e2e-phase-175.mjs",
  "tests/contracts/conversion-core-disposable-workspace.test.mjs",
];
for (const path of requiredFiles) {
  if (!existsSync(path)) fail(`arquivo ausente: ${path}`);
}

const config = readJson(requiredFiles[0]);
if (config.phase !== 175 || config.status !== "implemented") fail("fase ou status inválido");
if (config.evidenceLevel !== "disposable_workspace_ready_runtime_blocked") {
  fail("evidência inflada ou incorreta");
}
if (config.runtimeHomologated !== false) fail("runtime não pode constar homologado");
if (config.isolationContract.sourceEnvironmentCopied !== false) fail(".env não pode ser copiado");
if (config.isolationContract.sourceSymlinksCopied !== false) fail("symlink de origem não pode ser copiado");
if (config.runtimeEvidence.authenticatedJourneyExecuted !== false) {
  fail("jornada não executada não pode constar aprovada");
}
for (const key of [
  "authenticatedIsolatedRuntimePassed",
  "sourceTraceabilityPassed",
  "buildAllowed",
  "zipAllowed",
  "deployAllowed",
]) {
  if (config.releaseGate[key] !== false) fail(`${key} deveria permanecer bloqueado`);
}

const plan = assessDisposableWorkspacePlan(process.cwd());
if (!plan.ready) fail(`workspace canônico incompleto: ${plan.missing.join(", ")}`);
if (!plan.sourceEnvironmentPresent.includes(".env.local")) {
  fail("avaliação precisa detectar .env.local sem ler seu conteúdo");
}

const program = readJson("config/evolution-program-3000.json");
if (program.currentPhase < 175) fail("programa principal não avançou");
const packageJson = readJson("package.json");
if (
  packageJson.scripts?.["evolution:phase-175:check"] !==
  "node scripts/check-evolution-phase-175.mjs"
) {
  fail("script de check ausente");
}
if (
  packageJson.scripts?.["evolution:phase-175:execute"] !==
  "node scripts/run-conversion-core-isolated-e2e-phase-175.mjs --execute"
) {
  fail("script de execução ausente");
}

console.log(
  "[phase-175] PASS — workspace descartável pronto; runtime, build, ZIP e deploy permanecem bloqueados.",
);

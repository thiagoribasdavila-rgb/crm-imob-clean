import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createIsolatedPlaywrightEnvironment,
  evaluateIsolatedE2EEnvironment,
} from "../lib/testing/isolated-e2e-readiness.mjs";
import {
  assessDisposableWorkspacePlan,
  cleanupDisposableWorkspace,
  createDisposableWorkspace,
} from "../lib/testing/disposable-workspace.mjs";

const execute = process.argv.includes("--execute");
const sourceRoot = process.cwd();

function commandAvailable(command, args, cwd = sourceRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "ignore",
    timeout: 20_000,
  });
  return result.status === 0;
}

const plan = assessDisposableWorkspacePlan(sourceRoot);
const runtimeProbe = {
  dockerAvailable: commandAvailable("docker", ["info"]),
  localSupabaseAvailable: commandAvailable("supabase", [
    "status",
    "--output",
    "json",
  ]),
  workspaceEnvIsolated: false,
};
const contract = evaluateIsolatedE2EEnvironment(process.env, runtimeProbe);

console.log(
  JSON.stringify(
    {
      phase: 175,
      mode: execute ? "execute" : "assess",
      contractReady: contract.contractReady,
      disposableWorkspacePlanReady: plan.ready,
      sourceEnvironmentFilesDetected: plan.sourceEnvironmentPresent,
      runtime: runtimeProbe,
      missingVariableNames: contract.missing,
      missingWorkspacePaths: plan.missing,
      secretsPrinted: false,
      operationalEnvironmentTouched: false,
    },
    null,
    2,
  ),
);

if (!execute) process.exit(0);
if (
  !contract.contractReady ||
  !plan.ready ||
  !runtimeProbe.dockerAvailable ||
  !runtimeProbe.localSupabaseAvailable
) {
  console.error(
    "[phase-175] Execução recusada: contrato, Docker, Supabase local ou workspace ainda não está pronto.",
  );
  process.exit(1);
}

let disposable;
try {
  disposable = createDisposableWorkspace(sourceRoot);
  const runtime = evaluateIsolatedE2EEnvironment(process.env, {
    ...runtimeProbe,
    workspaceEnvIsolated: disposable.inspection.isolated,
  });
  if (!runtime.runtimeReady) {
    throw new Error("workspace descartável não satisfez o gate isolado");
  }

  const childEnvironment = createIsolatedPlaywrightEnvironment(
    process.env,
    process.env,
  );
  childEnvironment.NEXT_TELEMETRY_DISABLED = "1";
  const playwright = join(disposable.path, "node_modules", ".bin", "playwright");
  if (!existsSync(playwright)) throw new Error("binário Playwright indisponível");

  const result = spawnSync(
    playwright,
    ["test", "tests/e2e/authenticated-journeys.spec.mjs"],
    {
      cwd: disposable.path,
      env: childEnvironment,
      stdio: "inherit",
    },
  );
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(
    `[phase-175] Prova isolada falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`,
  );
  process.exitCode = 1;
} finally {
  if (disposable?.path) cleanupDisposableWorkspace(disposable.path);
}

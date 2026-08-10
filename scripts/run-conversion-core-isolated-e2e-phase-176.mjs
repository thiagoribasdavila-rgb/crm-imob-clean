import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  assessDisposableWorkspacePlan,
  cleanupDisposableWorkspace,
  createDisposableWorkspace,
} from "../lib/testing/disposable-workspace.mjs";
import {
  createIsolatedPlaywrightEnvironment,
  evaluateIsolatedE2EEnvironment,
  ISOLATED_E2E_ENV,
} from "../lib/testing/isolated-e2e-readiness.mjs";
import {
  createSupabaseLocalProvisioningGateway,
  evaluateLocalE2EProvisionerEnvironment,
  LOCAL_E2E_PROVISIONER_ENV,
  provisionLocalE2ERoles,
} from "../lib/testing/local-e2e-role-provisioning.mjs";

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

const disposablePlan = assessDisposableWorkspacePlan(sourceRoot);
const runtimeProbe = {
  dockerAvailable: commandAvailable("docker", ["info"]),
  localSupabaseAvailable: commandAvailable("supabase", [
    "status",
    "--output",
    "json",
  ]),
  workspaceEnvIsolated: false,
};
const browserContract = evaluateIsolatedE2EEnvironment(
  process.env,
  runtimeProbe,
);
const provisionerContract = evaluateLocalE2EProvisionerEnvironment(process.env);

console.log(
  JSON.stringify(
    {
      phase: 176,
      mode: execute ? "execute" : "assess",
      browserContractReady: browserContract.contractReady,
      provisionerContractReady: provisionerContract.ready,
      disposableWorkspacePlanReady: disposablePlan.ready,
      runtime: runtimeProbe,
      missingBrowserVariableNames: browserContract.missing,
      missingProvisionerVariableNames: provisionerContract.missing,
      secretsPrinted: false,
      provisionerKeyPassedToBrowser: false,
      operationalEnvironmentTouched: false,
    },
    null,
    2,
  ),
);

if (!execute) process.exit(0);
if (
  !browserContract.contractReady ||
  !provisionerContract.ready ||
  !disposablePlan.ready ||
  !runtimeProbe.dockerAvailable ||
  !runtimeProbe.localSupabaseAvailable
) {
  console.error(
    "[phase-176] Execução recusada: contrato, Docker, Supabase local ou workspace ainda não está pronto.",
  );
  process.exit(1);
}

let disposable;
try {
  const admin = createClient(
    process.env[ISOLATED_E2E_ENV.supabaseUrl],
    process.env[LOCAL_E2E_PROVISIONER_ENV],
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const provisioned = await provisionLocalE2ERoles({
    gateway: createSupabaseLocalProvisioningGateway(admin),
    values: process.env,
  });

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
  if (LOCAL_E2E_PROVISIONER_ENV in childEnvironment) {
    throw new Error("chave do provisionador alcançou o ambiente do navegador");
  }

  console.log(
    JSON.stringify(
      {
        phase: 176,
        rolesProvisioned: provisioned.rolesProvisioned,
        usersCreated: provisioned.created,
        usersUpdated: provisioned.updated,
        provisionerKeyPassedToBrowser: false,
        secretsPrinted: false,
        operationalEnvironmentTouched: false,
      },
      null,
      2,
    ),
  );

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
    `[phase-176] Prova isolada falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`,
  );
  process.exitCode = 1;
} finally {
  if (disposable?.path) cleanupDisposableWorkspace(disposable.path);
}

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  createIsolatedPlaywrightEnvironment,
  evaluateIsolatedE2EEnvironment,
} from "../lib/testing/isolated-e2e-readiness.mjs";

const execute = process.argv.includes("--execute");

function commandAvailable(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "ignore",
    timeout: 20_000,
  });
  return result.status === 0;
}

const runtime = {
  dockerAvailable: commandAvailable("docker", ["info"]),
  localSupabaseAvailable: commandAvailable("supabase", [
    "status",
    "--output",
    "json",
  ]),
  workspaceEnvIsolated: !existsSync(".env.local"),
};
const assessment = evaluateIsolatedE2EEnvironment(process.env, runtime);

console.log(
  JSON.stringify(
    {
      phase: 174,
      mode: execute ? "execute" : "assess",
      contractReady: assessment.contractReady,
      runtimeReady: assessment.runtimeReady,
      runtime: assessment.runtime,
      missingVariableNames: assessment.missing,
      errors: assessment.errors,
      secretsPrinted: false,
      operationalEnvironmentTouched: false,
    },
    null,
    2,
  ),
);

if (!execute) process.exit(0);
if (!assessment.runtimeReady) {
  console.error(
    "[phase-174] Execução recusada: ambiente local descartável ainda não está pronto.",
  );
  process.exit(1);
}

const childEnvironment = createIsolatedPlaywrightEnvironment(
  process.env,
  process.env,
);
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "test", "tests/e2e/authenticated-journeys.spec.mjs"],
  {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);

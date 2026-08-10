import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseLocalProvisioningGateway,
  evaluateLocalE2EProvisionerEnvironment,
  LOCAL_E2E_PROVISIONER_ENV,
  provisionLocalE2ERoles,
} from "../lib/testing/local-e2e-role-provisioning.mjs";
import { ISOLATED_E2E_ENV } from "../lib/testing/isolated-e2e-readiness.mjs";

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

const environment = evaluateLocalE2EProvisionerEnvironment(process.env);
const localSupabaseAvailable = commandAvailable("supabase", [
  "status",
  "--output",
  "json",
]);

console.log(
  JSON.stringify(
    {
      phase: 176,
      mode: execute ? "execute" : "assess",
      contractReady: environment.ready,
      localSupabaseAvailable,
      missingVariableNames: environment.missing,
      errors: environment.errors,
      roleCount: environment.roleCount,
      localOnly: environment.localOnly,
      secretsPrinted: false,
      operationalEnvironmentTouched: false,
    },
    null,
    2,
  ),
);

if (!execute) process.exit(0);
if (!environment.ready || !localSupabaseAvailable) {
  console.error(
    "[phase-176] Provisionamento recusado: contrato incompleto ou Supabase local indisponível.",
  );
  process.exit(1);
}

const client = createClient(
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

try {
  const result = await provisionLocalE2ERoles({
    gateway: createSupabaseLocalProvisioningGateway(client),
    values: process.env,
  });
  console.log(
    JSON.stringify(
      {
        phase: 176,
        organizationProvisioned: result.organizationProvisioned,
        rolesProvisioned: result.rolesProvisioned,
        created: result.created,
        updated: result.updated,
        hierarchy: result.hierarchy,
        secretsPrinted: false,
        operationalEnvironmentTouched: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    `[phase-176] Provisionamento local falhou: ${error instanceof Error ? error.message : "erro desconhecido"}`,
  );
  process.exit(1);
}

import { spawnSync } from "node:child_process";
import { assessPhase357Readiness } from "./run-phase-357-isolated-rls-runtime-readiness.mjs";

const checks = [];
const expect = (passed, label) => checks.push([label, passed]);

const blocked = assessPhase357Readiness({
  environment: {},
  tools: {
    localSupabaseCli: true,
    globalSupabaseCli: false,
    docker: false,
    podman: false,
    colima: false,
    psql: false,
  },
});

expect(
  blocked.status === "blocked_without_isolated_clone" &&
    blocked.readyForDynamicExecution === false,
  "ausência de clone isolado mantém o ensaio bloqueado",
);
expect(
  blocked.blockers.includes("database_target_is_loopback") &&
    blocked.blockers.includes("acl_snapshot_contract_is_valid"),
  "preflight exige alvo loopback e snapshot válido",
);
expect(
  blocked.environment.valuesExposed === false &&
    blocked.safety.secretsExposed === false,
  "diagnóstico divulga somente nomes de variáveis",
);
expect(
  blocked.safety.liveProjectTouched === false &&
    blocked.safety.ddlExecuted === false &&
    blocked.safety.businessDataChanged === false,
  "avaliação não toca projeto real, DDL ou dados",
);

const remote = assessPhase357Readiness({
  environment: {
    ATLAS_RLS_REHEARSAL_ENVIRONMENT: "isolated_clone",
    ATLAS_RLS_REHEARSAL_APPROVED: "true",
    ATLAS_RLS_REHEARSAL_DATABASE_URL:
      "postgresql://redacted:redacted@example.invalid:5432/postgres",
    ATLAS_RLS_REHEARSAL_ACL_SNAPSHOT_PATH: "missing.json",
  },
  tools: {
    localSupabaseCli: true,
    globalSupabaseCli: true,
    docker: true,
    podman: false,
    colima: false,
    psql: true,
  },
});
expect(
  remote.readyForDynamicExecution === false &&
    remote.controls.database_target_is_loopback === false,
  "host remoto nunca satisfaz o gate de execução",
);

const existingContract = spawnSync(
  process.execPath,
  ["scripts/check-atlas-rls-isolated-rehearsal-phase-008.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(
  existingContract.status === 0 &&
    existingContract.stdout.includes("PASSED"),
  "contrato completo da fase 8 continua aprovado",
);

const runtime = spawnSync(
  process.execPath,
  ["scripts/run-phase-357-isolated-rls-runtime-readiness.mjs"],
  { cwd: process.cwd(), encoding: "utf8", env: process.env },
);
let runtimeOutput;
try {
  runtimeOutput = JSON.parse(runtime.stdout);
} catch {
  runtimeOutput = null;
}
expect(
  runtime.status === 0 &&
    runtimeOutput?.format ===
      "atlas_phase_357_isolated_rls_runtime_readiness_v1",
  "executor de diagnóstico produz evidência estruturada",
);
expect(
  !runtime.stdout.includes("pozbrcsfthnhmnebfoxv") &&
    !runtime.stdout.includes("postgresql://"),
  "saída não contém Project ID real nem URL de banco",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
if (failures.length) {
  console.error(`PHASE 357 CHECK: FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`PHASE 357 CHECK: PASSED (${checks.length}/${checks.length})`);

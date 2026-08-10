import { spawnSync } from "node:child_process";
import { assessPhase358Readiness } from "./run-phase-358-local-clone-provisioning-readiness.mjs";

const checks = [];
const expect = (passed, label) => checks.push([label, passed]);
const safeConfig = {
  exists: true,
  postgresMajor: 17,
  localPortsDeclared: true,
};
const freePorts = { inspectionAvailable: true, busy: [] };
const readyTooling = {
  supabaseCli: true,
  workdirFlag: true,
  runtimeApps: ["docker_desktop"],
  runtimeCli: true,
  runtimeReady: true,
};

const noRuntime = assessPhase358Readiness({
  tooling: { ...readyTooling, runtimeApps: [], runtimeCli: false, runtimeReady: false },
  ports: freePorts,
  linkedProjectMarker: false,
  config: safeConfig,
});
expect(
  noRuntime.status === "blocked_without_runtime" &&
    noRuntime.readyToProvision === false,
  "runtime ausente bloqueia o provisionamento local",
);

const linked = assessPhase358Readiness({
  tooling: readyTooling,
  ports: freePorts,
  linkedProjectMarker: true,
  config: safeConfig,
});
expect(
  linked.status === "blocked_linked_workspace" &&
    linked.controls.remote_project_link_absent === false,
  "workspace vinculado ao projeto remoto falha fechado",
);

const occupied = assessPhase358Readiness({
  tooling: readyTooling,
  ports: { inspectionAvailable: true, busy: [54322] },
  linkedProjectMarker: false,
  config: safeConfig,
});
expect(
  occupied.status === "blocked_local_preflight" &&
    occupied.controls.local_supabase_ports_free === false,
  "porta local ocupada impede colisão silenciosa",
);

const ready = assessPhase358Readiness({
  tooling: readyTooling,
  ports: freePorts,
  linkedProjectMarker: false,
  config: safeConfig,
});
expect(
  ready.status === "ready_to_provision_local_clone" &&
    ready.readyToProvision === true,
  "ambiente sintético seguro alcança prontidão",
);
expect(
  ready.safety.remoteCommandsAllowed === false &&
    ready.safety.liveProjectTouched === false &&
    ready.safety.ddlExecuted === false,
  "preflight nunca autoriza remoto, DDL ou alteração de dados",
);

const phase357 = spawnSync(
  process.execPath,
  ["scripts/check-phase-357-isolated-rls-runtime-readiness.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(
  phase357.status === 0 && phase357.stdout.includes("PASSED"),
  "gate de prontidão da fase 357 continua aprovado",
);

const runtime = spawnSync(
  process.execPath,
  ["scripts/run-phase-358-local-clone-provisioning-readiness.mjs"],
  { cwd: process.cwd(), encoding: "utf8", env: process.env },
);
let evidence;
try {
  evidence = JSON.parse(runtime.stdout);
} catch {
  evidence = null;
}
expect(
  runtime.status === 0 &&
    evidence?.format === "atlas_phase_358_local_clone_provisioning_readiness_v1",
  "diagnóstico real produz evidência estruturada",
);
expect(
  !runtime.stdout.includes("postgresql://") &&
    !runtime.stdout.includes("pozbrcsfthnhmnebfoxv") &&
    evidence?.safety?.secretsExposed === false,
  "evidência não divulga URL, Project ID real ou segredo",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
if (failures.length) {
  console.error(`PHASE 358 CHECK: FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`PHASE 358 CHECK: PASSED (${checks.length}/${checks.length})`);

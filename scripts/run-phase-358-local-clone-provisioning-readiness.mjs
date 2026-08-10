import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const LOCAL_PORTS = [54320, 54321, 54322, 54323, 54324, 54325, 54326, 54327, 54328, 54329];
const RUNTIME_APPS = [
  ["docker_desktop", "/Applications/Docker.app"],
  ["orbstack", "/Applications/OrbStack.app"],
  ["podman_desktop", "/Applications/Podman Desktop.app"],
  ["rancher_desktop", "/Applications/Rancher Desktop.app"],
];

function run(command, args = []) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 4_000,
  });
}

function commandPath(command) {
  const result = run("/usr/bin/which", [command]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function commandSucceeds(command, args = []) {
  if (!command) return false;
  return run(command, args).status === 0;
}

function inspectConfig(workspace) {
  const path = resolve(workspace, "supabase/config.toml");
  if (!existsSync(path)) {
    return { exists: false, postgresMajor: null, localPortsDeclared: false };
  }

  const source = readFileSync(path, "utf8");
  const major = source.match(/\bmajor_version\s*=\s*(\d+)/)?.[1] ?? null;
  const declaredPorts = [...source.matchAll(/^port\s*=\s*(\d+)/gm)].map((match) =>
    Number(match[1]),
  );
  return {
    exists: true,
    postgresMajor: major ? Number(major) : null,
    localPortsDeclared: [54321, 54322, 54323, 54324].every((port) =>
      declaredPorts.includes(port),
    ),
  };
}

function inspectPorts() {
  const lsof = commandPath("lsof") ?? "/usr/sbin/lsof";
  if (!existsSync(lsof)) {
    return { inspectionAvailable: false, busy: [] };
  }

  const result = run(lsof, [
    "-nP",
    `-iTCP:${LOCAL_PORTS[0]}-${LOCAL_PORTS.at(-1)}`,
    "-sTCP:LISTEN",
  ]);
  if (result.status !== 0 || !result.stdout.trim()) {
    return { inspectionAvailable: true, busy: [] };
  }

  const busy = LOCAL_PORTS.filter((port) => result.stdout.includes(`:${port} `));
  return { inspectionAvailable: true, busy };
}

function discoverTooling(workspace) {
  const localSupabase = resolve(workspace, "node_modules/.bin/supabase");
  const globalSupabase = commandPath("supabase");
  const docker = commandPath("docker") ??
    (existsSync("/Applications/Docker.app/Contents/Resources/bin/docker")
      ? "/Applications/Docker.app/Contents/Resources/bin/docker"
      : null);
  const podman = commandPath("podman");
  const colima = commandPath("colima");
  const supabaseCommand = existsSync(localSupabase) ? localSupabase : globalSupabase;
  const supabaseHelp = supabaseCommand ? run(supabaseCommand, ["start", "--help"]) : null;

  return {
    supabaseCli: Boolean(supabaseCommand),
    workdirFlag: Boolean(supabaseHelp?.stdout.includes("--workdir")),
    runtimeApps: RUNTIME_APPS.filter(([, path]) => existsSync(path)).map(([name]) => name),
    runtimeCli: Boolean(docker || podman || colima),
    runtimeReady:
      commandSucceeds(docker, ["info"]) ||
      commandSucceeds(podman, ["info"]) ||
      commandSucceeds(colima, ["status"]),
  };
}

export function assessPhase358Readiness({
  workspace = process.cwd(),
  tooling,
  ports,
  linkedProjectMarker,
  config,
} = {}) {
  const detectedTooling = tooling ?? discoverTooling(workspace);
  const detectedPorts = ports ?? inspectPorts();
  const linkedMarker =
    linkedProjectMarker ?? existsSync(resolve(workspace, "supabase/.temp/project-ref"));
  const detectedConfig = config ?? inspectConfig(workspace);
  const controls = {
    supabase_cli_available: detectedTooling.supabaseCli === true,
    isolated_workdir_supported: detectedTooling.workdirFlag === true,
    container_runtime_ready: detectedTooling.runtimeReady === true,
    local_port_inspection_available: detectedPorts.inspectionAvailable === true,
    local_supabase_ports_free: detectedPorts.busy.length === 0,
    remote_project_link_absent: linkedMarker === false,
    local_config_available: detectedConfig.exists === true,
    postgres_17_declared: detectedConfig.postgresMajor === 17,
    canonical_local_ports_declared: detectedConfig.localPortsDeclared === true,
  };
  const blockers = Object.entries(controls)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);

  let status = "ready_to_provision_local_clone";
  if (linkedMarker) status = "blocked_linked_workspace";
  else if (!detectedTooling.runtimeReady) status = "blocked_without_runtime";
  else if (blockers.length) status = "blocked_local_preflight";

  return {
    format: "atlas_phase_358_local_clone_provisioning_readiness_v1",
    phase: 358,
    status,
    readyToProvision: blockers.length === 0,
    controls,
    blockers,
    tooling: {
      supabaseCli: detectedTooling.supabaseCli === true,
      isolatedWorkdirSupported: detectedTooling.workdirFlag === true,
      installedRuntimeAppKinds: detectedTooling.runtimeApps ?? [],
      runtimeCliAvailable: detectedTooling.runtimeCli === true,
      runtimeReady: detectedTooling.runtimeReady === true,
    },
    localEnvironment: {
      postgresMajor: detectedConfig.postgresMajor,
      inspectedPortCount: LOCAL_PORTS.length,
      busyPortCount: detectedPorts.busy.length,
      remoteProjectLinkPresent: linkedMarker,
    },
    safety: {
      remoteCommandsAllowed: false,
      remoteProjectReferenceRead: false,
      containerStarted: false,
      ddlExecuted: false,
      migrationApplied: false,
      liveProjectTouched: false,
      secretsExposed: false,
    },
    nextAction:
      status === "ready_to_provision_local_clone"
        ? "request_explicit_local_runtime_start_then_run_supabase_start_in_isolated_workdir"
        : status === "blocked_linked_workspace"
          ? "use_a_new_unlinked_isolated_workdir_before_any_local_start"
          : status === "blocked_without_runtime"
            ? "install_or_start_a_local_container_runtime_without_linking_the_remote_project"
            : "resolve_local_preflight_blockers_before_provisioning",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(JSON.stringify(assessPhase358Readiness(), null, 2));
}

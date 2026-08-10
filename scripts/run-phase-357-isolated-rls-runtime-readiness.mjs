import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

const REQUIRED_ENVIRONMENT = [
  "ATLAS_RLS_REHEARSAL_ENVIRONMENT",
  "ATLAS_RLS_REHEARSAL_APPROVED",
  "ATLAS_RLS_REHEARSAL_DATABASE_URL",
  "ATLAS_RLS_REHEARSAL_ACL_SNAPSHOT_PATH",
];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function commandAvailable(command) {
  return spawnSync("/usr/bin/which", [command], {
    encoding: "utf8",
    stdio: "ignore",
  }).status === 0;
}

function inspectDatabaseTarget(raw) {
  if (!raw?.trim()) {
    return { configured: false, protocolValid: false, loopback: false };
  }

  try {
    const parsed = new URL(raw);
    return {
      configured: true,
      protocolValid: ["postgres:", "postgresql:"].includes(parsed.protocol),
      loopback: LOOPBACK_HOSTS.has(parsed.hostname),
    };
  } catch {
    return { configured: true, protocolValid: false, loopback: false };
  }
}

function inspectSnapshot(rawPath, workspace = process.cwd()) {
  if (!rawPath?.trim()) {
    return { configured: false, insideWorkspace: false, contractValid: false };
  }

  const path = resolve(rawPath);
  const root = resolve(workspace);
  const insideWorkspace =
    isAbsolute(path) && (path === root || path.startsWith(`${root}${sep}`));
  if (!insideWorkspace || !existsSync(path)) {
    return { configured: true, insideWorkspace, contractValid: false };
  }

  try {
    const snapshot = JSON.parse(readFileSync(path, "utf8"));
    return {
      configured: true,
      insideWorkspace: true,
      contractValid:
        snapshot.format === "atlas_phase_008_acl_snapshot_v1" &&
        snapshot.environment === "isolated_clone",
    };
  } catch {
    return { configured: true, insideWorkspace: true, contractValid: false };
  }
}

export function assessPhase357Readiness({
  environment = process.env,
  tools,
  workspace = process.cwd(),
} = {}) {
  const detectedTools = tools ?? {
    localSupabaseCli: existsSync(resolve(workspace, "node_modules/.bin/supabase")),
    globalSupabaseCli: commandAvailable("supabase"),
    docker: commandAvailable("docker"),
    podman: commandAvailable("podman"),
    colima: commandAvailable("colima"),
    psql: commandAvailable("psql"),
  };
  const target = inspectDatabaseTarget(
    environment.ATLAS_RLS_REHEARSAL_DATABASE_URL,
  );
  const snapshot = inspectSnapshot(
    environment.ATLAS_RLS_REHEARSAL_ACL_SNAPSHOT_PATH,
    workspace,
  );
  const controls = {
    environment_is_isolated_clone:
      environment.ATLAS_RLS_REHEARSAL_ENVIRONMENT === "isolated_clone",
    explicit_execution_approval:
      environment.ATLAS_RLS_REHEARSAL_APPROVED === "true",
    database_target_configured: target.configured,
    database_protocol_is_postgres: target.protocolValid,
    database_target_is_loopback: target.loopback,
    acl_snapshot_configured: snapshot.configured,
    acl_snapshot_is_inside_workspace: snapshot.insideWorkspace,
    acl_snapshot_contract_is_valid: snapshot.contractValid,
    local_supabase_cli_available:
      detectedTools.localSupabaseCli === true ||
      detectedTools.globalSupabaseCli === true,
  };
  const blockers = Object.entries(controls)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const canProvisionLocalClone =
    detectedTools.docker === true ||
    detectedTools.podman === true ||
    detectedTools.colima === true;

  return {
    format: "atlas_phase_357_isolated_rls_runtime_readiness_v1",
    phase: 357,
    status:
      blockers.length === 0
        ? "ready_for_explicit_isolated_execution"
        : "blocked_without_isolated_clone",
    readyForDynamicExecution: blockers.length === 0,
    controls,
    blockers,
    environment: {
      requiredVariableNames: REQUIRED_ENVIRONMENT,
      presentVariableNames: REQUIRED_ENVIRONMENT.filter(
        (name) => Boolean(environment[name]?.trim()),
      ),
      valuesExposed: false,
    },
    tooling: {
      localSupabaseCli: detectedTools.localSupabaseCli === true,
      globalSupabaseCli: detectedTools.globalSupabaseCli === true,
      containerRuntimeAvailable: canProvisionLocalClone,
      psqlAvailable: detectedTools.psql === true,
    },
    safety: {
      remoteTargetAccepted: false,
      linkedProjectAllowed: false,
      liveProjectTouched: false,
      ddlExecuted: false,
      businessDataChanged: false,
      secretsExposed: false,
    },
    nextAction:
      blockers.length === 0
        ? "run_npm_atlas_rls_dynamic_execute_with_explicit_approval"
        : canProvisionLocalClone
          ? "provision_and_confirm_loopback_clone_then_supply_sanitized_snapshot"
          : "install_or_start_local_container_runtime_then_provision_loopback_clone",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(JSON.stringify(assessPhase357Readiness(), null, 2));
}

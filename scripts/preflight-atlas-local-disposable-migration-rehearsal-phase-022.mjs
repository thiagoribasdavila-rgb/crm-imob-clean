import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assessLocalMigrationAuthoring } from "./run-atlas-local-migration-authoring-phase-021.mjs";
import { assessLocalDisposableMigrationRehearsal } from "./run-atlas-local-disposable-migration-rehearsal-phase-022.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidencePath = resolve(
  root,
  "artifacts/runtime/phase-022/environment-readiness-evidence.json",
);
const expectedCliVersion = "2.109.1";
const sourceConfigPath = resolve(root, "supabase/config.toml");
const receiptPath = resolve(
  root,
  "artifacts/runtime/phase-021/manual/local-migration-authoring-receipt.json",
);
const authorizationPath = resolve(
  root,
  "artifacts/runtime/phase-022/manual/local-rehearsal-authorization.json",
);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function findExecutable(name, additionalCandidates = []) {
  const candidates = [
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((directory) => join(directory, name)),
    ...additionalCandidates,
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue procurando sem executar nenhum runtime.
    }
  }
  return "";
}

function cliVersion(cliPath) {
  if (!cliPath) return "";
  const isolatedHome = join(tmpdir(), "atlas-phase-022-supabase-home");
  mkdirSync(isolatedHome, { recursive: true });
  const result = spawnSync(cliPath, ["--version"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, HOME: isolatedHome },
    timeout: 10_000,
  });
  const version = `${result.stdout ?? ""} ${result.stderr ?? ""}`.match(
    /\b\d+\.\d+\.\d+\b/,
  );
  return version?.[0] ?? "";
}

function fileFact(path) {
  if (!existsSync(path)) {
    return { exists: false, sha256: null };
  }
  return {
    exists: true,
    sha256: sha256(readFileSync(path)),
  };
}

function configFact() {
  if (!existsSync(sourceConfigPath)) {
    return {
      exists: false,
      sha256: null,
      project_id: null,
      postgres_major_version: null,
    };
  }
  const source = readFileSync(sourceConfigPath, "utf8");
  const projectId = source.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1];
  const majorVersion = source.match(
    /^\s*major_version\s*=\s*(\d+)\s*$/m,
  )?.[1];
  return {
    exists: true,
    sha256: sha256(source),
    project_id: projectId ?? null,
    postgres_major_version: majorVersion
      ? Number.parseInt(majorVersion, 10)
      : null,
  };
}

export function evaluateEnvironmentReadiness(facts) {
  const blockers = [];
  const require = (condition, code) => {
    if (!condition) blockers.push(code);
  };

  require(facts.supabase_cli_detected, "supabase_cli_missing");
  require(facts.cli_version_matches, "supabase_cli_version_mismatch");
  require(facts.container_cli_detected, "container_runtime_cli_missing");
  require(facts.source_config_exists, "source_config_missing");
  require(facts.phase_021_ready, "phase_021_authoring_not_ready");
  require(facts.authoring_receipt_exists, "authoring_receipt_missing");
  require(
    facts.rehearsal_authorization_exists,
    "rehearsal_authorization_missing",
  );
  require(facts.phase_022_contract_ready, "phase_022_contract_not_ready");

  return {
    ready: blockers.length === 0,
    blockers,
  };
}

export function inspectEnvironment() {
  const supabasePath = findExecutable("supabase");
  const detectedCliVersion = cliVersion(supabasePath);
  const containerCandidates = [
    {
      name: "docker",
      path: findExecutable("docker", [
        "/Applications/Docker.app/Contents/Resources/bin/docker",
        "/Applications/OrbStack.app/Contents/MacOS/xbin/docker",
      ]),
    },
    { name: "podman", path: findExecutable("podman") },
  ];
  const container = containerCandidates.find((candidate) => candidate.path);
  const config = configFact();
  const receipt = fileFact(receiptPath);
  const authorization = fileFact(authorizationPath);
  const phase021 = assessLocalMigrationAuthoring();
  const phase022 = assessLocalDisposableMigrationRehearsal();

  const facts = {
    supabase_cli_detected: Boolean(supabasePath),
    cli_version_matches: detectedCliVersion === expectedCliVersion,
    container_cli_detected: Boolean(container),
    source_config_exists: config.exists,
    phase_021_ready:
      phase021.status === "ready_for_single_local_cli_authoring",
    authoring_receipt_exists: receipt.exists,
    rehearsal_authorization_exists: authorization.exists,
    phase_022_contract_ready:
      phase022.conclusion.ready_for_single_disposable_local_rehearsal ===
      true,
  };
  const readiness = evaluateEnvironmentReadiness(facts);

  return {
    schema_version: "atlas.phase-022.environment-readiness.v1",
    phase: "22/24",
    status: readiness.ready
      ? "ready_for_single_disposable_local_rehearsal"
      : "local_rehearsal_environment_blocked",
    checked_at: new Date().toISOString(),
    tooling: {
      supabase_cli_detected: facts.supabase_cli_detected,
      supabase_cli_version: detectedCliVersion || null,
      supabase_cli_version_expected: expectedCliVersion,
      supabase_cli_version_matches: facts.cli_version_matches,
      container_cli_detected: facts.container_cli_detected,
      container_cli: container?.name ?? null,
      container_daemon_checked: false,
      node_version: process.version,
    },
    inputs: {
      source_config: config,
      phase_021_status: phase021.status,
      phase_021_gates: phase021.authoring_gates,
      authoring_receipt: receipt,
      rehearsal_authorization: authorization,
      phase_022_status: phase022.status,
      phase_022_gates: phase022.rehearsal_gates,
    },
    readiness: {
      ready: readiness.ready,
      blockers: readiness.blockers,
      human_authorization_required: true,
    },
    safety: {
      container_daemon_accessed: false,
      local_database_started: false,
      migration_applied: false,
      remote_accessed: false,
      linked_project_accessed: false,
      production_touched: false,
      build_executed: false,
      release_package_created: false,
      credentials_read: false,
      business_or_auth_rows_read: false,
    },
    next_action:
      "Concluir a cadeia humana F17-F21, instalar ou disponibilizar um runtime Docker compatível e emitir a autorização JIT da F22 somente na janela real do ensaio; preservar o supabase/config.toml já validado.",
  };
}

export function selfTest() {
  const baseline = {
    supabase_cli_detected: true,
    cli_version_matches: true,
    container_cli_detected: true,
    source_config_exists: true,
    phase_021_ready: true,
    authoring_receipt_exists: true,
    rehearsal_authorization_exists: true,
    phase_022_contract_ready: true,
  };
  const tests = [
    {
      id: "complete_environment_is_ready",
      passed: evaluateEnvironmentReadiness(baseline).ready,
    },
  ];
  for (const [field, code] of [
    ["supabase_cli_detected", "supabase_cli_missing"],
    ["cli_version_matches", "supabase_cli_version_mismatch"],
    ["container_cli_detected", "container_runtime_cli_missing"],
    ["source_config_exists", "source_config_missing"],
    ["phase_021_ready", "phase_021_authoring_not_ready"],
    ["authoring_receipt_exists", "authoring_receipt_missing"],
    ["rehearsal_authorization_exists", "rehearsal_authorization_missing"],
    ["phase_022_contract_ready", "phase_022_contract_not_ready"],
  ]) {
    const mutant = structuredClone(baseline);
    mutant[field] = false;
    const result = evaluateEnvironmentReadiness(mutant);
    tests.push({
      id: `${field}_fails_closed`,
      passed: !result.ready && result.blockers.includes(code),
    });
  }
  return {
    passed: tests.every((test) => test.passed),
    tests_passed: tests.filter((test) => test.passed).length,
    tests_total: tests.length,
    tests,
  };
}

function main() {
  if (process.argv.includes("--self-test")) {
    const result = selfTest();
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }

  const evidence = inspectEnvironment();
  if (process.argv.includes("--write-evidence")) {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  console.log(JSON.stringify(evidence, null, 2));
  if (process.argv.includes("--require-ready") && !evidence.readiness.ready) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

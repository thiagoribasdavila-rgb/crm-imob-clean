import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractPath = resolve(
  root,
  "config/atlas-local-supabase-bootstrap-gate.json",
);
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const readinessEvidencePath =
  "artifacts/runtime/phase-012/local-supabase-bootstrap-readiness.json";
const resolveFromRoot = (path) => resolve(root, path);
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function isolatedCliVersion(cliPath) {
  if (!executable(cliPath)) return null;
  const home = join(tmpdir(), "atlas-local-supabase-bootstrap-probe");
  mkdirSync(home, { recursive: true });
  const result = spawnSync(cliPath, ["--version"], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    env: {
      PATH: process.env.PATH ?? "",
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      HOME: home,
      SUPABASE_TELEMETRY_DISABLED: "true",
      NO_COLOR: "1",
    },
  });
  const match = `${result.stdout ?? ""} ${result.stderr ?? ""}`.match(
    /\b\d+\.\d+\.\d+\b/,
  );
  return result.status === 0 ? (match?.[0] ?? null) : null;
}

function migrationFacts() {
  const directory = resolveFromRoot(
    contract.project.migrations_directory,
  );
  if (!existsSync(directory)) {
    return {
      directory_exists: false,
      count: 0,
      unique_names: false,
      fingerprint_input: [],
    };
  }
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const uniqueNames = new Set(names).size === names.length;
  const fingerprintInput = names.map((name) => {
    const content = readFileSync(join(directory, name));
    return `${name}:${sha256(content)}`;
  });
  return {
    directory_exists: true,
    count: names.length,
    unique_names: uniqueNames,
    fingerprint_input: fingerprintInput,
  };
}

export function projectFingerprint() {
  const migrations = migrationFacts();
  const packageLockPath = resolve(root, "package-lock.json");
  const packageLockHash = existsSync(packageLockPath)
    ? sha256(readFileSync(packageLockPath))
    : "missing";
  return sha256(
    JSON.stringify({
      contract: sha256(readFileSync(contractPath)),
      package_lock: packageLockHash,
      migrations: migrations.fingerprint_input,
    }),
  );
}

export function parseLocalConfig(path) {
  if (!existsSync(path)) {
    return {
      exists: false,
      sha256: null,
      project_id: null,
      postgres_major: null,
      contains_literal_secret: false,
      valid: false,
    };
  }
  const source = readFileSync(path, "utf8");
  return parseLocalConfigSource(source);
}

export function parseLocalConfigSource(source) {
  const projectId =
    source.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  const major = source.match(
    /^\s*major_version\s*=\s*(\d+)\s*$/m,
  )?.[1];
  const effectiveLines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const secretAssignment = effectiveLines.some((line) => {
    const match = line.match(
      /^([A-Za-z0-9_]*(?:key|secret|token|password)[A-Za-z0-9_]*)\s*=\s*"([^"]*)"/i,
    );
    if (!match) return false;
    return (
      match[2] !== "" &&
      !/^env\([A-Za-z_][A-Za-z0-9_]*\)$/.test(match[2])
    );
  });
  const connectionCredential = effectiveLines.some((line) =>
    /postgres(?:ql)?:\/\/[^:\s"']+:[^@\s"']+@/i.test(line),
  );
  const providerSecret = effectiveLines.some((line) =>
    /\bsk-[A-Za-z0-9_-]{20,}\b/.test(line),
  );
  const containsLiteralSecret =
    secretAssignment || connectionCredential || providerSecret;
  const postgresMajor = major ? Number.parseInt(major, 10) : null;
  return {
    exists: true,
    sha256: sha256(source),
    project_id: projectId,
    postgres_major: postgresMajor,
    contains_literal_secret: containsLiteralSecret,
    valid:
      Boolean(projectId) &&
      postgresMajor === contract.project.expected_postgres_major &&
      !containsLiteralSecret,
  };
}

function validExpiry(value, now) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

export function evaluateBootstrapReadiness(facts) {
  const baseGates = {
    cli_present: facts.cli_present === true,
    cli_version_matches: facts.cli_version_matches === true,
    supabase_directory_present:
      facts.supabase_directory_present === true,
    migrations_present: facts.migrations_count > 0,
    migration_names_unique: facts.migration_names_unique === true,
    linked_project_marker_absent:
      facts.linked_project_marker_absent === true,
    config_absent_before_execution:
      facts.config_exists === false,
    approval_receipt_valid: facts.approval_receipt_valid === true,
    approval_not_expired: facts.approval_not_expired === true,
    approval_fingerprint_matches:
      facts.approval_fingerprint_matches === true,
    approval_forbids_remote:
      facts.approval_forbids_remote === true,
  };
  const blockers = Object.entries(baseGates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  return {
    gates: baseGates,
    blockers,
    ready_to_execute:
      blockers.length === 0 && facts.config_exists === false,
  };
}

export function inspectBootstrapReadiness({
  now = Date.now(),
  cliVersionOverride,
  approvalOverride,
} = {}) {
  const cliPath = resolveFromRoot(contract.cli.path);
  const configPath = resolveFromRoot(contract.project.config_path);
  const linkMarkerPath = resolveFromRoot(
    contract.project.linked_project_marker,
  );
  const migrations = migrationFacts();
  const config = parseLocalConfig(configPath);
  const fingerprint = projectFingerprint();
  const approval =
    approvalOverride ??
    readJsonIfPresent(
      resolveFromRoot(contract.authorization.receipt_path),
    );
  const cliVersion =
    cliVersionOverride ?? isolatedCliVersion(cliPath);
  const approvalReceiptValid =
    approval?.schema_version ===
      contract.authorization.schema_version &&
    approval?.approved === true &&
    approval?.approver_role ===
      contract.authorization.approver_role &&
    approval?.target_kind === contract.authorization.target_kind &&
    approval?.expected_command ===
      contract.authorization.expected_command &&
    approval?.expected_cli_version ===
      contract.cli.expected_version;
  const facts = {
    cli_present: executable(cliPath),
    cli_version_matches:
      cliVersion === contract.cli.expected_version,
    supabase_directory_present: existsSync(resolve(root, "supabase")),
    migrations_count: migrations.count,
    migration_names_unique: migrations.unique_names,
    linked_project_marker_absent: !existsSync(linkMarkerPath),
    config_exists: config.exists,
    approval_receipt_valid: approvalReceiptValid,
    approval_not_expired: validExpiry(approval?.expires_at, now),
    approval_fingerprint_matches:
      approval?.project_fingerprint === fingerprint,
    approval_forbids_remote:
      approval?.remote_access_allowed === false,
  };
  const readiness = evaluateBootstrapReadiness(facts);
  const alreadyInitialized = config.exists && config.valid;
  const invalidExistingConfig = config.exists && !config.valid;
  const status = invalidExistingConfig
    ? "existing_local_config_requires_human_review"
    : alreadyInitialized
      ? "local_supabase_bootstrap_complete"
      : readiness.ready_to_execute
        ? "ready_for_single_local_supabase_init"
        : "awaiting_explicit_local_bootstrap_authorization";

  return {
    schema_version: contract.schema_version,
    scope: contract.scope,
    status,
    checked_at: new Date(now).toISOString(),
    project_fingerprint: fingerprint,
    tooling: {
      cli_present: facts.cli_present,
      cli_version: cliVersion,
      cli_version_expected: contract.cli.expected_version,
      cli_version_matches: facts.cli_version_matches,
      isolated_home: true,
      telemetry_disabled: true,
    },
    source: {
      supabase_directory_present:
        facts.supabase_directory_present,
      migrations_count: migrations.count,
      migration_names_unique: migrations.unique_names,
      linked_project_marker_absent:
        facts.linked_project_marker_absent,
    },
    local_config: config,
    authorization: {
      receipt_present: Boolean(approval),
      receipt_valid: approvalReceiptValid,
      not_expired: facts.approval_not_expired,
      fingerprint_matches:
        facts.approval_fingerprint_matches,
      forbids_remote: facts.approval_forbids_remote,
      approval_created_by_assessor: false,
    },
    readiness,
    safety: {
      init_executed: false,
      force_used: false,
      linked_project_accessed: false,
      remote_accessed: false,
      database_started: false,
      migration_applied: false,
      data_accessed: false,
      credentials_read: false,
      build_executed: false,
      release_package_created: false,
    },
    next_action: alreadyInitialized
      ? contract.next_action_after_success
      : invalidExistingConfig
        ? "Revisar manualmente o config existente; o executor não sobrescreve nem usa --force."
        : "Emitir autorização explícita, curta e vinculada ao fingerprint; depois executar somente o bootstrap local publicado.",
  };
}

export function approvalDraft(now = Date.now()) {
  return {
    schema_version: contract.authorization.schema_version,
    approved: false,
    approver_role: contract.authorization.approver_role,
    target_kind: contract.authorization.target_kind,
    expected_command: contract.authorization.expected_command,
    expected_cli_version: contract.cli.expected_version,
    project_fingerprint: projectFingerprint(),
    expires_at: new Date(now + 30 * 60 * 1000).toISOString(),
    remote_access_allowed: false,
    notes:
      "Rascunho não aprovado. Autoriza apenas supabase init local; não autoriza link, start, banco, migration, dados, build ou ZIP.",
  };
}

export function selfTest() {
  const base = {
    cli_present: true,
    cli_version_matches: true,
    supabase_directory_present: true,
    migrations_count: 1,
    migration_names_unique: true,
    linked_project_marker_absent: true,
    config_exists: false,
    approval_receipt_valid: true,
    approval_not_expired: true,
    approval_fingerprint_matches: true,
    approval_forbids_remote: true,
  };
  const tests = [
    {
      id: "complete_contract_is_ready",
      passed: evaluateBootstrapReadiness(base).ready_to_execute,
    },
    {
      id: "env_references_and_comments_are_not_literal_secrets",
      passed:
        parseLocalConfigSource(`
project_id = "atlas-local"
major_version = 17
# secret_key = "example-only"
openai_api_key = "env(OPENAI_API_KEY)"
s3_secret_key = "env(S3_SECRET_KEY)"
`).valid === true,
    },
    {
      id: "literal_secret_assignment_fails_closed",
      passed:
        parseLocalConfigSource(`
project_id = "atlas-local"
major_version = 17
secret_key = "literal-value"
`).contains_literal_secret === true,
    },
    {
      id: "credentialed_database_url_fails_closed",
      passed:
        parseLocalConfigSource(`
project_id = "atlas-local"
major_version = 17
database_url = "postgresql://user:password@localhost/db"
`).contains_literal_secret === true,
    },
  ];
  for (const [field, blocker] of [
    ["cli_present", "cli_present"],
    ["cli_version_matches", "cli_version_matches"],
    ["linked_project_marker_absent", "linked_project_marker_absent"],
    ["config_exists", "config_absent_before_execution"],
    ["approval_receipt_valid", "approval_receipt_valid"],
    ["approval_not_expired", "approval_not_expired"],
    [
      "approval_fingerprint_matches",
      "approval_fingerprint_matches",
    ],
    ["approval_forbids_remote", "approval_forbids_remote"],
  ]) {
    const mutant = structuredClone(base);
    mutant[field] = field === "config_exists";
    const result = evaluateBootstrapReadiness(mutant);
    tests.push({
      id: `${field}_fails_closed`,
      passed:
        !result.ready_to_execute &&
        result.blockers.includes(blocker),
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
  if (process.argv.includes("--approval-draft")) {
    console.log(JSON.stringify(approvalDraft(), null, 2));
    return;
  }
  const evidence = inspectBootstrapReadiness();
  if (process.argv.includes("--write-evidence")) {
    const evidencePath = resolveFromRoot(
      readinessEvidencePath,
    );
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(
      evidencePath,
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
  }
  console.log(JSON.stringify(evidence, null, 2));
  if (
    process.argv.includes("--require-ready") &&
    !evidence.readiness.ready_to_execute &&
    evidence.status !== "local_supabase_bootstrap_complete"
  ) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

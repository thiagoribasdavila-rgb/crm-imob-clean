import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const config = readJson(
  "config/atlas-10x-phase-012-isolated-baseline-capture.json",
);
const evidence = readJson(config.capture_contract.evidence_path);
const approval = readJson(
  config.authorization_contract.receipt_path,
);
const isolatedProbeHome = join(
  tmpdir(),
  "atlas-phase12-supabase-home",
);
mkdirSync(isolatedProbeHome, { recursive: true });

function runQuiet(command, args, extraEnv = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      SUPABASE_TELEMETRY_DISABLED: "true",
    },
  });
}

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
      // Descoberta somente leitura: nenhum runtime é iniciado.
    }
  }
  return "";
}

function normalizedTarget(databaseUrl) {
  if (!databaseUrl) return null;
  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname
      .toLowerCase()
      .replace(/^\[/, "")
      .replace(/\]$/, "");
    const allowed =
      ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      config.source_policy.allowed_hosts.includes(host);
    if (!allowed) return null;
    const port = parsed.port || "5432";
    const database = parsed.pathname.replace(/^\/+/, "");
    if (!database) return null;
    return `${parsed.protocol}//${host}:${port}/${database}`;
  } catch {
    return null;
  }
}

export function targetFingerprint(databaseUrl) {
  const normalized = normalizedTarget(databaseUrl);
  return normalized
    ? createHash("sha256").update(normalized).digest("hex")
    : null;
}

function validExpiry(value, now = Date.now()) {
  if (typeof value !== "string" || value.length === 0) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

function currentTooling() {
  const dockerPath = findExecutable("docker", [
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    "/Applications/OrbStack.app/Contents/MacOS/xbin/docker",
  ]);
  const psqlPath = findExecutable("psql", [
    "/opt/homebrew/opt/libpq/bin/psql",
    "/usr/local/opt/libpq/bin/psql",
    "/Applications/Postgres.app/Contents/Versions/latest/bin/psql",
  ]);
  const cli = runQuiet(
    config.tooling_contract.supabase_cli_path,
    ["--version"],
    { HOME: isolatedProbeHome },
  );
  const runtime = dockerPath
    ? runQuiet(dockerPath, ["--version"])
    : null;
  const runtimeInfo =
    runtime?.status === 0
      ? runQuiet(dockerPath, ["info", "--format", "{{.ServerVersion}}"])
      : null;
  const psql = psqlPath
    ? runQuiet(psqlPath, ["--version"])
    : null;
  return {
    cliVersion:
      cli.status === 0 ? cli.stdout.trim().replace(/^v/, "") : null,
    projectConfigPresent: existsSync(
      config.tooling_contract.project_config_path,
    ),
    containerRuntimeAvailable: runtime?.status === 0,
    containerRuntimeResponding: runtimeInfo?.status === 0,
    psqlAvailable: psql?.status === 0,
  };
}

export function verifyPhase011Contract() {
  const result = runQuiet(process.execPath, [
    "scripts/run-atlas-canonical-baseline-package-phase-011.mjs",
  ]);
  if (result.status !== 0) return false;
  try {
    const parsed = JSON.parse(result.stdout);
    return (
      parsed.specification?.percentage === 100 &&
      parsed.conclusion?.homologation_untouched === true
    );
  } catch {
    return false;
  }
}

function captureEvidence(candidate) {
  return {
    executed: candidate.capture?.executed === true,
    exitZero: candidate.capture?.exit_zero === true,
    containsPublic:
      candidate.capture?.contains_public_schema === true,
    containsData:
      candidate.capture?.contains_data_statements === true,
    containsCredentials:
      candidate.capture?.contains_credentials === true,
    containsPersonalData:
      candidate.capture?.contains_personal_data === true,
    inventoryCreated:
      candidate.capture?.inventory_created === true,
    checksumCreated:
      candidate.capture?.checksum_created === true,
  };
}

export function assessIsolatedCapture({
  candidateEvidence,
  candidateApproval,
  databaseUrl,
  tooling,
  phase011ContractPassed,
  now = Date.now(),
}) {
  const fingerprint = targetFingerprint(databaseUrl);
  const capture = captureEvidence(candidateEvidence);
  const gates = {
    phase_011_contract_passed: phase011ContractPassed === true,
    supabase_cli_version_verified:
      tooling.cliVersion === config.tooling_contract.supabase_cli_version,
    db_dump_contract_verified:
      config.tooling_contract.command === "supabase db dump" &&
      config.tooling_contract.required_flags.includes("--db-url") &&
      config.tooling_contract.forbidden_flags.includes("--linked") &&
      config.tooling_contract.forbidden_flags.includes("--data-only"),
    project_config_present: tooling.projectConfigPresent === true,
    container_runtime_available:
      tooling.containerRuntimeAvailable === true,
    container_runtime_responding:
      tooling.containerRuntimeResponding === true,
    psql_available: tooling.psqlAvailable === true,
    approval_receipt_valid:
      candidateApproval.schema_version ===
        config.authorization_contract.schema_version &&
      candidateApproval.approved === true &&
      candidateApproval.approver_role ===
        config.authorization_contract.approver_role,
    approval_not_expired: validExpiry(
      candidateApproval.expires_at,
      now,
    ),
    approved_target_is_loopback:
      normalizedTarget(databaseUrl) !== null &&
      candidateApproval.target_kind ===
        config.source_policy.allowed_target_kind,
    target_fingerprint_matches:
      typeof fingerprint === "string" &&
      fingerprint.length === 64 &&
      candidateApproval.target_fingerprint === fingerprint,
    postgres_17_confirmed:
      candidateApproval.postgres_major ===
      config.source_policy.expected_postgres_major,
    isolated_target_disposable:
      candidateApproval.disposable === true,
    schema_only_or_synthetic_profile:
      candidateApproval.data_profile ===
      "schema_only_or_synthetic",
    target_connection_verified:
      candidateEvidence.target?.connection_verified === true,
    schema_dump_executed: capture.executed,
    schema_dump_exit_zero: capture.exitZero,
    schema_dump_contains_public: capture.containsPublic,
    schema_dump_has_no_data_statements: capture.containsData === false,
    schema_dump_privacy_scan_passed:
      capture.containsCredentials === false &&
      capture.containsPersonalData === false &&
      candidateEvidence.safety?.database_url_persisted === false &&
      candidateEvidence.safety?.raw_cli_output_persisted === false,
    schema_inventory_created: capture.inventoryCreated,
    checksum_created: capture.checksumCreated,
    evidence_sanitized:
      candidateEvidence.safety?.database_url_persisted === false &&
      candidateEvidence.safety?.raw_cli_output_persisted === false,
    remote_write_not_executed:
      candidateEvidence.safety?.remote_write_executed === false,
    live_homologation_not_touched:
      candidateEvidence.safety?.live_homologation_touched === false,
    linked_command_not_used:
      candidateEvidence.safety?.linked_command_used === false,
    build_not_executed:
      candidateEvidence.safety?.build_executed === false,
    package_not_created:
      candidateEvidence.safety?.package_created === false,
  };
  const entries = Object.entries(gates);
  const blockers = entries
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const passed = entries.length - blockers.length;

  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      blockers.length === 0
        ? "isolated_baseline_capture_complete"
        : "isolated_baseline_capture_preflight_ready_runtime_blocked",
    readiness: {
      passed,
      total: entries.length,
      percentage: Math.round((passed / entries.length) * 100),
      gates,
      blockers,
    },
    tooling: {
      supabaseCliVersion: tooling.cliVersion,
      projectConfigPresent: tooling.projectConfigPresent,
      containerRuntimeAvailable:
        tooling.containerRuntimeAvailable,
      containerRuntimeResponding:
        tooling.containerRuntimeResponding,
      psqlAvailable: tooling.psqlAvailable,
    },
    target: {
      supplied: Boolean(databaseUrl),
      acceptedAsLoopback: normalizedTarget(databaseUrl) !== null,
      fingerprintMatched:
        gates.target_fingerprint_matches === true,
      urlPersisted: false,
    },
    authorization: {
      approved: gates.approval_receipt_valid,
      notExpired: gates.approval_not_expired,
      remoteRead: false,
      remoteWrite: false,
      linkedCommand: false,
      build: false,
      releasePackage: false,
    },
    conclusion: {
      captureExecuted: capture.executed,
      captureAccepted: blockers.length === 0,
      homologationUntouched:
        gates.remote_write_not_executed &&
        gates.live_homologation_not_touched &&
        gates.linked_command_not_used,
      productionReady: false,
      nextPhase: config.next_phase,
    },
  };
}

function runMain() {
  const tooling = currentTooling();
  const result = assessIsolatedCapture({
    candidateEvidence: evidence,
    candidateApproval: approval,
    databaseUrl: process.env.ATLAS_BASELINE_CAPTURE_DATABASE_URL,
    tooling,
    phase011ContractPassed: verifyPhase011Contract(),
  });

  if (!process.argv.includes("--self-test")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const approved = {
    ...approval,
    approved: true,
    target_fingerprint: targetFingerprint(
      "postgresql://user:secret@127.0.0.1:5432/atlas_phase12",
    ),
    expires_at: "2099-01-01T00:00:00.000Z",
  };
  const complete = structuredClone(evidence);
  complete.status = "capture_complete";
  complete.target = {
    kind: "isolated_loopback_pg17",
    loopback: true,
    postgres_major: 17,
    disposable: true,
    fingerprint_matched: true,
    connection_verified: true,
  };
  Object.assign(complete.capture, {
    executed: true,
    exit_zero: true,
    contains_public_schema: true,
    contains_data_statements: false,
    contains_credentials: false,
    contains_personal_data: false,
    inventory_created: true,
    checksum_created: true,
  });
  const readyTooling = {
    cliVersion: config.tooling_contract.supabase_cli_version,
    projectConfigPresent: true,
    containerRuntimeAvailable: true,
    containerRuntimeResponding: true,
    psqlAvailable: true,
  };
  const accepted = assessIsolatedCapture({
    candidateEvidence: complete,
    candidateApproval: approved,
    databaseUrl:
      "postgresql://user:secret@127.0.0.1:5432/atlas_phase12",
    tooling: readyTooling,
    phase011ContractPassed: true,
    now: Date.parse("2028-01-01T00:00:00.000Z"),
  });
  const remoteMutant = assessIsolatedCapture({
    candidateEvidence: complete,
    candidateApproval: approved,
    databaseUrl:
      "postgresql://user:secret@db.example.com:5432/atlas_phase12",
    tooling: readyTooling,
    phase011ContractPassed: true,
    now: Date.parse("2028-01-01T00:00:00.000Z"),
  });
  const expiredMutant = assessIsolatedCapture({
    candidateEvidence: complete,
    candidateApproval: {
      ...approved,
      expires_at: "2027-01-01T00:00:00.000Z",
    },
    databaseUrl:
      "postgresql://user:secret@127.0.0.1:5432/atlas_phase12",
    tooling: readyTooling,
    phase011ContractPassed: true,
    now: Date.parse("2028-01-01T00:00:00.000Z"),
  });
  const dataMutant = structuredClone(complete);
  dataMutant.capture.contains_data_statements = true;
  const rejectedData = assessIsolatedCapture({
    candidateEvidence: dataMutant,
    candidateApproval: approved,
    databaseUrl:
      "postgresql://user:secret@127.0.0.1:5432/atlas_phase12",
    tooling: readyTooling,
    phase011ContractPassed: true,
    now: Date.parse("2028-01-01T00:00:00.000Z"),
  });

  if (
    accepted.status !== "isolated_baseline_capture_complete" ||
    !remoteMutant.readiness.blockers.includes(
      "approved_target_is_loopback",
    ) ||
    !expiredMutant.readiness.blockers.includes(
      "approval_not_expired",
    ) ||
    !rejectedData.readiness.blockers.includes(
      "schema_dump_has_no_data_statements",
    )
  ) {
    console.error(
      JSON.stringify(
        { accepted, remoteMutant, expiredMutant, rejectedData },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) runMain();

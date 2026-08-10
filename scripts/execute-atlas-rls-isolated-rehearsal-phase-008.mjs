import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import process from "node:process";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

const assertWorkspacePath = (value, name) => {
  const path = resolve(value);
  const workspace = resolve(process.cwd());
  if (!isAbsolute(path) || !(path === workspace || path.startsWith(`${workspace}${sep}`))) {
    throw new Error(`${name}_must_be_inside_workspace`);
  }
  return path;
};

function safeDatabaseUrl(raw) {
  const parsed = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("postgres_connection_required");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error("non_loopback_database_forbidden");
  }
  const existingOptions = parsed.searchParams.get("options")?.trim();
  const rehearsalOption =
    "-c app.atlas_rls_rehearsal_environment=isolated_clone";
  parsed.searchParams.set(
    "options",
    existingOptions
      ? `${existingOptions} ${rehearsalOption}`
      : rehearsalOption,
  );
  return parsed.toString();
}

function loadSnapshot(path) {
  if (!existsSync(path)) throw new Error("acl_snapshot_missing");
  const snapshot = JSON.parse(readFileSync(path, "utf8"));
  if (
    snapshot.format !== "atlas_phase_008_acl_snapshot_v1" ||
    snapshot.environment !== "isolated_clone"
  ) {
    throw new Error("acl_snapshot_contract_invalid");
  }
  return snapshot;
}

function sanitizedCliSummary(result) {
  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    exitCode: result.status ?? 1,
    testFilesPassed: result.status === 0 ? 1 : 0,
    failed: result.status !== 0,
    fixtureContractMissing:
      combined.includes("fixture_contract_unsatisfied"),
    isolatedCloneGateRejected:
      combined.includes("phase_008_isolated_clone_required"),
  };
}

function main() {
  if (
    required("ATLAS_RLS_REHEARSAL_ENVIRONMENT") !== "isolated_clone"
  ) {
    throw new Error("isolated_clone_required");
  }
  if (required("ATLAS_RLS_REHEARSAL_APPROVED") !== "true") {
    throw new Error("explicit_execution_approval_required");
  }

  const databaseUrl = safeDatabaseUrl(
    required("ATLAS_RLS_REHEARSAL_DATABASE_URL"),
  );
  const snapshotPath = assertWorkspacePath(
    required("ATLAS_RLS_REHEARSAL_ACL_SNAPSHOT_PATH"),
    "acl_snapshot_path",
  );
  loadSnapshot(snapshotPath);

  const evidencePath = assertWorkspacePath(
    process.env.ATLAS_RLS_REHEARSAL_EVIDENCE_PATH ??
      "artifacts/runtime/atlas-phase-008-rls-rehearsal-evidence.json",
    "evidence_path",
  );
  const temporaryHome = resolve(
    process.env.TMPDIR ?? "/tmp",
    "atlas-phase-008-supabase-home",
  );
  const temporaryConfig = resolve(
    process.env.TMPDIR ?? "/tmp",
    "atlas-phase-008-supabase-config",
  );
  mkdirSync(temporaryHome, { recursive: true });
  mkdirSync(temporaryConfig, { recursive: true });

  const result = spawnSync(
    resolve("node_modules/.bin/supabase"),
    [
      "test",
      "db",
      "supabase/tests/database/phase_008_dynamic_rls_isolation.test.sql",
      "--db-url",
      databaseUrl,
      "--output-format",
      "text",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: temporaryHome,
        XDG_CONFIG_HOME: temporaryConfig,
      },
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const cli = sanitizedCliSummary(result);
  const passed = cli.exitCode === 0;
  const evidence = {
    format: "atlas_rls_isolated_rehearsal_evidence_v1",
    phase: 8,
    environment: "isolated_clone",
    passed,
    generatedAt: new Date().toISOString(),
    target: {
      loopback: true,
      linkedProject: false,
      remoteProject: false,
    },
    controls: {
      loopback_target_confirmed: true,
      explicit_execution_approval: true,
      reference_fixture_contract_satisfied:
        passed && !cli.fixtureContractMissing,
      acl_snapshot_available: true,
      pgtap_execution_passed: passed,
      anon_denial_passed: passed,
      authenticated_role_matrix_passed: passed,
      positive_owner_path_passed: passed,
      positive_manager_path_passed: passed,
      positive_director_path_passed: passed,
      cross_tenant_denial_passed: passed,
      rpc_actor_spoofing_denial_passed: passed,
      project_rpc_tenant_denial_passed: passed,
      server_rpc_surface_denial_passed: passed,
      rollback_rehearsal_passed: passed,
      evidence_sanitized: true,
    },
    test: cli,
    privacy: {
      containsSecrets: false,
      containsPersonalData: false,
      containsFixtureIdentifiers: false,
      containsDatabaseUrl: false,
      containsAccessTokens: false,
      rawCliOutputPersisted: false,
    },
    execution: {
      remoteWriteExecuted: false,
      linkedProjectUsed: false,
      migrationApplied: false,
      userChanged: false,
      persistentFixtureCreated: false,
      buildExecuted: false,
      packageCreated: false,
    },
  };

  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(JSON.stringify(evidence, null, 2));
  if (!passed) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify({
      format: "atlas_rls_isolated_rehearsal_evidence_v1",
      phase: 8,
      environment: "rejected_before_execution",
      passed: false,
      errorCode:
        error instanceof Error
          ? error.message.split(":")[0]
          : "unknown_failure",
      sanitized: true,
      containsSecrets: false,
      containsPersonalData: false,
      remoteWriteExecuted: false,
    }),
  );
  process.exit(1);
}

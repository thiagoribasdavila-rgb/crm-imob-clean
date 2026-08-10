import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname, join } from "node:path";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-009-controlled-migration-readiness.json"),
);
const packageJson = JSON.parse(read("package.json"));

function listFilesRecursively(directory, ignored = new Set()) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? listFilesRecursively(path, ignored)
      : [path];
  });
}

function migrationInventory() {
  const migrationFiles = existsSync(config.migration_contract.directory)
    ? readdirSync(config.migration_contract.directory)
        .filter((file) => file.endsWith(".sql"))
        .sort()
    : [];
  const versions = new Map();

  for (const file of migrationFiles) {
    const version = file.match(/^([0-9]{14})_/)?.[1] ?? "invalid";
    const current = versions.get(version) ?? [];
    current.push(file);
    versions.set(version, current);
  }

  const duplicates = Object.fromEntries(
    [...versions.entries()].filter(([, files]) => files.length > 1),
  );
  const invalidFiles = versions.get("invalid") ?? [];

  return {
    totalFiles: migrationFiles.length,
    duplicateVersions: duplicates,
    duplicateVersionCount: Object.keys(duplicates).length,
    invalidFiles,
  };
}

function backupInventory() {
  const allowedFormats = config.backup_contract.allowed_formats;
  const ignored = new Set(["node_modules", ".next", "dist", ".git"]);
  const files = listFilesRecursively("artifacts", ignored);
  const candidates = files.filter((path) =>
    allowedFormats.some((format) => path.endsWith(format)),
  );

  return {
    candidateCount: candidates.length,
    sanitizedBackupAvailable:
      candidates.length > 0 &&
      candidates.every((path) => statSync(path).size > 0),
    persistedPaths: [],
  };
}

function commandAvailable(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: process.env.TMPDIR ?? "/tmp",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
  });

  return {
    available: result.status === 0,
    status: result.status,
  };
}

function collectLocalEvidence() {
  const migration = migrationInventory();
  const backup = backupInventory();
  const cliPath = "node_modules/.bin/supabase";
  const cli = existsSync(cliPath)
    ? commandAvailable(cliPath, ["--version"])
    : { available: false, status: null };
  const docker = commandAvailable("docker", ["info"]);
  const phase008Assessment = spawnSync(
    process.execPath,
    ["scripts/run-atlas-rls-isolated-rehearsal-phase-008.mjs"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  let phase008 = null;

  if (phase008Assessment.status === 0) {
    try {
      phase008 = JSON.parse(phase008Assessment.stdout);
    } catch {
      phase008 = null;
    }
  }

  const draft = listFilesRecursively(
    config.migration_contract.draft_directory,
  );
  const candidateNames = new Set(
    draft
      .filter(
        (path) =>
          path.endsWith(".sql") && !path.endsWith(".rollback.sql"),
      )
      .map((path) => basename(path, extname(path))),
  );
  const rollbackNames = new Set(
    draft
      .filter((path) => path.endsWith(".rollback.sql"))
      .map((path) => basename(path).replace(/\.rollback\.sql$/, "")),
  );
  const pairedDrafts = [...candidateNames].filter((name) =>
    rollbackNames.has(name),
  );

  return {
    supabase_cli_pinned:
      packageJson.devDependencies?.supabase ===
        config.toolchain_contract.supabase_cli_expected_version ||
      packageJson.dependencies?.supabase ===
        config.toolchain_contract.supabase_cli_expected_version,
    supabase_cli_available: cli.available,
    supabase_config_present: existsSync(
      config.toolchain_contract.supabase_config_path,
    ),
    docker_compatible_runtime_available: docker.available,
    sanitized_backup_available: backup.sanitizedBackupAvailable,
    local_migration_versions_unique:
      migration.duplicateVersionCount === 0 &&
      migration.invalidFiles.length === 0,
    candidate_and_rollback_paired: pairedDrafts.length > 0,
    phase_008_dynamic_rls_passed:
      phase008?.status === "isolated_rls_rehearsal_passed",
    inventory: {
      migrations: migration,
      backups: backup,
      pairedDraftCount: pairedDrafts.length,
      phase008Status: phase008?.status ?? "unavailable",
    },
  };
}

export function assessControlledMigrationReadiness({
  localEvidence,
  runtimeEvidence,
}) {
  const controls = Object.fromEntries(
    config.required_gates.map((gate) => [
      gate,
      gate in localEvidence
        ? localEvidence[gate] === true
        : runtimeEvidence[gate] === true,
    ]),
  );
  const entries = Object.entries(controls);
  const passed = entries.filter(([, value]) => value).length;
  const blockers = entries
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      blockers.length === 0
        ? "controlled_migration_rehearsal_ready"
        : "controlled_migration_rehearsal_blocked",
    score: {
      passed,
      total: entries.length,
      percentage: Math.round((passed / entries.length) * 100),
    },
    controls: {
      values: controls,
      blockers,
    },
    inventory: localEvidence.inventory,
    execution: {
      remote_write_executed: false,
      linked_project_used: false,
      migration_created: false,
      migration_renamed: false,
      migration_applied: false,
      user_changed: false,
      business_data_persisted: false,
      build_executed: false,
      package_created: false,
    },
    conclusion: {
      migration_chain_safe:
        controls.local_migration_versions_unique === true &&
        controls.remote_migration_history_captured === true,
      clone_rehearsal_ready:
        controls.supabase_config_present === true &&
        controls.docker_compatible_runtime_available === true &&
        controls.local_stack_healthy === true &&
        controls.sanitized_backup_available === true,
      correction_migration_authorized: blockers.length === 0,
      production_ready: false,
      next_phase: config.next_phase,
    },
  };
}

const selfTest = process.argv.includes("--self-test");
const localEvidence = collectLocalEvidence();
const runtimeEvidence = selfTest
  ? Object.fromEntries(config.required_gates.map((gate) => [gate, true]))
  : config.runtime_evidence;
const selfTestLocalEvidence = selfTest
  ? {
      ...localEvidence,
      ...Object.fromEntries(
        config.required_gates.map((gate) => [gate, true]),
      ),
    }
  : localEvidence;
const result = assessControlledMigrationReadiness({
  localEvidence: selfTestLocalEvidence,
  runtimeEvidence,
});

if (
  selfTest &&
  result.status !== "controlled_migration_rehearsal_ready"
) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

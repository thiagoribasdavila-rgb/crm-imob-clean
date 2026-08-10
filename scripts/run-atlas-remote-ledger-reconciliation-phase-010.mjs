import { existsSync, readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-010-remote-ledger-reconciliation.json"),
);
const evidence = JSON.parse(
  read(config.remote_ledger_contract.evidence_path),
);

function collectLocalLedger() {
  const files = existsSync(config.local_ledger_contract.directory)
    ? readdirSync(config.local_ledger_contract.directory)
        .filter((file) => file.endsWith(".sql"))
        .sort()
    : [];
  const versions = new Map();
  const invalidFiles = [];

  for (const file of files) {
    const version = file.match(/^([0-9]{14})_/)?.[1];
    if (!version) {
      invalidFiles.push(file);
      continue;
    }

    const current = versions.get(version) ?? [];
    current.push(file);
    versions.set(version, current);
  }

  const duplicateVersions = Object.fromEntries(
    [...versions.entries()].filter(([, names]) => names.length > 1),
  );

  return {
    files,
    fileCount: files.length,
    invalidFiles,
    duplicateVersions,
    duplicateVersionCount: Object.keys(duplicateVersions).length,
  };
}

function collisionMappingsConfirmed(snapshot) {
  const remoteNames = new Set(
    snapshot.confirmed_collision_mappings.map((item) => item.remote_name),
  );

  return config.collision_reconciliation.every(
    (collision) =>
      remoteNames.has(collision.remote_first_name) &&
      remoteNames.has(collision.remote_second_name),
  );
}

export function assessRemoteLedger({ snapshot, localLedger }) {
  const sanitization = snapshot.sanitization ?? {};
  const execution = snapshot.execution ?? {};
  const controls = {
    remote_snapshot_present:
      snapshot.schema_version ===
      "atlas.remote_migration_ledger_summary.v1",
    remote_project_healthy:
      snapshot.project_health ===
      config.remote_ledger_contract.expected_health,
    remote_postgres_17:
      snapshot.postgres_major ===
      config.remote_ledger_contract.expected_postgres_major,
    remote_versions_unique:
      snapshot.remote_ledger.unique_remote_versions ===
      snapshot.remote_ledger.migration_count,
    remote_counts_match_contract:
      snapshot.remote_ledger.migration_count ===
        config.remote_ledger_contract.expected_remote_migration_count &&
      snapshot.remote_ledger.unique_remote_versions ===
        config.remote_ledger_contract.expected_unique_remote_versions &&
      snapshot.remote_ledger.names_with_embedded_original_version ===
        config.remote_ledger_contract
          .expected_names_with_embedded_version,
    embedded_version_strategy_confirmed:
      snapshot.remote_ledger.version_strategy ===
      "application_time_remote_versions_with_original_versions_embedded_in_names",
    all_collision_mappings_confirmed:
      collisionMappingsConfirmed(snapshot),
    local_inventory_matches_contract:
      localLedger.fileCount ===
        config.local_ledger_contract.expected_file_count &&
      localLedger.invalidFiles.length === 0 &&
      (
        config.local_ledger_contract.known_post_snapshot_additions ??
        []
      ).every((file) => localLedger.files.includes(file)) &&
      localLedger.duplicateVersionCount ===
        config.local_ledger_contract.expected_duplicate_version_count,
    local_duplicates_still_fail_closed:
      localLedger.duplicateVersionCount > 0 &&
      config.execution_policy.migration_rename_enabled === false,
    direct_cli_parity_rejected:
      snapshot.local_ledger.direct_cli_version_parity === false &&
      config.local_ledger_contract.direct_cli_parity_expected === false,
    baseline_strategy_required:
      config.baseline_strategy.required === true &&
      config.baseline_strategy.requires_sanitized_clone === true &&
      config.baseline_strategy.requires_dynamic_rls_rehearsal === true,
    remote_repair_prohibited:
      config.execution_policy.migration_repair_enabled === false,
    local_rename_prohibited:
      config.execution_policy.migration_rename_enabled === false &&
      config.collision_reconciliation.every(
        (collision) => collision.rename_authorized === false,
      ),
    remote_write_not_executed:
      execution.remote_write_executed === false &&
      execution.migration_repair_executed === false &&
      execution.migration_push_executed === false &&
      execution.user_changed === false &&
      execution.business_data_changed === false,
    evidence_sanitized:
      sanitization.contains_project_ref === false &&
      sanitization.contains_credentials === false &&
      sanitization.contains_personal_data === false &&
      sanitization.contains_database_url === false &&
      sanitization.contains_access_tokens === false &&
      sanitization.contains_raw_sql_results === false,
  };
  const entries = Object.entries(controls);
  const blockers = entries
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const passed = entries.length - blockers.length;

  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      blockers.length === 0
        ? "remote_ledger_reconciled_baseline_required"
        : "remote_ledger_reconciliation_blocked",
    score: {
      passed,
      total: entries.length,
      percentage: Math.round((passed / entries.length) * 100),
    },
    controls: {
      values: controls,
      blockers,
    },
    ledger: {
      remoteMigrationCount: snapshot.remote_ledger.migration_count,
      uniqueRemoteVersions:
        snapshot.remote_ledger.unique_remote_versions,
      namesWithEmbeddedOriginalVersion:
        snapshot.remote_ledger.names_with_embedded_original_version,
      localMigrationFileCount: localLedger.fileCount,
      localDuplicateVersionCount: localLedger.duplicateVersionCount,
      localDuplicateVersions: localLedger.duplicateVersions,
      directCliVersionParity: false,
    },
    execution: {
      remote_metadata_read: true,
      remote_schema_query_executed: false,
      remote_write_executed: false,
      migration_repair_executed: false,
      migration_push_executed: false,
      migration_renamed: false,
      branch_created: false,
      build_executed: false,
      package_created: false,
    },
    conclusion: {
      remote_history_captured: controls.remote_snapshot_present,
      remote_history_internally_consistent:
        controls.remote_versions_unique &&
        controls.remote_counts_match_contract,
      migration_chain_safe_for_direct_cli: false,
      direct_cli_push_authorized: false,
      remote_history_repair_authorized: false,
      local_migration_rename_authorized: false,
      isolated_canonical_baseline_required: true,
      production_ready: false,
      next_phase: config.next_phase,
    },
  };
}

const localLedger = collectLocalLedger();
const result = assessRemoteLedger({ snapshot: evidence, localLedger });

if (process.argv.includes("--self-test")) {
  const mutant = structuredClone(evidence);
  mutant.remote_ledger.unique_remote_versions -= 1;
  const rejected = assessRemoteLedger({
    snapshot: mutant,
    localLedger,
  });

  if (
    result.status !== "remote_ledger_reconciled_baseline_required" ||
    rejected.status !== "remote_ledger_reconciliation_blocked" ||
    !rejected.controls.blockers.includes("remote_versions_unique")
  ) {
    console.error(JSON.stringify({ result, rejected }, null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify(result, null, 2));

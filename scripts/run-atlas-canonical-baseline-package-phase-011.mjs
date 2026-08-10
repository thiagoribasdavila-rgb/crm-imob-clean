import { existsSync, readdirSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-011-canonical-baseline-package.json"),
);
const manifest = JSON.parse(
  read("artifacts/runtime/phase-011/canonical-baseline-manifest.json"),
);
const remoteLedger = JSON.parse(
  read(config.source_contract.remote_ledger_evidence_path),
);

function collectLocalHistory() {
  const files = existsSync(config.local_history_contract.directory)
    ? readdirSync(config.local_history_contract.directory)
        .filter((file) => file.endsWith(".sql"))
        .sort()
    : [];
  const versions = new Map();
  for (const file of files) {
    const version = file.match(/^([0-9]{14})_/)?.[1] ?? "invalid";
    versions.set(version, [...(versions.get(version) ?? []), file]);
  }

  return {
    fileCount: files.length,
    invalidFileCount: versions.get("invalid")?.length ?? 0,
    duplicateVersionCount: [...versions.entries()].filter(
      ([version, names]) => version !== "invalid" && names.length > 1,
    ).length,
  };
}

function runtimeGateValues(evidence) {
  return {
    cli_contract_verified: evidence.cli_contract_verified === true,
    remote_ledger_evidence_present:
      evidence.remote_ledger_evidence_present === true,
    postgres_17_target_confirmed:
      evidence.postgres_17_target_confirmed === true,
    project_config_present: evidence.project_config_present === true,
    container_runtime_available:
      evidence.container_runtime_available === true,
    isolated_target_available: evidence.isolated_target_available === true,
    sanitized_schema_snapshot_available:
      evidence.sanitized_schema_snapshot_available === true,
    schema_inventory_available:
      evidence.schema_inventory_available === true,
    acl_snapshot_available: evidence.acl_snapshot_available === true,
    dynamic_rls_rehearsal_passed:
      evidence.dynamic_rls_rehearsal_passed === true,
    schema_diff_reviewed: evidence.schema_diff_reviewed === true,
    baseline_sql_generated: evidence.baseline_sql_generated === true,
    baseline_replay_passed: evidence.baseline_replay_passed === true,
    synthetic_seed_replay_passed:
      evidence.synthetic_seed_replay_passed === true,
    rollback_rehearsal_passed:
      evidence.rollback_rehearsal_passed === true,
    manual_approval_present: evidence.manual_approval_present === true,
    evidence_sanitized: evidence.evidence_sanitized === true,
    remote_write_not_executed: evidence.remote_write_executed === false,
    live_db_pull_not_executed: evidence.live_db_pull_executed === false,
    live_migration_history_not_changed:
      evidence.live_migration_history_changed === false,
    business_data_not_copied: evidence.business_data_copied === false,
    auth_user_data_not_copied:
      evidence.auth_user_data_copied === false,
    build_not_executed: evidence.build_executed === false,
    release_package_not_created: evidence.package_created === false,
  };
}

function privacyIsClean(privacy) {
  return Object.values(privacy).every((value) => value === false);
}

export function assessCanonicalBaseline({
  candidate,
  localHistory,
  ledger,
}) {
  const structuralControls = {
    contract_versioned:
      config.schema_version === "atlas.10x.phase-011.v1" &&
      candidate.schema_version ===
        "atlas.canonical_baseline_manifest.v1",
    isolated_target_required:
      config.target_environment ===
        "isolated_clone_or_loopback_pg17" &&
      config.source_environment_alias === "atlas-v3-homologacao",
    cli_contract_current:
      candidate.tooling.supabase_cli_version ===
        config.supabase_cli_contract.verified_version &&
      candidate.tooling.cli_help_verified === true,
    cli_target_is_explicit:
      config.supabase_cli_contract.explicit_target_flag_required ===
        true &&
      config.supabase_cli_contract.allowed_target_flags.includes(
        "--local",
      ) &&
      config.supabase_cli_contract.allowed_target_flags.includes(
        "--db-url",
      ),
    live_homologation_pull_forbidden:
      config.supabase_cli_contract.live_homologation_db_pull_allowed ===
        false &&
      config.supabase_cli_contract.live_homologation_db_dump_allowed ===
        false,
    postgres_17_is_canonical_target:
      candidate.target.postgres_major === 17 &&
      ledger.postgres_major === 17,
    remote_ledger_matches_phase_010:
      candidate.inventory.remote_migration_count ===
        config.source_contract.expected_remote_migration_count &&
      ledger.remote_ledger.migration_count ===
        config.source_contract.expected_remote_migration_count,
    local_history_matches_contract:
      localHistory.fileCount ===
        config.local_history_contract.expected_file_count &&
      localHistory.invalidFileCount === 0 &&
      localHistory.duplicateVersionCount ===
        config.local_history_contract.expected_duplicate_version_count,
    historical_chain_is_immutable:
      candidate.inventory.historical_chain_modified === false &&
      config.local_history_contract.history_is_immutable_reference ===
        true &&
      config.local_history_contract.rename_existing_files === false,
    structural_inventory_is_complete:
      config.baseline_content_contract.required_structural_objects
        .length >= 12 &&
      config.baseline_content_contract.required_schemas.includes(
        "public",
      ),
    rls_and_grants_are_separate:
      config.baseline_content_contract.required_security_invariants.includes(
        "rls_and_data_api_grants_validated_separately",
      ),
    exposed_tables_require_rls:
      config.baseline_content_contract.required_security_invariants.includes(
        "rls_enabled_on_every_exposed_table",
      ),
    views_are_not_implicit_bypass:
      config.baseline_content_contract.required_security_invariants.includes(
        "exposed_views_use_security_invoker_or_are inaccessible_to_api_roles",
      ),
    security_definer_requires_audit:
      config.baseline_content_contract.required_security_invariants.includes(
        "security_definer_functions_have_explicit_search_path_and_execute_audit",
      ),
    synthetic_fixtures_only:
      config.baseline_content_contract.synthetic_fixtures_only ===
        true &&
      config.baseline_content_contract.business_data_allowed ===
        false &&
      config.baseline_content_contract.auth_user_rows_allowed === false,
    all_package_artifacts_declared:
      config.required_package_artifacts.length === 10 &&
      config.required_package_artifacts.includes(
        "manual_approval_receipt.json",
      ),
    privacy_manifest_is_clean: privacyIsClean(candidate.privacy),
    no_remote_or_release_execution:
      Object.values(candidate.execution).every(
        (value) => value === false,
      ) &&
      config.execution_policy.remote_ddl_enabled === false &&
      config.execution_policy.remote_dml_enabled === false &&
      config.execution_policy.allows_build === false &&
      config.execution_policy.allows_release_package === false,
  };
  const structuralEntries = Object.entries(structuralControls);
  const structuralBlockers = structuralEntries
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const gates = runtimeGateValues(candidate.runtime_evidence);
  const runtimeBlockers = config.required_runtime_gates.filter(
    (gate) => !gates[gate],
  );
  const passedRuntime =
    config.required_runtime_gates.length - runtimeBlockers.length;

  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      structuralBlockers.length > 0
        ? "canonical_baseline_package_contract_invalid"
        : runtimeBlockers.length > 0
          ? "canonical_baseline_package_prepared_execution_blocked"
          : "canonical_baseline_rehearsal_ready",
    specification: {
      passed:
        structuralEntries.length - structuralBlockers.length,
      total: structuralEntries.length,
      percentage: Math.round(
        ((structuralEntries.length - structuralBlockers.length) /
          structuralEntries.length) *
          100,
      ),
      controls: structuralControls,
      blockers: structuralBlockers,
    },
    readiness: {
      passed: passedRuntime,
      total: config.required_runtime_gates.length,
      percentage: Math.round(
        (passedRuntime / config.required_runtime_gates.length) * 100,
      ),
      gates,
      blockers: runtimeBlockers,
    },
    inventory: {
      remoteMigrationCount:
        candidate.inventory.remote_migration_count,
      localMigrationFileCount: localHistory.fileCount,
      localDuplicateVersionCount:
        localHistory.duplicateVersionCount,
      projectConfigPresent:
        candidate.tooling.project_config_present,
      containerRuntimeAvailable:
        candidate.tooling.container_runtime_available,
    },
    authorization: {
      live_homologation_db_pull: false,
      live_homologation_db_dump: false,
      migration_repair: false,
      migration_push: false,
      historical_migration_rename: false,
      remote_user_change: false,
      remote_business_write: false,
      build: false,
      release_package: false,
      isolated_rehearsal:
        structuralBlockers.length === 0 &&
        runtimeBlockers.length === 0,
    },
    conclusion: {
      package_contract_complete: structuralBlockers.length === 0,
      baseline_generated:
        candidate.runtime_evidence.baseline_sql_generated === true,
      baseline_replayed:
        candidate.runtime_evidence.baseline_replay_passed === true,
      homologation_untouched:
        candidate.runtime_evidence.remote_write_executed === false &&
        candidate.runtime_evidence.live_db_pull_executed === false &&
        candidate.runtime_evidence
          .live_migration_history_changed === false,
      production_ready: false,
      next_phase: config.next_phase,
    },
  };
}

const localHistory = collectLocalHistory();
const result = assessCanonicalBaseline({
  candidate: manifest,
  localHistory,
  ledger: remoteLedger,
});

if (process.argv.includes("--self-test")) {
  const ready = structuredClone(manifest);
  for (const gate of Object.keys(ready.runtime_evidence)) {
    if (
      gate.endsWith("_executed") ||
      gate.endsWith("_changed") ||
      gate.endsWith("_copied") ||
      gate === "package_created"
    ) {
      ready.runtime_evidence[gate] = false;
    } else {
      ready.runtime_evidence[gate] = true;
    }
  }
  ready.target = {
    type: "loopback_pg17",
    postgres_major: 17,
    loopback: true,
    disposable: true,
    linked_project: false,
  };
  const accepted = assessCanonicalBaseline({
    candidate: ready,
    localHistory,
    ledger: remoteLedger,
  });
  const mutant = structuredClone(ready);
  mutant.runtime_evidence.business_data_copied = true;
  const rejected = assessCanonicalBaseline({
    candidate: mutant,
    localHistory,
    ledger: remoteLedger,
  });

  if (
    result.status !==
      "canonical_baseline_package_prepared_execution_blocked" ||
    accepted.status !== "canonical_baseline_rehearsal_ready" ||
    rejected.status !==
      "canonical_baseline_package_prepared_execution_blocked" ||
    !rejected.readiness.blockers.includes(
      "business_data_not_copied",
    )
  ) {
    console.error(JSON.stringify({ result, accepted, rejected }, null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify(result, null, 2));

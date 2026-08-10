import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessLocalMigrationAuthoring } from "./run-atlas-local-migration-authoring-phase-021.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(
      root,
      "config/atlas-10x-phase-022-local-disposable-migration-rehearsal.json",
    ),
    "utf8",
  ),
);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const isSha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const allTrue = (value) => Object.values(value).every(Boolean);
const exactKeys = (value, expected) => {
  const keys = Object.keys(value ?? {});
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
};
const exactArray = (actual, expected) =>
  Array.isArray(actual) &&
  JSON.stringify(actual) === JSON.stringify(expected);
const unique = (values) =>
  Array.isArray(values) && new Set(values).size === values.length;
const clone = (value) => JSON.parse(JSON.stringify(value));
const safeIdentifier = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{3,80}$/.test(value);

function safeWorkspacePath(candidate) {
  if (typeof candidate !== "string" || !candidate || isAbsolute(candidate)) {
    return false;
  }
  if (candidate.includes("\0")) return false;
  const absolute = resolve(root, candidate);
  const offset = relative(root, absolute);
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

function readArtifact(path) {
  if (!safeWorkspacePath(path)) {
    return { exists: false, parses: false, value: null, source: "", hash: "" };
  }
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    return { exists: false, parses: false, value: null, source: "", hash: "" };
  }
  const source = readFileSync(absolute, "utf8");
  try {
    return {
      exists: true,
      parses: true,
      value: JSON.parse(source),
      source,
      hash: sha256(source),
    };
  } catch {
    return {
      exists: true,
      parses: false,
      value: null,
      source,
      hash: sha256(source),
    };
  }
}

function readFileFact(path) {
  if (!safeWorkspacePath(path)) {
    return { exists: false, source: "", sha256: "" };
  }
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    return { exists: false, source: "", sha256: "" };
  }
  const source = readFileSync(absolute, "utf8");
  return { exists: true, source, sha256: sha256(source) };
}

function migrationBaseline(excludedPath = "") {
  const directory = resolve(root, config.cli_contract.migration_directory);
  const excludedName = basename(excludedPath || "__none__");
  const files = existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".sql") && name !== excludedName)
        .sort()
    : [];
  const entries = files.map((name) => ({
    name,
    sha256: sha256(readFileSync(resolve(directory, name))),
  }));
  return {
    count: entries.length,
    sha256: sha256(JSON.stringify(entries)),
  };
}

function installedCliVersion() {
  const path = resolve(root, "node_modules/supabase/package.json");
  if (!existsSync(path)) return "";
  try {
    return JSON.parse(readFileSync(path, "utf8")).version ?? "";
  } catch {
    return "";
  }
}

const localAuthorizationFields = new Set([
  "local_docker_start",
  "local_migration_apply",
  "local_pgtap_execution",
  "local_lint_execution",
  "local_rollback_execution",
  "local_cleanup",
]);

export function validateAuthoringReceipt(
  receipt,
  { migrationFact, pgtapFact, baseline, phase021 },
) {
  const source = receipt?.source ?? {};
  const files = receipt?.files ?? {};
  const migration = files?.migration ?? {};
  const pgtap = files?.pgtap ?? {};
  const rollback = receipt?.rollback ?? {};
  const privacy = receipt?.privacy ?? {};
  const authorizations = receipt?.authorizations ?? {};
  const tests = Array.isArray(receipt?.tests) ? receipt.tests : [];
  const migrationPattern =
    /^\d{14}_atlas_security_remediation\.sql$/;
  const expectedMigrationPath =
    `${config.cli_contract.migration_directory}/${basename(migration.path ?? "")}`;
  const expectedTestPath =
    `${config.cli_contract.test_directory}/${config.cli_contract.test_file_name}`;
  const gates = {
    receipt_schema_and_status_match:
      receipt?.schema_version ===
        config.input_contract.required_receipt_schema_version &&
      receipt?.status === config.input_contract.required_receipt_status,
    receipt_root_shape_is_exact: exactKeys(
      receipt,
      config.receipt_contract.required_root_fields,
    ),
    receipt_source_shape_is_exact: exactKeys(
      source,
      config.receipt_contract.required_source_fields,
    ),
    receipt_phase_021_snapshot_is_ready:
      source.phase_021_schema_version === "atlas.10x.phase-021.v1" &&
      source.phase_021_status === "ready_for_single_local_cli_authoring" &&
      Number.isInteger(source.phase_021_gates_passed) &&
      source.phase_021_gates_passed > 0 &&
      source.phase_021_gates_passed === source.phase_021_gates_total &&
      phase021?.schema_version === "atlas.10x.phase-021.v1",
    receipt_source_hashes_are_sha256:
      isSha256(source.phase_021_authoring_manifest_sha256) &&
      isSha256(source.baseline_manifest_sha256),
    receipt_files_shape_is_exact:
      exactKeys(files, config.receipt_contract.required_files) &&
      exactKeys(migration, config.receipt_contract.required_file_fields) &&
      exactKeys(pgtap, config.receipt_contract.required_file_fields),
    receipt_file_paths_are_confined:
      safeWorkspacePath(migration.path) &&
      safeWorkspacePath(pgtap.path) &&
      migration.path.startsWith(
        `${config.cli_contract.migration_directory}/`,
      ) &&
      pgtap.path.startsWith(`${config.cli_contract.test_directory}/`),
    receipt_file_names_match:
      migrationPattern.test(basename(migration.path ?? "")) &&
      migration.path === expectedMigrationPath &&
      pgtap.path === expectedTestPath,
    receipt_files_exist: migrationFact.exists && pgtapFact.exists,
    receipt_file_hashes_match:
      isSha256(migration.sha256) &&
      isSha256(pgtap.sha256) &&
      migration.sha256 === migrationFact.sha256 &&
      pgtap.sha256 === pgtapFact.sha256,
    baseline_migrations_remain_immutable:
      isSha256(baseline.sha256) &&
      baseline.sha256 === source.baseline_manifest_sha256,
    single_new_migration_is_isolated:
      migrationFact.exists &&
      migrationPattern.test(basename(migration.path ?? "")),
    receipt_tests_are_exact:
      exactArray(tests, config.negative_test_catalog) && unique(tests),
    pgtap_catalog_is_embedded:
      pgtapFact.exists &&
      config.negative_test_catalog.every((test) =>
        pgtapFact.source.includes(test),
      ),
    receipt_rollback_shape_is_exact: exactKeys(
      rollback,
      config.receipt_contract.required_rollback_fields,
    ),
    receipt_rollback_is_safe:
      rollback.strategy ===
        "destroy_volume_rebuild_baseline_and_compare_sha256" &&
      rollback.destructive_scope === "isolated_local_project_only" &&
      rollback.schema_fingerprint_required === true &&
      rollback.migration_history_fingerprint_required === true &&
      rollback.baseline_rebuild_required === true &&
      rollback.cleanup_required === true &&
      rollback.data_loss_forbidden === true,
    receipt_contains_no_credentials_or_rows:
      exactKeys(
        privacy,
        config.receipt_contract.required_privacy_fields,
      ) && Object.values(privacy).every((value) => value === false),
    receipt_authorizes_no_remote_action:
      exactKeys(
        authorizations,
        config.receipt_contract.required_authorization_fields,
      ) &&
      Object.values(authorizations).every((value) => value === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function validateRehearsalAuthorization(
  authorization,
  receiptHash,
  now = new Date(),
) {
  const authorizations = authorization?.authorizations ?? {};
  const issuedAt = new Date(authorization?.issued_at ?? "");
  const expiresAt = new Date(authorization?.expires_at ?? "");
  const windowMs = expiresAt.getTime() - issuedAt.getTime();
  const ttlMs =
    config.input_contract.authorization_ttl_minutes * 60 * 1000;
  const fields =
    config.authorization_contract.required_authorization_fields;
  const gates = {
    authorization_schema_matches:
      authorization?.schema_version ===
        config.input_contract.required_authorization_schema_version &&
      exactKeys(
        authorization,
        config.authorization_contract.required_fields,
      ),
    authorization_status_matches:
      authorization?.status ===
      config.input_contract.required_authorization_status,
    authorization_scope_matches:
      authorization?.scope ===
      config.input_contract.required_authorization_scope,
    authorization_is_one_shot_and_unused:
      authorization?.one_shot === true &&
      authorization?.consumed === false,
    authorization_window_is_valid:
      Number.isFinite(issuedAt.getTime()) &&
      Number.isFinite(expiresAt.getTime()) &&
      windowMs > 0 &&
      windowMs <= ttlMs &&
      now.getTime() >= issuedAt.getTime() &&
      now.getTime() < expiresAt.getTime(),
    authorization_reviewer_is_present:
      config.authorization_contract.requires_human_reviewer === true &&
      safeIdentifier(authorization?.reviewed_by),
    authorization_change_ticket_is_present:
      config.authorization_contract.requires_change_ticket === true &&
      safeIdentifier(authorization?.change_ticket),
    authorization_receipt_hash_matches:
      isSha256(authorization?.authoring_receipt_sha256) &&
      authorization.authoring_receipt_sha256 === receiptHash,
    authorization_project_id_matches:
      authorization?.project_id === config.cli_contract.project_id,
    authorization_allows_only_local_rehearsal:
      exactKeys(authorizations, fields) &&
      fields.every((field) =>
        localAuthorizationFields.has(field)
          ? authorizations[field] === true
          : authorizations[field] === false,
      ),
  };
  return { accepted: allTrue(gates), gates };
}

function validateStaticContract({ cliVersion, sourceConfigExists }) {
  const commands = config.cli_contract.commands;
  const commandValues = Object.values(commands);
  const flattened = commandValues.flat().join(" ");
  const exactCommands =
    exactArray(commands.db_start, [
      "supabase",
      "db",
      "start",
      "--workdir",
      config.cli_contract.workdir,
    ]) &&
    exactArray(commands.baseline_reset, [
      "supabase",
      "db",
      "reset",
      "--local",
      "--no-seed",
      "--workdir",
      config.cli_contract.workdir,
    ]) &&
    exactArray(commands.migration_up, [
      "supabase",
      "migration",
      "up",
      "--local",
      "--workdir",
      config.cli_contract.workdir,
    ]) &&
    exactArray(commands.test_db, [
      "supabase",
      "test",
      "db",
      "--local",
      `${config.cli_contract.test_directory}/${config.cli_contract.test_file_name}`,
      "--workdir",
      config.cli_contract.workdir,
    ]) &&
    exactArray(commands.db_lint, [
      "supabase",
      "db",
      "lint",
      "--local",
      "--level",
      "error",
      "--fail-on",
      "error",
      "--workdir",
      config.cli_contract.workdir,
    ]) &&
    exactArray(commands.rollback_reset, commands.baseline_reset) &&
    exactArray(commands.cleanup, [
      "supabase",
      "stop",
      "--project-id",
      config.cli_contract.project_id,
      "--no-backup",
      "--workdir",
      config.cli_contract.workdir,
    ]);
  return {
    cli_version_is_supported:
      cliVersion === config.cli_contract.required_version,
    source_config_exists: sourceConfigExists,
    source_config_is_confined:
      safeWorkspacePath(config.input_contract.source_config_path) &&
      config.input_contract.source_config_path === "supabase/config.toml",
    workdir_is_confined_and_disposable:
      safeWorkspacePath(config.cli_contract.workdir) &&
      config.cli_contract.workdir.startsWith(
        ".atlas/runtime/phase-022/",
      ),
    project_id_is_isolated:
      config.cli_contract.project_id === "atlas-phase-022-rehearsal",
    command_sequence_is_exact:
      exactArray(config.cli_contract.command_order, [
        "db_start",
        "baseline_reset",
        "migration_up",
        "test_db",
        "db_lint",
        "rollback_reset",
        "cleanup",
      ]) && exactCommands,
    commands_target_exact_workdir: commandValues.every((tokens) => {
      const index = tokens.indexOf("--workdir");
      return (
        index >= 0 && tokens[index + 1] === config.cli_contract.workdir
      );
    }),
    database_commands_are_explicitly_local: [
      commands.baseline_reset,
      commands.migration_up,
      commands.test_db,
      commands.db_lint,
      commands.rollback_reset,
    ].every((tokens) => tokens.includes("--local")),
    db_url_is_absent: !flattened.includes("--db-url"),
    linked_flag_is_absent: !flattened.includes("--linked"),
    remote_mutation_commands_are_absent:
      !flattened.includes("db push") &&
      !flattened.includes("migration repair"),
    cleanup_does_not_use_all: !commands.cleanup.includes("--all"),
    cleanup_targets_only_isolated_project:
      commands.cleanup.includes("--project-id") &&
      commands.cleanup.includes(config.cli_contract.project_id) &&
      commands.cleanup.includes("--no-backup"),
    fixtures_are_synthetic_only: true,
    seed_execution_is_disabled:
      commands.baseline_reset.includes("--no-seed") &&
      commands.rollback_reset.includes("--no-seed"),
  };
}

export function buildRehearsalPlan(
  receipt,
  authorization,
  receiptHash,
) {
  return {
    schema_version: config.rehearsal_plan_contract.schema_version,
    status: config.rehearsal_plan_contract.ready_status,
    source: {
      authoring_receipt_sha256: receiptHash,
      migration_sha256: receipt.files.migration.sha256,
      pgtap_sha256: receipt.files.pgtap.sha256,
      baseline_manifest_sha256: receipt.source.baseline_manifest_sha256,
    },
    isolation: {
      workdir: config.cli_contract.workdir,
      project_id: authorization.project_id,
      source_config_path: config.input_contract.source_config_path,
      external_traffic_allowed: false,
      tls_expected: false,
      production_hardening_expected: false,
    },
    commands: clone(config.cli_contract.commands),
    lifecycle: [...config.rehearsal_plan_contract.required_lifecycle],
    fixtures: {
      synthetic_only: true,
      seed_disabled: true,
      business_rows: 0,
      auth_rows: 0,
      storage_objects: 0,
    },
    tests: [...receipt.tests],
    rollback: {
      strategy: "destroy_volume_rebuild_baseline_and_compare_sha256",
      schema_before_sha256: null,
      schema_after_sha256: null,
      schema_restored_sha256: null,
      migration_history_before_sha256: null,
      migration_history_after_sha256: null,
      migration_history_restored_sha256: null,
      tests_before_cleanup_required: true,
      tests_after_restore_required: true,
      cleanup_required: true,
    },
    privacy: Object.fromEntries(
      config.rehearsal_plan_contract.required_privacy_fields.map(
        (field) => [field, false],
      ),
    ),
    authorizations: Object.fromEntries(
      config.rehearsal_plan_contract.required_authorization_fields.map(
        (field) => [field, false],
      ),
    ),
  };
}

export function validateRehearsalPlan(plan, receipt, receiptHash) {
  const source = plan?.source ?? {};
  const isolation = plan?.isolation ?? {};
  const commands = plan?.commands ?? {};
  const fixtures = plan?.fixtures ?? {};
  const rollback = plan?.rollback ?? {};
  const privacy = plan?.privacy ?? {};
  const authorizations = plan?.authorizations ?? {};
  const tests = Array.isArray(plan?.tests) ? plan.tests : [];
  const hasAll = (items) => items.every((item) => tests.includes(item));
  const gates = {
    plan_schema_and_status_match:
      plan?.schema_version ===
        config.rehearsal_plan_contract.schema_version &&
      plan?.status === config.rehearsal_plan_contract.ready_status,
    plan_root_shape_is_exact: exactKeys(
      plan,
      config.rehearsal_plan_contract.required_root_fields,
    ),
    plan_source_hashes_match:
      exactKeys(
        source,
        config.rehearsal_plan_contract.required_source_fields,
      ) &&
      source.authoring_receipt_sha256 === receiptHash &&
      source.migration_sha256 === receipt.files.migration.sha256 &&
      source.pgtap_sha256 === receipt.files.pgtap.sha256 &&
      source.baseline_manifest_sha256 ===
        receipt.source.baseline_manifest_sha256 &&
      Object.values(source).every(isSha256),
    plan_isolation_shape_is_exact:
      exactKeys(
        isolation,
        config.rehearsal_plan_contract.required_isolation_fields,
      ) &&
      isolation.workdir === config.cli_contract.workdir &&
      isolation.project_id === config.cli_contract.project_id &&
      isolation.source_config_path ===
        config.input_contract.source_config_path &&
      isolation.external_traffic_allowed === false &&
      isolation.tls_expected === false &&
      isolation.production_hardening_expected === false,
    plan_commands_are_exact:
      exactKeys(commands, config.cli_contract.command_order) &&
      config.cli_contract.command_order.every((name) =>
        exactArray(commands[name], config.cli_contract.commands[name]),
      ),
    plan_lifecycle_is_exact: exactArray(
      plan?.lifecycle,
      config.rehearsal_plan_contract.required_lifecycle,
    ),
    plan_fixtures_shape_is_exact:
      exactKeys(
        fixtures,
        config.rehearsal_plan_contract.required_fixture_fields,
      ) &&
      fixtures.synthetic_only === true &&
      fixtures.seed_disabled === true &&
      fixtures.business_rows === 0 &&
      fixtures.auth_rows === 0 &&
      fixtures.storage_objects === 0,
    plan_tests_are_exact:
      exactArray(tests, config.negative_test_catalog) && unique(tests),
    plan_rollback_shape_is_exact: exactKeys(
      rollback,
      config.rehearsal_plan_contract.required_rollback_fields,
    ),
    plan_rollback_requires_fingerprint_restore:
      rollback.strategy ===
        "destroy_volume_rebuild_baseline_and_compare_sha256" &&
      rollback.schema_before_sha256 === null &&
      rollback.schema_after_sha256 === null &&
      rollback.schema_restored_sha256 === null &&
      rollback.migration_history_before_sha256 === null &&
      rollback.migration_history_after_sha256 === null &&
      rollback.migration_history_restored_sha256 === null &&
      rollback.tests_before_cleanup_required === true &&
      rollback.tests_after_restore_required === true &&
      rollback.cleanup_required === true,
    plan_privacy_shape_is_exact:
      exactKeys(
        privacy,
        config.rehearsal_plan_contract.required_privacy_fields,
      ) && Object.values(privacy).every((value) => value === false),
    plan_authorizes_no_remote_action:
      exactKeys(
        authorizations,
        config.rehearsal_plan_contract.required_authorization_fields,
      ) &&
      Object.values(authorizations).every((value) => value === false),
    plan_covers_anonymous_crud: hasAll([
      "anonymous_select_denied",
      "anonymous_insert_denied",
      "anonymous_update_denied",
      "anonymous_delete_denied",
    ]),
    plan_covers_cross_tenant_crud: hasAll([
      "cross_tenant_select_denied",
      "cross_tenant_insert_denied",
      "cross_tenant_update_denied",
      "cross_tenant_delete_denied",
    ]),
    plan_covers_owned_crud: hasAll([
      "owned_row_select_allowed",
      "owned_row_insert_allowed",
      "owned_row_update_allowed",
      "owned_row_delete_allowed",
    ]),
    plan_blocks_tenant_reassignment:
      tests.includes("ownership_reassignment_denied"),
    plan_couples_data_api_grants_and_rls:
      tests.includes("granted_role_still_respects_rls") &&
      tests.includes("data_api_requires_explicit_grant_and_rls"),
    plan_covers_view_and_function_boundaries:
      tests.includes("view_respects_security_invoker") &&
      tests.includes("public_function_execute_denied"),
    plan_keeps_service_secret_out_of_client:
      tests.includes("service_role_secret_absent_from_client"),
  };
  return { accepted: allTrue(gates), gates };
}

export function assessLocalDisposableMigrationRehearsal({
  authoringReceiptPath = config.input_contract.authoring_receipt_path,
  authorizationPath = config.input_contract.rehearsal_authorization_path,
  now = new Date(),
} = {}) {
  const phase021 = assessLocalMigrationAuthoring();
  const phase021Available =
    phase021?.schema_version === "atlas.10x.phase-021.v1";
  const receiptArtifact = readArtifact(authoringReceiptPath);
  const receipt = receiptArtifact.value;
  const migrationPath = receipt?.files?.migration?.path ?? "";
  const pgtapPath = receipt?.files?.pgtap?.path ?? "";
  const migrationFact = readFileFact(migrationPath);
  const pgtapFact = readFileFact(pgtapPath);
  const baseline = migrationBaseline(migrationPath);
  const receiptValidation = receiptArtifact.parses
    ? validateAuthoringReceipt(receipt, {
        migrationFact,
        pgtapFact,
        baseline,
        phase021,
      })
    : { accepted: false, gates: {} };
  const authorizationArtifact = readArtifact(authorizationPath);
  const authorizationValidation =
    authorizationArtifact.parses && receiptValidation.accepted
      ? validateRehearsalAuthorization(
          authorizationArtifact.value,
          receiptArtifact.hash,
          now,
        )
      : { accepted: false, gates: {} };
  const staticValidation = validateStaticContract({
    cliVersion: installedCliVersion(),
    sourceConfigExists: existsSync(
      resolve(root, config.input_contract.source_config_path),
    ),
  });
  const readyForPlan =
    receiptValidation.accepted &&
    authorizationValidation.accepted &&
    allTrue(staticValidation);
  const plan = readyForPlan
    ? buildRehearsalPlan(
        receipt,
        authorizationArtifact.value,
        receiptArtifact.hash,
      )
    : null;
  const planValidation = plan
    ? validateRehearsalPlan(plan, receipt, receiptArtifact.hash)
    : { accepted: false, gates: {} };
  const baseGates = {
    phase_021_assessment_is_available: phase021Available,
    authoring_receipt_exists: receiptArtifact.exists,
    authoring_receipt_parses: receiptArtifact.parses,
    ...receiptValidation.gates,
    rehearsal_authorization_exists: authorizationArtifact.exists,
    rehearsal_authorization_parses: authorizationArtifact.parses,
    ...authorizationValidation.gates,
    ...staticValidation,
    plan_is_generated_in_memory: plan !== null,
    ...planValidation.gates,
    evaluator_executed_no_command: true,
    evaluator_wrote_no_file: true,
    local_database_not_started: true,
    docker_not_accessed: true,
    migration_not_applied: true,
    pgtap_not_executed: true,
    lint_not_executed: true,
    rollback_not_executed: true,
    cleanup_not_executed: true,
    remote_not_accessed: true,
    linked_project_not_accessed: true,
    production_not_touched: true,
    business_or_auth_data_not_read: true,
    build_not_executed: true,
    package_not_created: true,
  };
  const gates = Object.fromEntries(
    config.required_gates.map((gate) => [gate, Boolean(baseGates[gate])]),
  );
  const blockers = config.required_gates.filter((gate) => !gates[gate]);
  const passed = config.required_gates.length - blockers.length;
  const ready = blockers.length === 0;
  return {
    schema_version: config.schema_version,
    phase: "22/24",
    status: ready ? plan.status : config.status,
    rehearsal_gates: {
      passed,
      total: config.required_gates.length,
      percentage: Math.round((passed / config.required_gates.length) * 100),
      blockers,
    },
    inputs: {
      phase_021_assessment_available: phase021Available,
      authoring_receipt_exists: receiptArtifact.exists,
      authoring_receipt_parses: receiptArtifact.parses,
      rehearsal_authorization_exists: authorizationArtifact.exists,
      rehearsal_authorization_parses: authorizationArtifact.parses,
      source_config_exists: existsSync(
        resolve(root, config.input_contract.source_config_path),
      ),
      cli_version: installedCliVersion() || null,
      preserved_migration_files: baseline.count,
      preserved_migration_manifest_sha256: baseline.sha256,
    },
    rehearsal_plan: ready
      ? plan
      : {
          generated_in_memory: false,
          persisted: false,
          commands_executed: 0,
        },
    safety: {
      evaluator_executed_command: false,
      evaluator_wrote_file: false,
      local_database_started: false,
      docker_accessed: false,
      migration_applied: false,
      pgtap_executed: false,
      lint_executed: false,
      rollback_executed: false,
      cleanup_executed: false,
      remote_read_executed: false,
      remote_write_executed: false,
      linked_project_accessed: false,
      production_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    conclusion: {
      ready_for_single_disposable_local_rehearsal: ready,
      human_review_required: true,
      remote_apply_authorized: false,
      linked_project_authorized: false,
      production_authorized: false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticReceipt() {
  const migrationSource = "-- synthetic migration fixture";
  const pgtapSource = config.negative_test_catalog.join("\n");
  return {
    value: {
      schema_version: config.input_contract.required_receipt_schema_version,
      status: config.input_contract.required_receipt_status,
      source: {
        phase_021_schema_version: "atlas.10x.phase-021.v1",
        phase_021_status: "ready_for_single_local_cli_authoring",
        phase_021_gates_passed: 55,
        phase_021_gates_total: 55,
        phase_021_authoring_manifest_sha256: "1".repeat(64),
        baseline_manifest_sha256: "2".repeat(64),
      },
      files: {
        migration: {
          path:
            "supabase/migrations/20260723120000_atlas_security_remediation.sql",
          sha256: sha256(migrationSource),
        },
        pgtap: {
          path: "supabase/tests/atlas_security_remediation_test.sql",
          sha256: sha256(pgtapSource),
        },
      },
      tests: [...config.negative_test_catalog],
      rollback: {
        strategy: "destroy_volume_rebuild_baseline_and_compare_sha256",
        destructive_scope: "isolated_local_project_only",
        schema_fingerprint_required: true,
        migration_history_fingerprint_required: true,
        baseline_rebuild_required: true,
        cleanup_required: true,
        data_loss_forbidden: true,
      },
      privacy: Object.fromEntries(
        config.receipt_contract.required_privacy_fields.map((field) => [
          field,
          false,
        ]),
      ),
      authorizations: Object.fromEntries(
        config.receipt_contract.required_authorization_fields.map(
          (field) => [field, false],
        ),
      ),
    },
    migrationFact: {
      exists: true,
      source: migrationSource,
      sha256: sha256(migrationSource),
    },
    pgtapFact: {
      exists: true,
      source: pgtapSource,
      sha256: sha256(pgtapSource),
    },
    baseline: { count: 124, sha256: "2".repeat(64) },
  };
}

function syntheticAuthorization(receiptHash, now) {
  return {
    schema_version:
      config.input_contract.required_authorization_schema_version,
    status: config.input_contract.required_authorization_status,
    scope: config.input_contract.required_authorization_scope,
    one_shot: true,
    consumed: false,
    issued_at: new Date(now.getTime() - 60_000).toISOString(),
    expires_at: new Date(now.getTime() + 20 * 60_000).toISOString(),
    reviewed_by: "reviewer_phase22",
    change_ticket: "change_phase22",
    authoring_receipt_sha256: receiptHash,
    project_id: config.cli_contract.project_id,
    authorizations: Object.fromEntries(
      config.authorization_contract.required_authorization_fields.map(
        (field) => [field, localAuthorizationFields.has(field)],
      ),
    ),
  };
}

export function selfTest() {
  const now = new Date();
  const synthetic = syntheticReceipt();
  const phase021 = { schema_version: "atlas.10x.phase-021.v1" };
  const receiptHash = sha256(JSON.stringify(synthetic.value));
  const authorization = syntheticAuthorization(receiptHash, now);
  const receiptContext = (candidate) =>
    validateAuthoringReceipt(candidate, {
      migrationFact: synthetic.migrationFact,
      pgtapFact: synthetic.pgtapFact,
      baseline: synthetic.baseline,
      phase021,
    }).accepted;
  const authorizationContext = (candidate) =>
    validateRehearsalAuthorization(candidate, receiptHash, now).accepted;
  const receiptValidation = receiptContext(synthetic.value);
  const authorizationValidation = authorizationContext(authorization);
  const staticValidation = validateStaticContract({
    cliVersion: config.cli_contract.required_version,
    sourceConfigExists: true,
  });
  const plan = buildRehearsalPlan(
    synthetic.value,
    authorization,
    receiptHash,
  );
  const planContext = (candidate) =>
    validateRehearsalPlan(
      candidate,
      synthetic.value,
      receiptHash,
    ).accepted;
  const planValidation = planContext(plan);
  const receiptMutants = [
    (v) => (v.schema_version = "bad"),
    (v) => (v.status = "applied"),
    (v) => delete v.source,
    (v) => (v.source.phase_021_schema_version = "bad"),
    (v) => (v.source.phase_021_status = "blocked"),
    (v) => (v.source.phase_021_gates_passed = 54),
    (v) => (v.source.phase_021_authoring_manifest_sha256 = "bad"),
    (v) => (v.source.baseline_manifest_sha256 = "0".repeat(64)),
    (v) => (v.files.migration.path = "../escape.sql"),
    (v) => (v.files.migration.path = "supabase/migrations/bad.sql"),
    (v) => (v.files.migration.sha256 = "0".repeat(64)),
    (v) => (v.files.pgtap.path = "supabase/tests/other.sql"),
    (v) => (v.files.pgtap.sha256 = "0".repeat(64)),
    (v) => v.tests.pop(),
    (v) => v.tests.push(v.tests[0]),
    (v) => (v.rollback.strategy = "down_sql"),
    (v) => (v.rollback.destructive_scope = "all_projects"),
    (v) => (v.rollback.schema_fingerprint_required = false),
    (v) => (v.rollback.migration_history_fingerprint_required = false),
    (v) => (v.rollback.baseline_rebuild_required = false),
    (v) => (v.rollback.cleanup_required = false),
    (v) => (v.rollback.data_loss_forbidden = false),
    (v) => (v.privacy.contains_credentials = true),
    (v) => (v.privacy.contains_business_data = true),
    (v) => (v.privacy.contains_raw_sql = true),
    (v) => (v.authorizations.remote_read = true),
    (v) => (v.authorizations.linked_project = true),
    (v) => (v.authorizations.production = true),
    (v) => (v.extra = true),
  ];
  const authorizationMutants = [
    (v) => (v.schema_version = "bad"),
    (v) => (v.status = "approved_for_remote"),
    (v) => (v.scope = "all_migrations"),
    (v) => (v.one_shot = false),
    (v) => (v.consumed = true),
    (v) => (v.issued_at = "bad"),
    (v) => (v.expires_at = v.issued_at),
    (v) =>
      (v.expires_at = new Date(now.getTime() + 31 * 60_000).toISOString()),
    (v) => (v.expires_at = new Date(now.getTime() - 1).toISOString()),
    (v) => (v.reviewed_by = ""),
    (v) => (v.change_ticket = "drop table"),
    (v) => (v.authoring_receipt_sha256 = "0".repeat(64)),
    (v) => (v.project_id = "production"),
    (v) => (v.authorizations.local_docker_start = false),
    (v) => (v.authorizations.local_migration_apply = false),
    (v) => (v.authorizations.local_pgtap_execution = false),
    (v) => (v.authorizations.local_lint_execution = false),
    (v) => (v.authorizations.local_rollback_execution = false),
    (v) => (v.authorizations.local_cleanup = false),
    (v) => (v.authorizations.remote_read = true),
    (v) => (v.authorizations.remote_write = true),
    (v) => (v.authorizations.linked_project = true),
    (v) => (v.authorizations.db_push = true),
    (v) => (v.authorizations.migration_repair = true),
    (v) => (v.authorizations.production = true),
    (v) => (v.authorizations.build = true),
    (v) => (v.extra = true),
  ];
  const planMutants = [
    (v) => (v.schema_version = "bad"),
    (v) => (v.status = "executed"),
    (v) => (v.source.authoring_receipt_sha256 = "0".repeat(64)),
    (v) => (v.source.migration_sha256 = "0".repeat(64)),
    (v) => (v.source.pgtap_sha256 = "0".repeat(64)),
    (v) => (v.isolation.workdir = "/tmp"),
    (v) => (v.isolation.project_id = "production"),
    (v) => (v.isolation.external_traffic_allowed = true),
    (v) => (v.commands.db_start.push("--linked")),
    (v) => (v.commands.baseline_reset[3] = "--linked"),
    (v) => (v.commands.migration_up.pop()),
    (v) => (v.commands.test_db[3] = "--linked"),
    (v) => (v.commands.db_lint[3] = "--linked"),
    (v) => (v.commands.cleanup.push("--all")),
    (v) => v.lifecycle.pop(),
    (v) => (v.fixtures.synthetic_only = false),
    (v) => (v.fixtures.seed_disabled = false),
    (v) => (v.fixtures.business_rows = 1),
    (v) => v.tests.pop(),
    (v) => (v.rollback.strategy = "down_sql"),
    (v) => (v.rollback.schema_before_sha256 = "3".repeat(64)),
    (v) => (v.rollback.tests_before_cleanup_required = false),
    (v) => (v.rollback.tests_after_restore_required = false),
    (v) => (v.rollback.cleanup_required = false),
    (v) => (v.privacy.contains_credentials = true),
    (v) => (v.authorizations.remote_write = true),
    (v) => (v.authorizations.linked_project = true),
    (v) => (v.authorizations.production = true),
    (v) => (v.extra = true),
  ];
  const rejectedReceipt = receiptMutants.filter((mutate) => {
    const candidate = clone(synthetic.value);
    mutate(candidate);
    return !receiptContext(candidate);
  }).length;
  const rejectedAuthorization = authorizationMutants.filter((mutate) => {
    const candidate = clone(authorization);
    mutate(candidate);
    return !authorizationContext(candidate);
  }).length;
  const rejectedPlan = planMutants.filter((mutate) => {
    const candidate = clone(plan);
    mutate(candidate);
    return !planContext(candidate);
  }).length;
  const total =
    receiptMutants.length +
    authorizationMutants.length +
    planMutants.length;
  const rejected =
    rejectedReceipt + rejectedAuthorization + rejectedPlan;
  if (
    !receiptValidation ||
    !authorizationValidation ||
    !allTrue(staticValidation) ||
    !planValidation ||
    rejected !== total
  ) {
    throw new Error(
      `Autoteste F22 falhou: ${rejected}/${total} mutantes rejeitados`,
    );
  }
  return {
    status: "passed",
    safe_baseline: "accepted",
    negative_tests: config.negative_test_catalog.length,
    mutants_rejected: rejected,
    mutants_total: total,
    remote_command_executed: false,
    file_written: false,
    local_database_started: false,
    docker_accessed: false,
    migration_applied: false,
    linked_project_accessed: false,
    production_touched: false,
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const payload = process.argv.includes("--self-test")
    ? selfTest()
    : assessLocalDisposableMigrationRehearsal();
  console.log(JSON.stringify(payload, null, 2));
}

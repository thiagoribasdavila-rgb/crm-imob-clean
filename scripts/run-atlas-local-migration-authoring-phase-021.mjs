import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessLocalRemediationSpecification } from "./run-atlas-local-remediation-specification-phase-020.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(root, "config/atlas-10x-phase-021-local-migration-authoring.json"),
    "utf8",
  ),
);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const isSha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const allTrue = (object) => Object.values(object).every(Boolean);
const exactKeys = (value, allowed) => {
  const keys = Object.keys(value ?? {});
  return (
    keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key))
  );
};
const unique = (values) =>
  Array.isArray(values) && new Set(values).size === values.length;
const safeIdentifier = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{3,80}$/.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const exactArray = (actual, expected) =>
  Array.isArray(actual) &&
  JSON.stringify(actual) === JSON.stringify(expected);

function safeWorkspacePath(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  if (isAbsolute(candidate) || candidate.includes("\0")) return false;
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

function migrationBaseline() {
  const directory = resolve(root, config.cli_contract.migration_directory);
  const files = existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".sql"))
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
  const packagePath = resolve(root, "node_modules/supabase/package.json");
  if (!existsSync(packagePath)) return "";
  try {
    return JSON.parse(readFileSync(packagePath, "utf8")).version ?? "";
  } catch {
    return "";
  }
}

function validatePhase020Specification(specification) {
  const privacy = specification?.privacy ?? {};
  const authorizations = specification?.authorizations ?? {};
  const items = Array.isArray(specification?.items)
    ? specification.items
    : [];
  return {
    phase_020_specification_schema_matches:
      specification?.schema_version ===
        config.input_contract.required_specification_schema_version &&
      specification?.status ===
        config.input_contract.required_specification_status,
    phase_020_specification_has_approved_workstreams:
      items.length > 0 &&
      specification?.summary?.approved_workstreams === items.length,
    phase_020_specification_has_no_sql_or_object_names:
      privacy.contains_raw_sql === false &&
      privacy.contains_object_names === false &&
      items.every(
        (item) =>
          item.raw_sql_included === false &&
          item.migration_file_created === false &&
          !Object.hasOwn(item, "sql") &&
          !Object.hasOwn(item, "object_name"),
      ),
    phase_020_specification_authorizes_no_action:
      Object.keys(authorizations).length > 0 &&
      Object.values(authorizations).every((value) => value === false),
  };
}

const localAuthorizationFields = new Set([
  "local_sql_authoring",
  "local_migration_generation",
  "local_pgtap_authoring",
  "local_test_execution",
  "local_lint_execution",
]);

export function validateLocalMigrationAuthorization(
  authorization,
  specificationHash,
  baselineHash,
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
    authorization_specification_hash_matches:
      isSha256(authorization?.specification_sha256) &&
      authorization.specification_sha256 === specificationHash,
    authorization_baseline_hash_is_sha256:
      isSha256(authorization?.baseline_manifest_sha256) &&
      authorization.baseline_manifest_sha256 === baselineHash,
    authorization_migration_name_matches:
      authorization?.migration_name ===
        config.authorization_contract.migration_name &&
      safeIdentifier(authorization.migration_name),
    authorization_allows_only_local_authoring:
      exactKeys(authorizations, fields) &&
      fields.every((field) =>
        localAuthorizationFields.has(field)
          ? authorizations[field] === true
          : authorizations[field] === false,
      ),
  };
  return { accepted: allTrue(gates), gates };
}

function validateStaticContract(cliVersion) {
  const commands = [
    config.cli_contract.migration_new_tokens,
    config.cli_contract.test_db_tokens,
    config.cli_contract.db_lint_tokens,
  ];
  const flattened = commands.flat().join(" ");
  return {
    cli_version_is_supported:
      cliVersion === config.cli_contract.required_version,
    cli_commands_are_exact:
      exactArray(config.cli_contract.migration_new_tokens, [
        "supabase",
        "migration",
        "new",
        config.authorization_contract.migration_name,
      ]) &&
      exactArray(config.cli_contract.test_db_tokens, [
        "supabase",
        "test",
        "db",
        "--local",
      ]) &&
      exactArray(config.cli_contract.db_lint_tokens, [
        "supabase",
        "db",
        "lint",
        "--local",
        "--level",
        "error",
      ]),
    cli_commands_are_local_only:
      config.cli_contract.test_db_tokens.includes("--local") &&
      config.cli_contract.db_lint_tokens.includes("--local"),
    forbidden_cli_tokens_absent:
      config.cli_contract.forbidden_tokens.every(
        (token) => !flattened.includes(token),
      ),
    migration_directory_is_confined:
      safeWorkspacePath(config.cli_contract.migration_directory) &&
      config.cli_contract.migration_directory === "supabase/migrations",
    test_directory_is_confined:
      safeWorkspacePath(config.cli_contract.test_directory) &&
      config.cli_contract.test_directory === "supabase/tests",
    existing_migrations_are_immutable:
      config.cli_contract.existing_migrations_must_remain_immutable === true,
  };
}

export function buildAuthoringManifest(
  specification,
  authorization,
  sourceHashes,
  cliVersion,
) {
  return {
    schema_version:
      config.authoring_manifest_contract.schema_version,
    status: config.authoring_manifest_contract.ready_status,
    source: {
      specification_sha256: sourceHashes.specification,
      authorization_sha256: sourceHashes.authorization,
      baseline_manifest_sha256: sourceHashes.baseline,
    },
    cli: {
      version: cliVersion,
      migration_new_tokens: [...config.cli_contract.migration_new_tokens],
      test_db_tokens: [...config.cli_contract.test_db_tokens],
      db_lint_tokens: [...config.cli_contract.db_lint_tokens],
    },
    migration: {
      name: authorization.migration_name,
      directory: config.cli_contract.migration_directory,
      existing_files_immutable: true,
      new_files_expected: 2,
      generated_by_this_evaluator: false,
      applied: false,
    },
    rollback: {
      required: true,
      human_review_required: true,
      data_loss_forbidden: true,
      restore_point_required: true,
      verification_required: true,
    },
    negative_tests: [...config.negative_test_catalog],
    privacy: Object.fromEntries(
      config.authoring_manifest_contract.required_privacy_fields.map(
        (field) => [field, false],
      ),
    ),
    authorizations: Object.fromEntries(
      config.authoring_manifest_contract.required_authorization_fields.map(
        (field) => [field, false],
      ),
    ),
  };
}

export function validateAuthoringManifest(
  manifest,
  authorization,
  sourceHashes,
  cliVersion,
) {
  const source = manifest?.source ?? {};
  const cli = manifest?.cli ?? {};
  const migration = manifest?.migration ?? {};
  const rollback = manifest?.rollback ?? {};
  const tests = Array.isArray(manifest?.negative_tests)
    ? manifest.negative_tests
    : [];
  const privacy = manifest?.privacy ?? {};
  const authorizations = manifest?.authorizations ?? {};
  const hasAll = (values) => values.every((value) => tests.includes(value));
  const expectedSource = {
    specification_sha256: sourceHashes.specification,
    authorization_sha256: sourceHashes.authorization,
    baseline_manifest_sha256: sourceHashes.baseline,
  };
  const gates = {
    manifest_schema_matches:
      exactKeys(
        manifest,
        config.authoring_manifest_contract.required_root_fields,
      ) &&
      manifest?.schema_version ===
        config.authoring_manifest_contract.schema_version,
    manifest_status_matches:
      manifest?.status ===
      config.authoring_manifest_contract.ready_status,
    manifest_source_shape_is_exact: exactKeys(
      source,
      config.authoring_manifest_contract.required_source_fields,
    ),
    manifest_source_hashes_match: Object.entries(expectedSource).every(
      ([field, value]) => isSha256(source[field]) && source[field] === value,
    ),
    manifest_cli_shape_is_exact: exactKeys(
      cli,
      config.authoring_manifest_contract.required_cli_fields,
    ),
    manifest_cli_commands_match:
      cli.version === cliVersion &&
      exactArray(
        cli.migration_new_tokens,
        config.cli_contract.migration_new_tokens,
      ) &&
      exactArray(cli.test_db_tokens, config.cli_contract.test_db_tokens) &&
      exactArray(cli.db_lint_tokens, config.cli_contract.db_lint_tokens),
    manifest_migration_shape_is_exact: exactKeys(
      migration,
      config.authoring_manifest_contract.required_migration_fields,
    ),
    manifest_migration_is_single_and_unapplied:
      migration.name === authorization?.migration_name &&
      migration.directory === config.cli_contract.migration_directory &&
      migration.existing_files_immutable === true &&
      migration.new_files_expected === 2 &&
      migration.generated_by_this_evaluator === false &&
      migration.applied === false,
    manifest_requires_rollback:
      Object.values(rollback).length > 0 &&
      Object.values(rollback).every((value) => value === true),
    manifest_rollback_shape_is_exact: exactKeys(
      rollback,
      config.authoring_manifest_contract.required_rollback_fields,
    ),
    manifest_negative_tests_are_exact:
      exactArray(tests, config.negative_test_catalog) && unique(tests),
    manifest_covers_anonymous_crud_denials: hasAll([
      "anonymous_select_denied",
      "anonymous_insert_denied",
      "anonymous_update_denied",
      "anonymous_delete_denied",
    ]),
    manifest_covers_cross_tenant_crud_denials: hasAll([
      "cross_tenant_select_denied",
      "cross_tenant_insert_denied",
      "cross_tenant_update_denied",
      "cross_tenant_delete_denied",
    ]),
    manifest_covers_owned_row_crud: hasAll([
      "owned_row_select_allowed",
      "owned_row_insert_allowed",
      "owned_row_update_allowed",
      "owned_row_delete_allowed",
    ]),
    manifest_blocks_tenant_reassignment:
      tests.includes("ownership_reassignment_denied"),
    manifest_couples_data_api_grants_and_rls:
      tests.includes("granted_role_still_respects_rls") &&
      tests.includes("data_api_requires_explicit_grant_and_rls"),
    manifest_covers_view_and_function_boundaries:
      tests.includes("view_respects_security_invoker") &&
      tests.includes("public_function_execute_denied"),
    manifest_keeps_service_secret_out_of_client:
      tests.includes("service_role_secret_absent_from_client"),
    manifest_contains_no_credentials_or_rows:
      exactKeys(
        privacy,
        config.authoring_manifest_contract.required_privacy_fields,
      ) &&
      Object.values(privacy).every((value) => value === false),
    manifest_authorizes_no_remote_or_apply_action:
      exactKeys(
        authorizations,
        config.authoring_manifest_contract.required_authorization_fields,
      ) &&
      Object.values(authorizations).every((value) => value === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function assessLocalMigrationAuthoring({
  authorizationPath = config.input_contract.authorization_path,
  now = new Date(),
} = {}) {
  const phase020 = assessLocalRemediationSpecification();
  const phase020Available =
    phase020?.schema_version === "atlas.10x.phase-020.v1";
  const specification =
    phase020?.conclusion?.ready_for_local_migration_authoring === true
      ? phase020.local_specification
      : null;
  const specificationValidation = specification
    ? validatePhase020Specification(specification)
    : {
        phase_020_specification_schema_matches: false,
        phase_020_specification_has_approved_workstreams: false,
        phase_020_specification_has_no_sql_or_object_names: false,
        phase_020_specification_authorizes_no_action: false,
      };
  const specificationSource = specification
    ? JSON.stringify(specification)
    : "";
  const specificationHash = specification
    ? sha256(specificationSource)
    : "";
  const baseline = migrationBaseline();
  const authorization = readArtifact(authorizationPath);
  const authorizationValidation =
    authorization.parses && specification
      ? validateLocalMigrationAuthorization(
          authorization.value,
          specificationHash,
          baseline.sha256,
          now,
        )
      : { accepted: false, gates: {} };
  const cliVersion = installedCliVersion();
  const staticValidation = validateStaticContract(cliVersion);
  const sourceHashes = {
    specification: specificationHash,
    authorization: authorization.hash,
    baseline: baseline.sha256,
  };
  const manifest =
    specification && authorizationValidation.accepted
      ? buildAuthoringManifest(
          specification,
          authorization.value,
          sourceHashes,
          cliVersion,
        )
      : null;
  const manifestValidation = manifest
    ? validateAuthoringManifest(
        manifest,
        authorization.value,
        sourceHashes,
        cliVersion,
      )
    : { accepted: false, gates: {} };
  const baseGates = {
    phase_020_assessment_is_available: phase020Available,
    phase_020_specification_is_ready: specification !== null,
    ...specificationValidation,
    phase_020_specification_hash_is_sha256: isSha256(specificationHash),
    authorization_exists: authorization.exists,
    authorization_parses: authorization.parses,
    ...authorizationValidation.gates,
    ...staticValidation,
    manifest_is_generated_in_memory: manifest !== null,
    ...manifestValidation.gates,
    remote_command_not_executed: true,
    migration_not_generated_or_applied: true,
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
    phase: "21/24",
    status: ready ? manifest.status : config.status,
    authoring_gates: {
      passed,
      total: config.required_gates.length,
      percentage: Math.round((passed / config.required_gates.length) * 100),
      blockers,
    },
    inputs: {
      phase_020_specification_ready: Boolean(specification),
      authorization_exists: authorization.exists,
      authorization_parses: authorization.parses,
      cli_version: cliVersion || null,
      migration_baseline_files: baseline.count,
      migration_baseline_sha256: baseline.sha256,
    },
    authoring_manifest: ready
      ? manifest
      : {
          generated_in_memory: false,
          persisted: false,
          migration_files_created: 0,
          test_files_created: 0,
        },
    safety: {
      evaluator_executed_command: false,
      evaluator_wrote_file: false,
      remote_read_executed: false,
      remote_write_executed: false,
      linked_project_accessed: false,
      migration_generated: false,
      migration_applied: false,
      existing_migration_modified: false,
      production_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    conclusion: {
      ready_for_single_local_cli_authoring: ready,
      remote_apply_authorized: false,
      linked_project_authorized: false,
      production_authorized: false,
      human_review_required: true,
      next_phase: config.next_phase,
    },
  };
}

function syntheticSpecification() {
  return {
    schema_version:
      config.input_contract.required_specification_schema_version,
    status: config.input_contract.required_specification_status,
    source: {
      plan_sha256: "1".repeat(64),
      approval_sha256: "2".repeat(64),
      observation_sha256: "3".repeat(64),
      catalog_sha256: "4".repeat(64),
    },
    summary: {
      approved_workstreams: 2,
      deferred_workstreams: 1,
      approved_findings: 5,
      migration_files_created: 0,
    },
    items: [
      {
        workstream_id: "WS-RLS-001",
        raw_sql_included: false,
        migration_file_created: false,
      },
      {
        workstream_id: "WS-GRANT-002",
        raw_sql_included: false,
        migration_file_created: false,
      },
    ],
    privacy: {
      contains_credentials: false,
      contains_personal_data: false,
      contains_business_data: false,
      contains_auth_user_data: false,
      contains_object_names: false,
      contains_raw_sql: false,
      contains_raw_cli_output: false,
    },
    authorizations: {
      sql_authoring: false,
      migration_generation: false,
      remote_read: false,
      remote_write: false,
      migration_apply: false,
      db_push: false,
      migration_repair: false,
      branch_mutation: false,
      production: false,
      business_rows_read: false,
      auth_rows_read: false,
      storage_objects_read: false,
      build: false,
      release_package: false,
    },
  };
}

function syntheticAuthorization(
  specificationHash,
  baselineHash,
  now,
) {
  return {
    schema_version:
      config.input_contract.required_authorization_schema_version,
    status: config.input_contract.required_authorization_status,
    scope: config.input_contract.required_authorization_scope,
    one_shot: true,
    consumed: false,
    issued_at: new Date(now.getTime() - 60 * 1000).toISOString(),
    expires_at: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
    reviewed_by: "reviewer_phase21",
    change_ticket: "change_phase21",
    specification_sha256: specificationHash,
    baseline_manifest_sha256: baselineHash,
    migration_name: config.authorization_contract.migration_name,
    authorizations: Object.fromEntries(
      config.authorization_contract.required_authorization_fields.map(
        (field) => [field, localAuthorizationFields.has(field)],
      ),
    ),
  };
}

export function selfTest() {
  const now = new Date();
  const specification = syntheticSpecification();
  const specificationHash = sha256(JSON.stringify(specification));
  const baselineHash = "5".repeat(64);
  const authorization = syntheticAuthorization(
    specificationHash,
    baselineHash,
    now,
  );
  const authorizationHash = sha256(JSON.stringify(authorization));
  const cliVersion = config.cli_contract.required_version;
  const sourceHashes = {
    specification: specificationHash,
    authorization: authorizationHash,
    baseline: baselineHash,
  };
  const authorizationValidation = validateLocalMigrationAuthorization(
    authorization,
    specificationHash,
    baselineHash,
    now,
  );
  const manifest = buildAuthoringManifest(
    specification,
    authorization,
    sourceHashes,
    cliVersion,
  );
  const manifestValidation = validateAuthoringManifest(
    manifest,
    authorization,
    sourceHashes,
    cliVersion,
  );
  const authContext = (candidate) =>
    validateLocalMigrationAuthorization(
      candidate,
      specificationHash,
      baselineHash,
      now,
    ).accepted;
  const manifestContext = (candidate) =>
    validateAuthoringManifest(
      candidate,
      authorization,
      sourceHashes,
      cliVersion,
    ).accepted;
  const mutants = [
    () => authContext({ ...authorization, schema_version: "bad" }),
    () => authContext({ ...authorization, status: "approved_for_apply" }),
    () => authContext({ ...authorization, scope: "production" }),
    () => authContext({ ...authorization, one_shot: false }),
    () => authContext({ ...authorization, consumed: true }),
    () => authContext({ ...authorization, issued_at: "bad" }),
    () => authContext({ ...authorization, expires_at: authorization.issued_at }),
    () => authContext({ ...authorization, expires_at: new Date(now.getTime() + 31 * 60 * 1000).toISOString() }),
    () => authContext({ ...authorization, expires_at: new Date(now.getTime() - 1).toISOString() }),
    () => authContext({ ...authorization, reviewed_by: "" }),
    () => authContext({ ...authorization, change_ticket: "drop table" }),
    () => authContext({ ...authorization, specification_sha256: "0".repeat(64) }),
    () => authContext({ ...authorization, baseline_manifest_sha256: "0".repeat(64) }),
    () => authContext({ ...authorization, migration_name: "other" }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, local_sql_authoring: false } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, local_migration_generation: false } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, local_pgtap_authoring: false } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, local_test_execution: false } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, local_lint_execution: false } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, remote_read: true } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, linked_project: true } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, migration_apply: true } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, db_push: true } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, migration_repair: true } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, production: true } }),
    () => authContext({ ...authorization, authorizations: { ...authorization.authorizations, build: true } }),
    () => authContext({ ...authorization, sql: "alter table" }),
    () => manifestContext({ ...manifest, schema_version: "bad" }),
    () => manifestContext({ ...manifest, status: "applied" }),
    () => {
      const value = clone(manifest);
      value.source.specification_sha256 = "0".repeat(64);
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.cli.migration_new_tokens.push("--linked");
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.cli.test_db_tokens.pop();
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.cli.db_lint_tokens[3] = "--linked";
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.migration.existing_files_immutable = false;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.migration.new_files_expected = 3;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.migration.generated_by_this_evaluator = true;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.migration.applied = true;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.rollback.required = false;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.rollback.restore_point_required = false;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests.splice(0, 1);
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests.splice(4, 1);
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests.splice(8, 1);
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests = value.negative_tests.filter((test) => test !== "ownership_reassignment_denied");
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests = value.negative_tests.filter((test) => test !== "data_api_requires_explicit_grant_and_rls");
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests = value.negative_tests.filter((test) => test !== "view_respects_security_invoker");
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests = value.negative_tests.filter((test) => test !== "public_function_execute_denied");
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.negative_tests = value.negative_tests.filter((test) => test !== "service_role_secret_absent_from_client");
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.privacy.contains_credentials = true;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.privacy.contains_business_data = true;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.authorizations.remote_write = true;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.authorizations.migration_apply = true;
      return manifestContext(value);
    },
    () => {
      const value = clone(manifest);
      value.sql = "alter table";
      return manifestContext(value);
    },
  ];
  const rejected = mutants.filter((mutant) => mutant() === false).length;
  return {
    safe_baseline:
      authorizationValidation.accepted && manifestValidation.accepted
        ? "accepted"
        : "rejected",
    negative_tests: manifest.negative_tests.length,
    mutants_rejected: rejected,
    mutants_total: mutants.length,
    remote_command_executed: false,
    file_written: false,
    linked_project_accessed: false,
    migration_generated: false,
    migration_applied: false,
    production_touched: false,
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const payload = process.argv.includes("--self-test")
    ? selfTest()
    : assessLocalMigrationAuthoring();
  console.log(JSON.stringify(payload, null, 2));
  if (
    process.argv.includes("--self-test") &&
    (payload.safe_baseline !== "accepted" ||
      payload.mutants_rejected !== payload.mutants_total)
  ) {
    process.exit(1);
  }
}

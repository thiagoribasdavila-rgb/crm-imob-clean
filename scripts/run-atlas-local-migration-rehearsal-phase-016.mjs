import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const config = readJson(
  "config/atlas-10x-phase-016-local-migration-rehearsal.json",
);
const phase015Evidence = readJson(
  config.input_contract.phase_015_evidence_path,
);
const phase016Evidence = readJson(
  "artifacts/runtime/phase-016/local-migration-rehearsal-evidence.json",
);

function readArtifact(path) {
  if (!path || !existsSync(path)) {
    return {
      exists: false,
      parses: false,
      source: null,
      value: null,
    };
  }
  try {
    const source = readFileSync(path, "utf8");
    return {
      exists: true,
      parses: true,
      source,
      value: JSON.parse(source),
    };
  } catch {
    return {
      exists: true,
      parses: false,
      source: null,
      value: null,
    };
  }
}

function readTextArtifact(path) {
  if (!path || !existsSync(path)) {
    return { exists: false, source: null };
  }
  return { exists: true, source: readFileSync(path, "utf8") };
}

export function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isOpaqueIdentifier(value) {
  return (
    typeof value === "string" &&
    /^[A-Z0-9][A-Z0-9_-]{2,63}$/i.test(value) &&
    !value.includes("@") &&
    !/\s/.test(value)
  );
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return (
    leftSet.size === left.length &&
    right.every((item) => leftSet.has(item))
  );
}

function safeWorkspacePath(path, root, pattern) {
  if (typeof path !== "string" || !new RegExp(pattern).test(path)) {
    return false;
  }
  const workspace = resolve(process.cwd());
  const absolute = resolve(path);
  const absoluteRoot = resolve(root);
  return (
    absolute.startsWith(`${workspace}${sep}`) &&
    (absolute === absoluteRoot ||
      absolute.startsWith(`${absoluteRoot}${sep}`))
  );
}

function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ");
}

function hasBusinessDml(source) {
  const sql = stripSqlComments(source);
  return [
    /\binsert\s+into\b/i,
    /\bdelete\s+from\b/i,
    /\btruncate(?:\s+table)?\b/i,
    /\bcopy\s+[\w".]+\s+(?:from|to)\b/i,
    /\bupdate\s+(?:only\s+)?(?:[\w"]+\.)?[\w"]+\s+set\b/i,
  ].some((pattern) => pattern.test(sql));
}

function updatePoliciesAreComplete(source) {
  return stripSqlComments(source)
    .split(";")
    .filter(
      (statement) =>
        /\bcreate\s+policy\b/i.test(statement) &&
        /\bfor\s+update\b/i.test(statement),
    )
    .every(
      (statement) =>
        /\busing\s*\(/i.test(statement) &&
        /\bwith\s+check\s*\(/i.test(statement),
    );
}

export function validateMigrationSql(source) {
  const sql = stripSqlComments(source);
  const createsView =
    /\bcreate\s+(?:or\s+replace\s+)?view\b/i.test(sql);
  const usesSecurityDefiner = /\bsecurity\s+definer\b/i.test(sql);
  const gates = {
    source_is_nonempty:
      typeof source === "string" && source.trim().length >= 40,
    transaction_is_explicit:
      /^\s*(?:--[^\r\n]*[\r\n]\s*)*begin\s*;/i.test(source) &&
      /\bcommit\s*;\s*(?:--[^\r\n]*\s*)*$/i.test(source),
    lock_timeout_is_local:
      /\bset\s+local\s+lock_timeout\s*=/i.test(sql),
    statement_timeout_is_local:
      /\bset\s+local\s+statement_timeout\s*=/i.test(sql),
    business_dml_is_absent: !hasBusinessDml(source),
    auth_users_access_is_absent: !/\bauth\s*\.\s*users\b/i.test(sql),
    privileged_role_management_is_absent:
      !/\b(?:create|alter|drop)\s+role\b/i.test(sql) &&
      !/\bset\s+(?:local\s+)?role\b/i.test(sql) &&
      !/\bset\s+session\s+authorization\b/i.test(sql),
    destructive_database_operations_are_absent:
      !/\bdrop\s+(?:database|schema)\b/i.test(sql),
    network_or_dynamic_sql_is_absent:
      !/\b(?:dblink|postgres_fdw|http_request|net\.http|execute\s+format)\b/i.test(
        sql,
      ),
    broad_grants_are_absent:
      !/\bgrant\s+all\b/i.test(sql) &&
      !/\bgrant\s+execute\b[\s\S]*\bto\s+(?:public|anon|authenticated)\b/i.test(
        sql,
      ),
    deprecated_auth_role_is_absent: !/\bauth\s*\.\s*role\s*\(/i.test(sql),
    user_metadata_authorization_is_absent:
      !/\b(?:raw_)?user_meta_data\b/i.test(sql) &&
      !/\buser_metadata\b/i.test(sql),
    update_policies_are_complete: updatePoliciesAreComplete(source),
    views_are_security_invoker:
      !createsView || /\bsecurity_invoker\s*=\s*true\b/i.test(sql),
    security_definer_has_fixed_search_path:
      !usesSecurityDefiner ||
      /\bset\s+search_path\s*(?:=|to)\s*(?:''|"")/i.test(sql),
  };
  return {
    accepted: Object.values(gates).every(Boolean),
    gates,
  };
}

export function validateDynamicTestSql(source) {
  const sql = stripSqlComments(source);
  const gates = {
    source_is_nonempty:
      typeof source === "string" && source.trim().length >= 80,
    transaction_always_rolls_back:
      /^\s*(?:--[^\r\n]*[\r\n]\s*)*begin\s*;/i.test(source) &&
      /\brollback\s*;\s*(?:--[^\r\n]*\s*)*$/i.test(source) &&
      !/\bcommit\s*;/i.test(sql),
    pgtap_plan_is_present:
      /\bplan\s*\(/i.test(sql) && /\bfinish\s*\(/i.test(sql),
    postgres_17_is_asserted:
      /\bserver_version_num\b/i.test(sql) && /\b170000\b/.test(sql),
    anonymous_denial_is_covered:
      /\b(?:anonymous|anon)_denial\b/i.test(source),
    cross_tenant_denial_is_covered:
      /\bcross_tenant_denial\b/i.test(source),
    positive_path_is_covered: /\bpositive_path\b/i.test(source),
    fixture_is_declared_synthetic:
      /\bphase_016_synthetic_fixture\b/i.test(source),
    remote_tokens_are_absent:
      !/--linked|--db-url|https?:\/\/|postgres(?:ql)?:\/\//i.test(source),
    network_calls_are_absent:
      !/\b(?:dblink|postgres_fdw|http_request|net\.http)\b/i.test(sql),
  };
  return {
    accepted: Object.values(gates).every(Boolean),
    gates,
  };
}

function selectedBatch(manifest, sequence) {
  const matches = (manifest?.batches ?? []).filter(
    (batch) => batch.sequence === sequence,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function validatePermit(permit, context, now = new Date()) {
  const issuedAt = Date.parse(permit?.issued_at);
  const expiresAt = Date.parse(permit?.expires_at);
  const maximumWindow =
    config.permit_contract.maximum_validity_minutes * 60 * 1000;
  const batch = selectedBatch(context.manifest, permit?.batch_sequence);
  const gates = {
    permit_schema_version_matches:
      permit?.schema_version ===
      config.input_contract.required_permit_schema_version,
    permit_status_matches:
      permit?.status === config.input_contract.required_permit_status,
    permit_scope_is_local_only:
      permit?.scope === config.input_contract.required_scope,
    permit_is_one_shot:
      permit?.one_shot === true && permit?.consumed === false,
    permit_identity_is_opaque: isOpaqueIdentifier(permit?.approved_by),
    permit_change_ticket_is_present:
      isOpaqueIdentifier(permit?.change_ticket),
    permit_window_is_valid:
      isIsoTimestamp(permit?.issued_at) &&
      isIsoTimestamp(permit?.expires_at) &&
      expiresAt > issuedAt &&
      expiresAt - issuedAt <= maximumWindow &&
      now.getTime() >= issuedAt &&
      now.getTime() < expiresAt,
    permit_postgres_major_matches:
      permit?.postgres_major ===
      config.input_contract.expected_postgres_major,
    permit_cli_version_matches:
      permit?.supabase_cli_version ===
      config.input_contract.expected_cli_version,
    permit_manifest_hash_matches:
      isSha256(context.manifest_sha256) &&
      permit?.manifest_sha256 === context.manifest_sha256,
    permit_batch_matches_manifest:
      Number.isInteger(permit?.batch_sequence) && batch !== null,
    migration_path_is_safe: safeWorkspacePath(
      permit?.migration_path,
      config.artifact_contract.migration_root,
      config.artifact_contract.migration_path_pattern,
    ),
    migration_hash_matches:
      isSha256(context.migration_sha256) &&
      permit?.migration_sha256 === context.migration_sha256,
    dynamic_test_path_is_safe: safeWorkspacePath(
      permit?.dynamic_test_path,
      config.artifact_contract.dynamic_test_root,
      config.artifact_contract.dynamic_test_path_pattern,
    ),
    dynamic_test_hash_matches:
      isSha256(context.dynamic_test_sha256) &&
      permit?.dynamic_test_sha256 === context.dynamic_test_sha256,
    review_path_is_safe:
      permit?.review_path ===
        config.input_contract.phase_016_review_path &&
      safeWorkspacePath(
        permit?.review_path,
        config.artifact_contract.migration_review_root,
        "^artifacts/runtime/phase-016/manual/[a-z0-9_-]+\\.json$",
      ),
    review_hash_matches:
      isSha256(context.review_sha256) &&
      permit?.review_sha256 === context.review_sha256,
    target_fingerprint_is_bound:
      isSha256(permit?.target_fingerprint_sha256),
  };
  return {
    accepted: Object.values(gates).every(Boolean),
    gates,
    batch,
  };
}

export function validateReview(review, context) {
  const batch = context.batch;
  const allowlist = batch?.exact_object_allowlist ?? [];
  const findingIds = batch?.approved_finding_ids ?? [];
  const mapping = review?.finding_object_map;
  const mappedFindingIds =
    mapping && typeof mapping === "object" && !Array.isArray(mapping)
      ? Object.keys(mapping)
      : [];
  const flattenedObjects = mappedFindingIds.flatMap((id) =>
    Array.isArray(mapping[id]) ? mapping[id] : [],
  );
  const invariants = review?.security_invariants ?? {};
  const requiredInvariants = [
    "rls_and_grants_reviewed_separately",
    "update_policy_has_select_using_with_check",
    "views_are_security_invoker_or_unexposed",
    "security_definer_has_fixed_search_path",
    "security_definer_execute_is_minimal",
    "user_metadata_authorization_absent",
    "deprecated_auth_role_absent",
    "rollback_does_not_restore_unsafe_access",
  ];
  const gates = {
    review_schema_version_matches:
      review?.schema_version ===
      config.input_contract.required_review_schema_version,
    review_status_is_approved: review?.status === "approved_for_rehearsal",
    review_manifest_hash_matches:
      isSha256(context.manifest_sha256) &&
      review?.manifest_sha256 === context.manifest_sha256,
    review_migration_hash_matches:
      isSha256(context.migration_sha256) &&
      review?.migration_sha256 === context.migration_sha256,
    review_test_hash_matches:
      isSha256(context.dynamic_test_sha256) &&
      review?.dynamic_test_sha256 === context.dynamic_test_sha256,
    review_target_matches_permit:
      isSha256(context.target_fingerprint_sha256) &&
      review?.target_fingerprint_sha256 ===
        context.target_fingerprint_sha256,
    review_batch_matches:
      review?.batch_sequence === batch?.sequence,
    review_scaffold_is_attested:
      review?.scaffolded_with_supabase_cli === true,
    review_object_allowlist_matches:
      sameSet(review?.changed_objects, allowlist),
    review_finding_mapping_is_complete:
      sameSet(mappedFindingIds, findingIds) &&
      sameSet(flattenedObjects, allowlist),
    review_security_invariants_pass:
      requiredInvariants.every((name) => invariants[name] === true),
    review_preconditions_are_present:
      Array.isArray(review?.preconditions) &&
      review.preconditions.length > 0,
    review_postconditions_are_present:
      Array.isArray(review?.postconditions) &&
      review.postconditions.length > 0,
    review_idempotency_is_approved:
      review?.idempotency_reviewed === true,
  };
  return {
    accepted: Object.values(gates).every(Boolean),
    gates,
  };
}

function cliVersion() {
  const result = spawnSync(
    resolve(config.cli_contract.local_cli_path),
    ["--version"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: resolve(config.cli_contract.isolated_home_path),
      },
    },
  );
  return result.status === 0 ? result.stdout.trim() : null;
}

function cliPlanIsLocalOnly() {
  return config.cli_contract.commands.every(
    (command) =>
      command.includes("--local") &&
      !config.cli_contract.forbidden_tokens.some((token) =>
        command.includes(token),
      ),
  );
}

export function assessLocalMigrationRehearsal(now = new Date()) {
  const manifestArtifact = readArtifact(
    config.input_contract.phase_015_manifest_path,
  );
  const permitArtifact = readArtifact(
    config.input_contract.phase_016_permit_path,
  );
  const permit = permitArtifact.value;
  const migrationArtifact = readTextArtifact(permit?.migration_path);
  const testArtifact = readTextArtifact(permit?.dynamic_test_path);
  const reviewArtifact = readArtifact(
    permit?.review_path ?? config.input_contract.phase_016_review_path,
  );
  const context = {
    manifest: manifestArtifact.value,
    manifest_sha256: manifestArtifact.source
      ? sha256(manifestArtifact.source)
      : null,
    migration_sha256: migrationArtifact.source
      ? sha256(migrationArtifact.source)
      : null,
    dynamic_test_sha256: testArtifact.source
      ? sha256(testArtifact.source)
      : null,
    review_sha256: reviewArtifact.source
      ? sha256(reviewArtifact.source)
      : null,
  };
  const permitValidation =
    permit && manifestArtifact.value
      ? validatePermit(permit, context, now)
      : { accepted: false, gates: {}, batch: null };
  const reviewValidation =
    reviewArtifact.value && permitValidation.batch
      ? validateReview(reviewArtifact.value, {
          ...context,
          batch: permitValidation.batch,
          target_fingerprint_sha256:
            permit?.target_fingerprint_sha256,
        })
      : { accepted: false, gates: {} };
  const migrationValidation = migrationArtifact.source
    ? validateMigrationSql(migrationArtifact.source)
    : { accepted: false, gates: {} };
  const testValidation = testArtifact.source
    ? validateDynamicTestSql(testArtifact.source)
    : { accepted: false, gates: {} };
  const detectedCliVersion = cliVersion();

  const gates = {
    phase_015_manifest_exists: manifestArtifact.exists,
    phase_015_manifest_parses: manifestArtifact.parses,
    manifest_schema_version_matches:
      manifestArtifact.value?.schema_version ===
      config.input_contract.required_manifest_schema_version,
    phase_015_evidence_accepts_package:
      phase015Evidence.package?.generated === true &&
      phase015Evidence.package?.executable_sql_generated === false &&
      phase015Evidence.package?.migration_file_created === false,
    manifest_scope_is_local_pg17:
      manifestArtifact.value?.scope ===
      config.input_contract.required_scope,
    manifest_contains_exactly_one_selected_batch:
      permitValidation.batch !== null,
    permit_exists: permitArtifact.exists,
    permit_parses: permitArtifact.parses,
    ...permitValidation.gates,
    migration_exists: migrationArtifact.exists,
    dynamic_test_exists: testArtifact.exists,
    review_exists: reviewArtifact.exists,
    review_parses: reviewArtifact.parses,
    ...reviewValidation.gates,
    migration_static_safety_passes: migrationValidation.accepted,
    dynamic_test_static_safety_passes: testValidation.accepted,
    supabase_config_exists: existsSync(
      config.input_contract.supabase_config_path,
    ),
    local_cli_version_matches:
      detectedCliVersion === config.input_contract.expected_cli_version,
    cli_plan_is_local_only: cliPlanIsLocalOnly(),
    remote_or_linked_command_not_used:
      phase016Evidence.cli?.linked_command_used === false &&
      phase016Evidence.cli?.db_url_used === false &&
      phase016Evidence.cli?.db_push_used === false &&
      phase016Evidence.cli?.db_pull_used === false &&
      phase016Evidence.cli?.migration_repair_used === false,
    local_database_not_started:
      phase016Evidence.rehearsal?.local_stack_started === false &&
      phase016Evidence.rehearsal?.first_reset_executed === false,
    migration_not_applied:
      phase016Evidence.rehearsal?.migration_applied === false,
    business_or_auth_data_not_read:
      phase016Evidence.safety?.business_data_read === false &&
      phase016Evidence.safety?.auth_user_data_read === false,
    live_homologation_not_touched:
      phase016Evidence.safety?.live_homologation_touched === false,
    build_not_executed:
      phase016Evidence.safety?.build_executed === false,
    package_not_created:
      phase016Evidence.safety?.release_package_created === false,
  };
  const orderedGates = Object.fromEntries(
    config.required_preflight_gates.map((name) => [
      name,
      gates[name] === true,
    ]),
  );
  const blockers = Object.entries(orderedGates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const passed = config.required_preflight_gates.length - blockers.length;
  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      blockers.length === 0
        ? "local_migration_rehearsal_ready_for_single_execution"
        : "local_rehearsal_contract_ready_inputs_blocked",
    specification: {
      passed,
      total: config.required_preflight_gates.length,
      percentage: Math.round(
        (passed / config.required_preflight_gates.length) * 100,
      ),
      blockers,
    },
    selected_batch: permitValidation.batch?.sequence ?? null,
    artifacts: {
      manifest: manifestArtifact.exists,
      permit: permitArtifact.exists,
      migration: migrationArtifact.exists,
      dynamic_test: testArtifact.exists,
      review: reviewArtifact.exists,
      supabase_config: existsSync(
        config.input_contract.supabase_config_path,
      ),
    },
    cli: {
      version: detectedCliVersion,
      expected: config.input_contract.expected_cli_version,
      plan_is_local_only: cliPlanIsLocalOnly(),
      advisors_supported:
        phase016Evidence.cli?.db_advisors_help_inspected === true,
    },
    safety: {
      preflight_only: true,
      local_database_started: false,
      migration_applied: false,
      remote_read_executed: false,
      remote_write_executed: false,
      live_homologation_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    gates: orderedGates,
    conclusion: {
      ready_for_single_local_rehearsal: blockers.length === 0,
      rehearsal_executed: false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticFixture(now = new Date()) {
  const manifest = {
    schema_version: "atlas.isolated_migration_package.v1",
    scope: "isolated_loopback_pg17_only",
    batches: [
      {
        sequence: 1,
        approved_finding_ids: ["SEC-P0-ONE"],
        exact_object_allowlist: ["table:public:leads"],
      },
    ],
  };
  const manifestSource = `${JSON.stringify(manifest, null, 2)}\n`;
  const migration = [
    "begin;",
    "set local lock_timeout = '3s';",
    "set local statement_timeout = '20s';",
    "revoke all on table public.leads from anon;",
    "alter table public.leads enable row level security;",
    "commit;",
  ].join("\n");
  const dynamicTest = [
    "begin;",
    "-- phase_016_synthetic_fixture",
    "-- anonymous_denial",
    "-- cross_tenant_denial",
    "-- positive_path",
    "select plan(2);",
    "select ok(current_setting('server_version_num')::int >= 170000, 'PostgreSQL 17');",
    "select ok(true, 'synthetic coverage');",
    "select * from finish();",
    "rollback;",
  ].join("\n");
  const migrationHash = sha256(migration);
  const testHash = sha256(dynamicTest);
  const targetHash = sha256("isolated-loopback-pg17");
  const review = {
    schema_version: "atlas.local_migration_review.v1",
    status: "approved_for_rehearsal",
    manifest_sha256: sha256(manifestSource),
    migration_sha256: migrationHash,
    dynamic_test_sha256: testHash,
    target_fingerprint_sha256: targetHash,
    batch_sequence: 1,
    scaffolded_with_supabase_cli: true,
    changed_objects: ["table:public:leads"],
    finding_object_map: {
      "SEC-P0-ONE": ["table:public:leads"],
    },
    preconditions: ["public.leads exists"],
    postconditions: ["anon has no grants"],
    idempotency_reviewed: true,
    security_invariants: {
      rls_and_grants_reviewed_separately: true,
      update_policy_has_select_using_with_check: true,
      views_are_security_invoker_or_unexposed: true,
      security_definer_has_fixed_search_path: true,
      security_definer_execute_is_minimal: true,
      user_metadata_authorization_absent: true,
      deprecated_auth_role_absent: true,
      rollback_does_not_restore_unsafe_access: true,
    },
  };
  const reviewSource = `${JSON.stringify(review, null, 2)}\n`;
  const issuedAt = new Date(now.getTime() - 5 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const permit = {
    schema_version: "atlas.local_migration_rehearsal_permit.v1",
    status: "approved_for_single_local_rehearsal",
    scope: "isolated_loopback_pg17_only",
    one_shot: true,
    consumed: false,
    approved_by: "SECURITY_REVIEWER_01",
    change_ticket: "ATLAS_SEC_016",
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    postgres_major: 17,
    supabase_cli_version: "2.109.1",
    manifest_sha256: sha256(manifestSource),
    batch_sequence: 1,
    migration_path:
      "supabase/migrations/20260723090000_atlas_security_batch.sql",
    migration_sha256: migrationHash,
    dynamic_test_path:
      "supabase/tests/database/phase_016_security_batch.test.sql",
    dynamic_test_sha256: testHash,
    review_path:
      "artifacts/runtime/phase-016/manual/local-migration-review.json",
    review_sha256: sha256(reviewSource),
    target_fingerprint_sha256: targetHash,
  };
  const context = {
    manifest,
    manifest_sha256: sha256(manifestSource),
    migration_sha256: migrationHash,
    dynamic_test_sha256: testHash,
    review_sha256: sha256(reviewSource),
  };
  return {
    manifest,
    migration,
    dynamicTest,
    review,
    permit,
    context,
  };
}

function selfTest() {
  const now = new Date();
  const fixture = syntheticFixture(now);
  const permit = validatePermit(fixture.permit, fixture.context, now);
  const review = validateReview(fixture.review, {
    ...fixture.context,
    batch: permit.batch,
    target_fingerprint_sha256:
      fixture.permit.target_fingerprint_sha256,
  });
  const migration = validateMigrationSql(fixture.migration);
  const dynamicTest = validateDynamicTestSql(fixture.dynamicTest);
  const mutants = [
    () => validatePermit({ ...fixture.permit, scope: "remote" }, fixture.context, now).accepted,
    () => validatePermit({ ...fixture.permit, one_shot: false }, fixture.context, now).accepted,
    () => validatePermit({ ...fixture.permit, consumed: true }, fixture.context, now).accepted,
    () => validatePermit({ ...fixture.permit, expires_at: new Date(now.getTime() + 120 * 60 * 1000).toISOString() }, fixture.context, now).accepted,
    () => validatePermit({ ...fixture.permit, manifest_sha256: "0".repeat(64) }, fixture.context, now).accepted,
    () => validatePermit({ ...fixture.permit, migration_path: "../outside.sql" }, fixture.context, now).accepted,
    () => validatePermit({ ...fixture.permit, dynamic_test_path: "supabase/tests/database/not_phase16.sql" }, fixture.context, now).accepted,
    () => validateReview({ ...fixture.review, scaffolded_with_supabase_cli: false }, { ...fixture.context, batch: permit.batch, target_fingerprint_sha256: fixture.permit.target_fingerprint_sha256 }).accepted,
    () => validateReview({ ...fixture.review, changed_objects: ["table:public:leads", "table:public:profiles"] }, { ...fixture.context, batch: permit.batch, target_fingerprint_sha256: fixture.permit.target_fingerprint_sha256 }).accepted,
    () => validateReview({ ...fixture.review, finding_object_map: {} }, { ...fixture.context, batch: permit.batch, target_fingerprint_sha256: fixture.permit.target_fingerprint_sha256 }).accepted,
    () => validateReview({ ...fixture.review, security_invariants: { ...fixture.review.security_invariants, rollback_does_not_restore_unsafe_access: false } }, { ...fixture.context, batch: permit.batch, target_fingerprint_sha256: fixture.permit.target_fingerprint_sha256 }).accepted,
    () => validateMigrationSql(fixture.migration.replace("revoke all", "insert into public.leads values (1); revoke all")).accepted,
    () => validateMigrationSql(fixture.migration.replace("begin;", "")).accepted,
    () => validateMigrationSql(fixture.migration.replace("set local lock_timeout = '3s';", "")).accepted,
    () => validateMigrationSql(fixture.migration.replace("revoke all", "select * from auth.users; revoke all")).accepted,
    () => validateMigrationSql(fixture.migration.replace("revoke all", "select auth.role(); revoke all")).accepted,
    () => validateMigrationSql(fixture.migration.replace("revoke all", "select raw_user_meta_data; revoke all")).accepted,
    () => validateMigrationSql(fixture.migration.replace("revoke all on table public.leads from anon;", "grant execute on function private.fn() to public;")).accepted,
    () => validateDynamicTestSql(fixture.dynamicTest.replace("rollback;", "commit;")).accepted,
    () => validateDynamicTestSql(fixture.dynamicTest.replace("170000", "150000")).accepted,
  ];
  const rejected = mutants.filter((mutant) => mutant() === false).length;
  return {
    safe_baseline:
      permit.accepted &&
      review.accepted &&
      migration.accepted &&
      dynamicTest.accepted
        ? "accepted"
        : "rejected",
    mutants_rejected: rejected,
    mutants_total: mutants.length,
    local_database_started: false,
    migration_applied: false,
    remote_write_executed: false,
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const payload = process.argv.includes("--self-test")
    ? selfTest()
    : assessLocalMigrationRehearsal();
  console.log(JSON.stringify(payload, null, 2));
  if (
    process.argv.includes("--self-test") &&
    (payload.safe_baseline !== "accepted" ||
      payload.mutants_rejected !== payload.mutants_total)
  ) {
    process.exit(1);
  }
}

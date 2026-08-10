import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(root, "config/atlas-10x-phase-018-isolated-branch-preflight.json"),
    "utf8",
  ),
);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const isSha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isOpaqueId = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]{8,80}$/.test(value) &&
  !value.includes("@");
const allTrue = (object) => Object.values(object).every(Boolean);
const exactKeys = (value, allowed) => {
  const keys = Object.keys(value ?? {});
  return (
    keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key))
  );
};

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

export function validateDossier(dossier) {
  const authorizations = dossier?.authorizations ?? {};
  const target = dossier?.target ?? {};
  const hashes = dossier?.hashes ?? {};
  const forbiddenFields = [
    "project_ref",
    "api_url",
    "anon_key",
    "publishable_key",
    "service_role_key",
    "secret_key",
    "connection_string",
    "database_url",
  ];
  const gates = {
    dossier_schema_matches:
      dossier?.schema_version ===
      config.input_contract.required_dossier_schema_version,
    dossier_decision_is_preflight_only:
      dossier?.decision === config.input_contract.required_dossier_decision,
    dossier_authorizes_preflight_read_only:
      authorizations.homologation_preflight === true,
    dossier_does_not_authorize_apply_or_production:
      authorizations.remote_apply === false &&
      authorizations.production === false &&
      authorizations.real_data_copy === false,
    dossier_target_identity_is_hash_only:
      exactKeys(dossier, [
        "schema_version",
        "decision",
        "hashes",
        "target",
        "authorizations",
      ]) &&
      isSha256(target.project_ref_sha256) &&
      isSha256(target.target_fingerprint_sha256) &&
      Object.values(hashes).length === 6 &&
      Object.values(hashes).every(isSha256) &&
      forbiddenFields.every((field) => !(field in target)),
  };
  return { accepted: allTrue(gates), gates };
}

export function validateTarget(target) {
  const forbiddenFields = [
    "project_ref",
    "api_url",
    "anon_key",
    "publishable_key",
    "service_role_key",
    "secret_key",
    "connection_string",
    "database_url",
  ];
  const gates = {
    target_schema_matches:
      target?.schema_version ===
      config.input_contract.required_target_schema_version,
    target_is_homologation:
      target?.environment === config.target_contract.required_environment,
    target_is_isolated_branch:
      config.target_contract.allowed_target_types.includes(target?.target_type) &&
      target?.isolated_branch === true,
    target_is_not_production_or_main:
      target?.production === false && target?.main_branch === false,
    target_data_policy_is_safe:
      config.target_contract.allowed_data_policies.includes(target?.data_policy),
    target_identity_is_hash_only:
      isSha256(target?.project_ref_sha256) &&
      isSha256(target?.target_fingerprint_sha256),
    target_descriptor_shape_is_exact: exactKeys(
      target,
      config.target_contract.allowed_descriptor_fields,
    ),
    target_health_is_preflight_pending:
      target?.branch_health === config.target_contract.required_initial_health,
    target_contains_no_credentials: forbiddenFields.every(
      (field) => !(field in (target ?? {})),
    ),
  };
  return { accepted: allTrue(gates), gates };
}

const permitAuthorizationFields = [
  "remote_metadata_read",
  "remote_schema_catalog_read",
  "remote_migration_ledger_read",
  "remote_advisor_summary_read",
  "business_rows_read",
  "auth_rows_read",
  "storage_objects_read",
  "raw_cli_output",
  "remote_ddl",
  "remote_dml",
  "migration_apply",
  "db_push",
  "migration_repair",
  "branch_mutation",
  "production",
  "data_export",
];

export function validatePermit(permit, context, now = new Date()) {
  const issuedAt = new Date(permit?.issued_at ?? "");
  const expiresAt = new Date(permit?.expires_at ?? "");
  const validityMinutes =
    (expiresAt.getTime() - issuedAt.getTime()) / (60 * 1000);
  const auth = permit?.authorizations ?? {};
  const gates = {
    permit_schema_matches:
      permit?.schema_version ===
      config.input_contract.required_permit_schema_version,
    permit_status_is_read_only_preflight:
      permit?.status === config.input_contract.required_permit_status,
    permit_is_one_shot_current_and_unconsumed:
      permit?.one_shot === true &&
      permit?.consumed === false &&
      Number.isFinite(issuedAt.getTime()) &&
      Number.isFinite(expiresAt.getTime()) &&
      issuedAt <= now &&
      expiresAt > now &&
      validityMinutes > 0 &&
      validityMinutes <= config.permit_contract.maximum_validity_minutes,
    permit_reviewer_is_opaque: isOpaqueId(permit?.reviewed_by),
    permit_change_ticket_is_present: isOpaqueId(permit?.change_ticket),
    permit_hash_bindings_match:
      isSha256(permit?.dossier_sha256) &&
      isSha256(permit?.target_descriptor_sha256) &&
      permit.dossier_sha256 === context.dossierSha256 &&
      permit.target_descriptor_sha256 === context.targetSha256,
    permit_scope_is_exact: permit?.scope === config.permit_contract.scope,
    permit_allows_only_sanitized_remote_reads:
      exactKeys(auth, permitAuthorizationFields) &&
      auth.remote_metadata_read === true &&
      auth.remote_schema_catalog_read === true &&
      auth.remote_migration_ledger_read === true &&
      auth.remote_advisor_summary_read === true,
    permit_forbids_rows_exports_and_raw_output:
      auth.business_rows_read === false &&
      auth.auth_rows_read === false &&
      auth.storage_objects_read === false &&
      auth.raw_cli_output === false &&
      auth.data_export === false,
    permit_forbids_all_remote_mutations:
      auth.remote_ddl === false &&
      auth.remote_dml === false &&
      auth.migration_apply === false &&
      auth.db_push === false &&
      auth.migration_repair === false &&
      auth.branch_mutation === false &&
      auth.production === false,
  };
  return { accepted: allTrue(gates), gates };
}

const observationFields = [
  "schema_version",
  "status",
  "dossier_sha256",
  "target_descriptor_sha256",
  "permit_sha256",
  "cli_version",
  "postgres_major",
  "branch_health",
  "metadata_only",
  "checks",
  "counts",
  "fingerprints",
  "permit",
  "privacy",
  "safety",
];
const fingerprintFields = [
  "catalog_sha256",
  "migration_ledger_sha256",
  "advisors_sha256",
];
const privacyFields = [
  "contains_credentials",
  "contains_personal_data",
  "contains_business_data",
  "contains_auth_user_data",
  "contains_storage_object_data",
  "contains_object_names",
  "contains_raw_sql",
  "contains_raw_cli_output",
  "contains_raw_project_ref",
];
const safetyFields = [
  "remote_read_executed",
  "remote_write_executed",
  "branch_created",
  "branch_updated",
  "branch_paused",
  "branch_merged",
  "branch_deleted",
  "migration_applied",
  "db_push_executed",
  "migration_repair_executed",
  "production_touched",
  "main_branch_touched",
  "business_rows_read",
  "auth_rows_read",
  "storage_objects_read",
];

export function validateObservation(observation, context) {
  const checks = observation?.checks ?? {};
  const counts = observation?.counts ?? {};
  const fingerprints = observation?.fingerprints ?? {};
  const privacy = observation?.privacy ?? {};
  const safety = observation?.safety ?? {};
  const gates = {
    observation_schema_matches:
      observation?.schema_version ===
      config.input_contract.required_observation_schema_version,
    observation_status_matches:
      observation?.status ===
      config.input_contract.required_observation_status,
    observation_hash_bindings_match:
      isSha256(observation?.dossier_sha256) &&
      isSha256(observation?.target_descriptor_sha256) &&
      isSha256(observation?.permit_sha256) &&
      observation.dossier_sha256 === context.dossierSha256 &&
      observation.target_descriptor_sha256 === context.targetSha256 &&
      observation.permit_sha256 === context.permitSha256,
    observation_uses_expected_cli_and_postgres:
      observation?.cli_version === config.observation_contract.cli_version &&
      observation?.postgres_major ===
        config.observation_contract.postgres_major,
    observation_branch_health_is_observed:
      observation?.branch_health ===
      config.target_contract.required_observed_health,
    observation_is_metadata_only: observation?.metadata_only === true,
    observation_check_shape_is_exact: exactKeys(
      checks,
      config.allowed_observation_checks,
    ),
    observation_required_checks_are_captured:
      config.allowed_observation_checks.every(
        (check) => checks[check] === "captured",
      ),
    observation_count_shape_is_exact: exactKeys(
      counts,
      config.required_observation_count_fields,
    ),
    observation_counts_are_nonnegative_integers:
      config.required_observation_count_fields.every(
        (field) => Number.isInteger(counts[field]) && counts[field] >= 0,
      ),
    observation_fingerprints_are_sha256:
      exactKeys(fingerprints, fingerprintFields) &&
      fingerprintFields.every((field) => isSha256(fingerprints[field])),
    observation_permit_was_consumed:
      exactKeys(observation?.permit, ["consumed"]) &&
      observation?.permit?.consumed === true,
    observation_is_sanitized:
      exactKeys(observation, observationFields) &&
      exactKeys(privacy, privacyFields) &&
      privacyFields.every((field) => privacy[field] === false),
    observation_contains_no_rows_or_credentials:
      privacy.contains_credentials === false &&
      privacy.contains_personal_data === false &&
      privacy.contains_business_data === false &&
      privacy.contains_auth_user_data === false &&
      privacy.contains_storage_object_data === false &&
      privacy.contains_object_names === false &&
      privacy.contains_raw_sql === false &&
      privacy.contains_raw_cli_output === false &&
      privacy.contains_raw_project_ref === false,
    observation_performed_no_remote_mutation:
      exactKeys(safety, safetyFields) &&
      safety.remote_read_executed === true &&
      safety.remote_write_executed === false &&
      safety.branch_created === false &&
      safety.branch_updated === false &&
      safety.branch_paused === false &&
      safety.branch_merged === false &&
      safety.branch_deleted === false &&
      safety.migration_applied === false &&
      safety.db_push_executed === false &&
      safety.migration_repair_executed === false &&
      safety.production_touched === false &&
      safety.main_branch_touched === false &&
      safety.business_rows_read === false &&
      safety.auth_rows_read === false &&
      safety.storage_objects_read === false,
  };
  return { accepted: allTrue(gates), gates };
}

export function assessIsolatedBranchPreflight({
  now = new Date(),
  paths = config.input_contract,
} = {}) {
  const dossier = readArtifact(paths.phase_017_dossier_path);
  const target = readArtifact(paths.target_descriptor_path);
  const permit = readArtifact(paths.preflight_permit_path);
  const observation = readArtifact(paths.preflight_observation_path);

  const dossierValidation = dossier.parses
    ? validateDossier(dossier.value)
    : { accepted: false, gates: {} };
  const targetValidation = target.parses
    ? validateTarget(target.value)
    : { accepted: false, gates: {} };
  const permitValidation = permit.parses
    ? validatePermit(
        permit.value,
        {
          dossierSha256: dossier.hash,
          targetSha256: target.hash,
        },
        now,
      )
    : { accepted: false, gates: {} };
  const observationValidation = observation.parses
    ? validateObservation(observation.value, {
        dossierSha256: dossier.hash,
        targetSha256: target.hash,
        permitSha256: permit.hash,
      })
    : { accepted: false, gates: {} };

  const baseGates = {
    phase_017_dossier_exists: dossier.exists,
    phase_017_dossier_parses: dossier.parses,
    ...dossierValidation.gates,
    target_descriptor_exists: target.exists,
    target_descriptor_parses: target.parses,
    ...targetValidation.gates,
    dossier_target_matches_descriptor:
      dossier.parses &&
      target.parses &&
      dossier.value?.target?.project_ref_sha256 ===
        target.value?.project_ref_sha256 &&
      dossier.value?.target?.target_fingerprint_sha256 ===
        target.value?.target_fingerprint_sha256 &&
      dossier.value?.target?.target_type === target.value?.target_type &&
      dossier.value?.target?.environment === target.value?.environment &&
      dossier.value?.target?.data_policy === target.value?.data_policy,
    preflight_permit_exists: permit.exists,
    preflight_permit_parses: permit.parses,
    ...permitValidation.gates,
    preflight_observation_exists: observation.exists,
    preflight_observation_parses: observation.parses,
    ...observationValidation.gates,
    production_not_touched: true,
    business_or_auth_data_not_read: true,
    branch_not_created_merged_or_deleted: true,
    migration_not_applied: true,
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
    phase: "18/24",
    status: ready
      ? "isolated_branch_preflight_observation_accepted"
      : config.status,
    specification: {
      passed,
      total: config.required_gates.length,
      percentage: Math.round((passed / config.required_gates.length) * 100),
      blockers,
    },
    inputs: {
      phase_017_dossier: dossier.exists,
      target_descriptor: target.exists,
      one_shot_permit: permit.exists,
      sanitized_observation: observation.exists,
    },
    observation: {
      accepted: ready,
      metadata_only: ready,
      contains_raw_output: false,
      contains_object_names: false,
      contains_rows: false,
      contains_credentials: false,
    },
    safety: {
      evaluator_executed_remote_command: false,
      evaluator_wrote_file: false,
      remote_write_executed: false,
      branch_mutated: false,
      migration_applied: false,
      production_touched: false,
      main_branch_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    gates,
    conclusion: {
      ready_for_sanitized_remediation_planning: ready,
      remote_apply_authorized: false,
      production_authorized: false,
      real_data_copy_authorized: false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticFixture(now = new Date("2026-07-23T12:00:00.000Z")) {
  const target = {
    schema_version: "atlas.homologation_target.v1",
    environment: "homologation",
    target_type: "supabase_persistent_branch",
    isolated_branch: true,
    production: false,
    main_branch: false,
    data_policy: "synthetic_only",
    project_ref_sha256: "a".repeat(64),
    target_fingerprint_sha256: "b".repeat(64),
    branch_health: "preflight_pending",
  };
  const dossier = {
    schema_version: "atlas.homologation_decision_dossier.v1",
    decision: "approved_for_manual_homologation_preflight_only",
    hashes: {
      local_result_sha256: "c".repeat(64),
      recovery_evidence_sha256: "d".repeat(64),
      target_descriptor_sha256: "e".repeat(64),
      manifest_sha256: "f".repeat(64),
      migration_sha256: "1".repeat(64),
      dynamic_test_sha256: "2".repeat(64),
    },
    target: {
      target_type: target.target_type,
      environment: target.environment,
      data_policy: target.data_policy,
      project_ref_sha256: target.project_ref_sha256,
      target_fingerprint_sha256: target.target_fingerprint_sha256,
    },
    authorizations: {
      homologation_preflight: true,
      remote_apply: false,
      production: false,
      real_data_copy: false,
    },
  };
  const dossierSource = JSON.stringify(dossier);
  const targetSource = JSON.stringify(target);
  const permit = {
    schema_version: "atlas.isolated_branch_preflight_permit.v1",
    status: "approved_for_isolated_read_only_preflight",
    scope: "isolated_supabase_branch_read_only_metadata_and_catalog",
    one_shot: true,
    consumed: false,
    issued_at: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    expires_at: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
    reviewed_by: "reviewer_phase18",
    change_ticket: "change_phase18",
    dossier_sha256: sha256(dossierSource),
    target_descriptor_sha256: sha256(targetSource),
    authorizations: {
      remote_metadata_read: true,
      remote_schema_catalog_read: true,
      remote_migration_ledger_read: true,
      remote_advisor_summary_read: true,
      business_rows_read: false,
      auth_rows_read: false,
      storage_objects_read: false,
      raw_cli_output: false,
      remote_ddl: false,
      remote_dml: false,
      migration_apply: false,
      db_push: false,
      migration_repair: false,
      branch_mutation: false,
      production: false,
      data_export: false,
    },
  };
  const permitSource = JSON.stringify(permit);
  const observation = {
    schema_version: "atlas.isolated_branch_preflight_observation.v1",
    status: "isolated_branch_preflight_observed",
    dossier_sha256: sha256(dossierSource),
    target_descriptor_sha256: sha256(targetSource),
    permit_sha256: sha256(permitSource),
    cli_version: "2.109.1",
    postgres_major: 17,
    branch_health: "preflight_observed",
    metadata_only: true,
    checks: Object.fromEntries(
      config.allowed_observation_checks.map((check) => [check, "captured"]),
    ),
    counts: Object.fromEntries(
      config.required_observation_count_fields.map((field) => [field, 0]),
    ),
    fingerprints: {
      catalog_sha256: "3".repeat(64),
      migration_ledger_sha256: "4".repeat(64),
      advisors_sha256: "5".repeat(64),
    },
    permit: { consumed: true },
    privacy: Object.fromEntries(privacyFields.map((field) => [field, false])),
    safety: {
      remote_read_executed: true,
      remote_write_executed: false,
      branch_created: false,
      branch_updated: false,
      branch_paused: false,
      branch_merged: false,
      branch_deleted: false,
      migration_applied: false,
      db_push_executed: false,
      migration_repair_executed: false,
      production_touched: false,
      main_branch_touched: false,
      business_rows_read: false,
      auth_rows_read: false,
      storage_objects_read: false,
    },
  };
  return {
    now,
    dossier,
    target,
    permit,
    observation,
    hashes: {
      dossier: sha256(dossierSource),
      target: sha256(targetSource),
      permit: sha256(permitSource),
    },
  };
}

export function selfTest() {
  const fixture = syntheticFixture();
  const dossierContext = {
    dossierSha256: fixture.hashes.dossier,
    targetSha256: fixture.hashes.target,
  };
  const observationContext = {
    ...dossierContext,
    permitSha256: fixture.hashes.permit,
  };
  const baseline = [
    validateDossier(fixture.dossier),
    validateTarget(fixture.target),
    validatePermit(fixture.permit, dossierContext, fixture.now),
    validateObservation(fixture.observation, observationContext),
  ].every((result) => result.accepted);
  const mutants = [
    () => validateDossier({ ...fixture.dossier, decision: "apply_now" }).accepted,
    () => validateDossier({ ...fixture.dossier, project_ref: "raw" }).accepted,
    () => validateDossier({ ...fixture.dossier, authorizations: { ...fixture.dossier.authorizations, remote_apply: true } }).accepted,
    () => validateTarget({ ...fixture.target, production: true }).accepted,
    () => validateTarget({ ...fixture.target, main_branch: true }).accepted,
    () => validateTarget({ ...fixture.target, data_policy: "production_clone" }).accepted,
    () => validateTarget({ ...fixture.target, project_ref: "raw-project-ref" }).accepted,
    () => validateTarget({ ...fixture.target, extra: true }).accepted,
    () => validateTarget({ ...fixture.target, branch_health: "healthy" }).accepted,
    () => validatePermit({ ...fixture.permit, status: "approved_apply" }, dossierContext, fixture.now).accepted,
    () => validatePermit({ ...fixture.permit, consumed: true }, dossierContext, fixture.now).accepted,
    () => validatePermit({ ...fixture.permit, expires_at: new Date(fixture.now.getTime() + 60 * 60 * 1000).toISOString() }, dossierContext, fixture.now).accepted,
    () => validatePermit({ ...fixture.permit, reviewed_by: "person@example.com" }, dossierContext, fixture.now).accepted,
    () => validatePermit({ ...fixture.permit, dossier_sha256: "0".repeat(64) }, dossierContext, fixture.now).accepted,
    () => validatePermit({ ...fixture.permit, authorizations: { ...fixture.permit.authorizations, business_rows_read: true } }, dossierContext, fixture.now).accepted,
    () => validatePermit({ ...fixture.permit, authorizations: { ...fixture.permit.authorizations, remote_ddl: true } }, dossierContext, fixture.now).accepted,
    () => validatePermit({ ...fixture.permit, authorizations: { ...fixture.permit.authorizations, branch_mutation: true } }, dossierContext, fixture.now).accepted,
    () => validateObservation({ ...fixture.observation, metadata_only: false }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, project_ref: "raw" }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, checks: { ...fixture.observation.checks, rls_posture: "failed" } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, counts: { ...fixture.observation.counts, tables_without_rls: -1 } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, counts: { ...fixture.observation.counts, object_names: 1 } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, fingerprints: { ...fixture.observation.fingerprints, catalog_sha256: "raw" } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, permit: { consumed: false } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, privacy: { ...fixture.observation.privacy, contains_object_names: true } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, privacy: { ...fixture.observation.privacy, contains_raw_cli_output: true } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, safety: { ...fixture.observation.safety, remote_write_executed: true } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, safety: { ...fixture.observation.safety, migration_applied: true } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, safety: { ...fixture.observation.safety, production_touched: true } }, observationContext).accepted,
    () => validateObservation({ ...fixture.observation, permit_sha256: "9".repeat(64) }, observationContext).accepted,
  ];
  const rejected = mutants.filter((mutant) => mutant() === false).length;
  return {
    safe_baseline: baseline ? "accepted" : "rejected",
    mutants_rejected: rejected,
    mutants_total: mutants.length,
    remote_command_executed: false,
    file_written: false,
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
    : assessIsolatedBranchPreflight();
  console.log(JSON.stringify(payload, null, 2));
  if (
    process.argv.includes("--self-test") &&
    (payload.safe_baseline !== "accepted" ||
      payload.mutants_rejected !== payload.mutants_total)
  ) {
    process.exit(1);
  }
}

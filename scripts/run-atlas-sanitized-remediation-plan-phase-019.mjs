import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateDossier,
  validateObservation,
  validateTarget,
} from "./run-atlas-isolated-branch-preflight-phase-018.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(root, "config/atlas-10x-phase-019-sanitized-remediation-plan.json"),
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

const historicalPermitFields = [
  "schema_version",
  "status",
  "scope",
  "one_shot",
  "consumed",
  "issued_at",
  "expires_at",
  "reviewed_by",
  "change_ticket",
  "dossier_sha256",
  "target_descriptor_sha256",
  "authorizations",
];
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
const planFields = [
  "schema_version",
  "status",
  "source",
  "summary",
  "items",
  "privacy",
  "authorizations",
];
const planPrivacyFields = [
  "contains_credentials",
  "contains_personal_data",
  "contains_business_data",
  "contains_auth_user_data",
  "contains_object_names",
  "contains_raw_sql",
  "contains_raw_cli_output",
];
const authorizationFields = [
  "remote_read",
  "remote_write",
  "migration_generation",
  "migration_apply",
  "db_push",
  "migration_repair",
  "branch_mutation",
  "production",
  "real_data_copy",
];
const controlledPriorities = ["P0", "P2"];
const controlledOwners = [
  "database_security",
  "authorization",
  "platform_security",
  "database_performance",
];

export function validateHistoricalPermit(permit, context) {
  const auth = permit?.authorizations ?? {};
  const gates = {
    permit_schema_matches:
      permit?.schema_version ===
        config.input_contract.required_permit_schema_version &&
      exactKeys(permit, historicalPermitFields),
    permit_is_historical_read_only:
      permit?.status === "approved_for_isolated_read_only_preflight" &&
      permit?.scope ===
        "isolated_supabase_branch_read_only_metadata_and_catalog" &&
      permit?.one_shot === true &&
      permit?.consumed === false,
    permit_hash_bindings_match:
      isSha256(permit?.dossier_sha256) &&
      isSha256(permit?.target_descriptor_sha256) &&
      permit.dossier_sha256 === context.dossierSha256 &&
      permit.target_descriptor_sha256 === context.targetSha256,
    permit_contains_no_mutation_authority:
      exactKeys(auth, permitAuthorizationFields) &&
      auth.remote_metadata_read === true &&
      auth.remote_schema_catalog_read === true &&
      auth.remote_migration_ledger_read === true &&
      auth.remote_advisor_summary_read === true &&
      permitAuthorizationFields
        .filter((field) => !field.startsWith("remote_") || field === "remote_ddl" || field === "remote_dml")
        .filter(
          (field) =>
            ![
              "remote_metadata_read",
              "remote_schema_catalog_read",
              "remote_migration_ledger_read",
              "remote_advisor_summary_read",
            ].includes(field),
        )
        .every((field) => auth[field] === false) &&
      auth.remote_ddl === false &&
      auth.remote_dml === false,
  };
  return { accepted: allTrue(gates), gates };
}

export function buildSanitizedRemediationPlan(observation, sourceHashes) {
  const items = config.workstreams.map((workstream) => {
    const findingCount = observation.counts[workstream.source_count_field];
    return {
      ...workstream,
      finding_count: findingCount,
      human_review_required: true,
      status:
        findingCount > 0
          ? config.plan_contract.item_status_when_open
          : config.plan_contract.item_status_when_zero,
    };
  });
  const activeWorkstreams = items.filter(
    (item) => item.finding_count > 0,
  ).length;
  const totalFindings = items.reduce(
    (total, item) => total + item.finding_count,
    0,
  );

  return {
    schema_version: config.plan_contract.schema_version,
    status:
      totalFindings > 0
        ? config.plan_contract.ready_status
        : config.plan_contract.empty_status,
    source: {
      dossier_sha256: sourceHashes.dossier,
      target_descriptor_sha256: sourceHashes.target,
      permit_sha256: sourceHashes.permit,
      observation_sha256: sourceHashes.observation,
      catalog_sha256: observation.fingerprints.catalog_sha256,
      migration_ledger_sha256:
        observation.fingerprints.migration_ledger_sha256,
      advisors_sha256: observation.fingerprints.advisors_sha256,
    },
    summary: {
      total_findings: totalFindings,
      active_workstreams: activeWorkstreams,
      zero_finding_workstreams: items.length - activeWorkstreams,
    },
    items,
    privacy: Object.fromEntries(
      planPrivacyFields.map((field) => [field, false]),
    ),
    authorizations: Object.fromEntries(
      authorizationFields.map((field) => [field, false]),
    ),
  };
}

export function validateSanitizedRemediationPlan(plan, observation, sourceHashes) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const summary = plan?.summary ?? {};
  const source = plan?.source ?? {};
  const privacy = plan?.privacy ?? {};
  const authorizations = plan?.authorizations ?? {};
  const totalFindings = items.reduce(
    (total, item) =>
      total + (Number.isInteger(item?.finding_count) ? item.finding_count : 0),
    0,
  );
  const activeWorkstreams = items.filter(
    (item) => Number.isInteger(item?.finding_count) && item.finding_count > 0,
  ).length;
  const expectedStatus =
    totalFindings > 0
      ? config.plan_contract.ready_status
      : config.plan_contract.empty_status;
  const expectedSource = {
    dossier_sha256: sourceHashes.dossier,
    target_descriptor_sha256: sourceHashes.target,
    permit_sha256: sourceHashes.permit,
    observation_sha256: sourceHashes.observation,
    catalog_sha256: observation?.fingerprints?.catalog_sha256,
    migration_ledger_sha256:
      observation?.fingerprints?.migration_ledger_sha256,
    advisors_sha256: observation?.fingerprints?.advisors_sha256,
  };
  const catalogMatches = items.every((item, index) => {
    const workstream = config.workstreams[index];
    return (
      workstream &&
      item.id === workstream.id &&
      item.finding_class === workstream.finding_class &&
      item.source_count_field === workstream.source_count_field &&
      item.priority === workstream.priority &&
      item.owner_class === workstream.owner_class &&
      item.remediation_intent === workstream.remediation_intent &&
      item.verification_strategy === workstream.verification_strategy &&
      item.requires_migration_design ===
        workstream.requires_migration_design
    );
  });
  const gates = {
    plan_schema_matches:
      exactKeys(plan, planFields) &&
      plan?.schema_version === config.plan_contract.schema_version,
    plan_status_matches_findings: plan?.status === expectedStatus,
    plan_source_shape_is_exact: exactKeys(
      source,
      config.plan_contract.required_source_fields,
    ),
    plan_source_hashes_are_sha256:
      config.plan_contract.required_source_fields.every(
        (field) =>
          isSha256(source[field]) && source[field] === expectedSource[field],
      ),
    plan_summary_shape_is_exact: exactKeys(
      summary,
      config.plan_contract.required_summary_fields,
    ),
    plan_summary_matches_items:
      summary.total_findings === totalFindings &&
      summary.active_workstreams === activeWorkstreams &&
      summary.zero_finding_workstreams === items.length - activeWorkstreams,
    plan_item_count_matches_catalog:
      items.length === config.workstreams.length,
    plan_item_shapes_are_exact: items.every((item) =>
      exactKeys(item, config.plan_contract.required_item_fields),
    ),
    plan_items_match_catalog:
      catalogMatches &&
      items.every(
        (item) =>
          controlledPriorities.includes(item.priority) &&
          controlledOwners.includes(item.owner_class),
      ),
    plan_counts_match_observation: items.every(
      (item) =>
        Number.isInteger(item.finding_count) &&
        item.finding_count >= 0 &&
        item.finding_count ===
          observation?.counts?.[item.source_count_field] &&
        item.status ===
          (item.finding_count > 0
            ? config.plan_contract.item_status_when_open
            : config.plan_contract.item_status_when_zero),
    ),
    plan_requires_human_review: items.every(
      (item) => item.human_review_required === true,
    ),
    plan_contains_counts_only:
      config.plan_contract.counts_only === true &&
      items.every((item) =>
        Number.isInteger(item.finding_count),
      ),
    plan_contains_no_object_names:
      exactKeys(privacy, planPrivacyFields) &&
      privacy.contains_object_names === false,
    plan_contains_no_sql_or_raw_output:
      privacy.contains_raw_sql === false &&
      privacy.contains_raw_cli_output === false,
    plan_contains_no_credentials_or_rows:
      privacy.contains_credentials === false &&
      privacy.contains_personal_data === false &&
      privacy.contains_business_data === false &&
      privacy.contains_auth_user_data === false,
    plan_authorizes_no_remote_action:
      exactKeys(authorizations, authorizationFields) &&
      authorizationFields.every((field) => authorizations[field] === false),
  };
  return { accepted: allTrue(gates), gates };
}

function validateWorkstreamCatalog() {
  const sourceFields = config.workstreams.map(
    (workstream) => workstream.source_count_field,
  );
  const priorities = config.workstreams.map(
    (workstream) => workstream.priority,
  );
  const owners = config.workstreams.map(
    (workstream) => workstream.owner_class,
  );
  return {
    workstream_catalog_is_exact:
      config.workstreams.length === 7 &&
      new Set(config.workstreams.map((workstream) => workstream.id)).size ===
        7 &&
      config.workstreams.every((workstream) =>
        exactKeys(workstream, [
          "id",
          "finding_class",
          "source_count_field",
          "priority",
          "owner_class",
          "remediation_intent",
          "verification_strategy",
          "requires_migration_design",
        ]),
      ),
    source_count_fields_are_unique:
      new Set(sourceFields).size === sourceFields.length,
    priorities_are_controlled: priorities.every((priority) =>
      controlledPriorities.includes(priority),
    ),
    owners_are_controlled: owners.every((owner) =>
      controlledOwners.includes(owner),
    ),
    remediation_intents_are_controlled:
      new Set(
        config.workstreams.map((workstream) => workstream.remediation_intent),
      ).size === config.workstreams.length,
    verification_strategies_are_controlled:
      new Set(
        config.workstreams.map(
          (workstream) => workstream.verification_strategy,
        ),
      ).size === config.workstreams.length,
  };
}

export function assessSanitizedRemediationPlan({
  paths = config.input_contract,
} = {}) {
  const dossier = readArtifact(paths.phase_017_dossier_path);
  const target = readArtifact(paths.target_descriptor_path);
  const permit = readArtifact(paths.phase_018_permit_path);
  const observation = readArtifact(paths.phase_018_observation_path);
  const dossierValidation = dossier.parses
    ? validateDossier(dossier.value)
    : { accepted: false, gates: {} };
  const targetValidation = target.parses
    ? validateTarget(target.value)
    : { accepted: false, gates: {} };
  const permitValidation = permit.parses
    ? validateHistoricalPermit(permit.value, {
        dossierSha256: dossier.hash,
        targetSha256: target.hash,
      })
    : { accepted: false, gates: {} };
  const observationValidation = observation.parses
    ? validateObservation(observation.value, {
        dossierSha256: dossier.hash,
        targetSha256: target.hash,
        permitSha256: permit.hash,
      })
    : { accepted: false, gates: {} };
  const sourceHashes = {
    dossier: dossier.hash,
    target: target.hash,
    permit: permit.hash,
    observation: observation.hash,
  };
  const plan =
    observationValidation.accepted &&
    dossierValidation.accepted &&
    targetValidation.accepted &&
    permitValidation.accepted
      ? buildSanitizedRemediationPlan(observation.value, sourceHashes)
      : null;
  const planValidation = plan
    ? validateSanitizedRemediationPlan(
        plan,
        observation.value,
        sourceHashes,
      )
    : { accepted: false, gates: {} };
  const baseGates = {
    phase_017_dossier_exists: dossier.exists,
    phase_017_dossier_parses: dossier.parses,
    dossier_contract_is_valid: dossierValidation.accepted,
    target_descriptor_exists: target.exists,
    target_descriptor_parses: target.parses,
    target_contract_is_valid: targetValidation.accepted,
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
    phase_018_permit_exists: permit.exists,
    phase_018_permit_parses: permit.parses,
    ...permitValidation.gates,
    phase_018_observation_exists: observation.exists,
    phase_018_observation_parses: observation.parses,
    observation_contract_is_valid: observationValidation.accepted,
    observation_hash_bindings_match:
      observationValidation.gates?.observation_hash_bindings_match === true,
    observation_is_metadata_only:
      observationValidation.gates?.observation_is_metadata_only === true,
    observation_is_sanitized:
      observationValidation.gates?.observation_is_sanitized === true,
    observation_performed_no_mutation:
      observationValidation.gates
        ?.observation_performed_no_remote_mutation === true,
    source_chain_is_hash_bound:
      permitValidation.gates?.permit_hash_bindings_match === true &&
      observationValidation.gates?.observation_hash_bindings_match === true,
    ...validateWorkstreamCatalog(),
    ...planValidation.gates,
    migration_not_generated_or_applied: true,
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
    phase: "19/24",
    status: ready
      ? plan.status
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
      phase_018_permit: permit.exists,
      phase_018_observation: observation.exists,
    },
    plan: ready
      ? plan
      : {
          generated_in_memory: false,
          persisted: false,
          total_findings: null,
          active_workstreams: null,
        },
    safety: {
      evaluator_executed_remote_command: false,
      evaluator_wrote_file: false,
      remote_read_executed: false,
      remote_write_executed: false,
      migration_generated: false,
      migration_applied: false,
      branch_mutated: false,
      production_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    conclusion: {
      ready_for_local_migration_design: ready,
      remote_apply_authorized: false,
      production_authorized: false,
      human_review_required: true,
      next_phase: config.next_phase,
    },
  };
}

function syntheticFixture() {
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
      dynamic_test_sha256: "2".repeat(64)
    },
    target: {
      target_type: target.target_type,
      environment: target.environment,
      data_policy: target.data_policy,
      project_ref_sha256: target.project_ref_sha256,
      target_fingerprint_sha256: target.target_fingerprint_sha256
    },
    authorizations: {
      homologation_preflight: true,
      remote_apply: false,
      production: false,
      real_data_copy: false
    }
  };
  const dossierSource = JSON.stringify(dossier);
  const targetSource = JSON.stringify(target);
  const permit = {
    schema_version: "atlas.isolated_branch_preflight_permit.v1",
    status: "approved_for_isolated_read_only_preflight",
    scope: "isolated_supabase_branch_read_only_metadata_and_catalog",
    one_shot: true,
    consumed: false,
    issued_at: "2026-07-23T11:55:00.000Z",
    expires_at: "2026-07-23T12:20:00.000Z",
    reviewed_by: "reviewer_phase19",
    change_ticket: "change_phase19",
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
      data_export: false
    }
  };
  const permitSource = JSON.stringify(permit);
  const checks = [
    "branch_reachability",
    "branch_isolation",
    "migration_ledger",
    "rls_posture",
    "data_api_grants",
    "update_policy_posture",
    "view_security_posture",
    "security_definer_posture",
    "security_advisors",
    "performance_advisors"
  ];
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
    checks: Object.fromEntries(checks.map((check) => [check, "captured"])),
    counts: {
      migration_entries: 18,
      exposed_tables: 27,
      tables_with_rls: 25,
      tables_without_rls: 2,
      data_api_grant_findings: 3,
      update_policy_findings: 1,
      view_security_findings: 1,
      security_definer_findings: 2,
      security_advisor_findings: 4,
      performance_advisor_findings: 5
    },
    fingerprints: {
      catalog_sha256: "3".repeat(64),
      migration_ledger_sha256: "4".repeat(64),
      advisors_sha256: "5".repeat(64)
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
      storage_objects_read: false
    }
  };
  const observationSource = JSON.stringify(observation);
  const hashes = {
    dossier: sha256(dossierSource),
    target: sha256(targetSource),
    permit: sha256(permitSource),
    observation: sha256(observationSource)
  };
  return { dossier, target, permit, observation, hashes };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

export function selfTest() {
  const fixture = syntheticFixture();
  const dossierValidation = validateDossier(fixture.dossier);
  const targetValidation = validateTarget(fixture.target);
  const permitValidation = validateHistoricalPermit(fixture.permit, {
    dossierSha256: fixture.hashes.dossier,
    targetSha256: fixture.hashes.target,
  });
  const observationValidation = validateObservation(fixture.observation, {
    dossierSha256: fixture.hashes.dossier,
    targetSha256: fixture.hashes.target,
    permitSha256: fixture.hashes.permit,
  });
  const plan = buildSanitizedRemediationPlan(
    fixture.observation,
    fixture.hashes,
  );
  const planValidation = validateSanitizedRemediationPlan(
    plan,
    fixture.observation,
    fixture.hashes,
  );
  const baseline = [
    dossierValidation,
    targetValidation,
    permitValidation,
    observationValidation,
    planValidation,
  ].every((result) => result.accepted);
  const mutants = [
    () => validateHistoricalPermit({ ...fixture.permit, schema_version: "bad" }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target }).accepted,
    () => validateHistoricalPermit({ ...fixture.permit, consumed: true }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target }).accepted,
    () => validateHistoricalPermit({ ...fixture.permit, dossier_sha256: "0".repeat(64) }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target }).accepted,
    () => validateHistoricalPermit({ ...fixture.permit, authorizations: { ...fixture.permit.authorizations, remote_dml: true } }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target }).accepted,
    () => validateHistoricalPermit({ ...fixture.permit, authorizations: { ...fixture.permit.authorizations, business_rows_read: true } }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target }).accepted,
    () => validateObservation({ ...fixture.observation, metadata_only: false }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target, permitSha256: fixture.hashes.permit }).accepted,
    () => validateObservation({ ...fixture.observation, counts: { ...fixture.observation.counts, tables_without_rls: -1 } }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target, permitSha256: fixture.hashes.permit }).accepted,
    () => validateObservation({ ...fixture.observation, privacy: { ...fixture.observation.privacy, contains_object_names: true } }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target, permitSha256: fixture.hashes.permit }).accepted,
    () => validateObservation({ ...fixture.observation, safety: { ...fixture.observation.safety, remote_write_executed: true } }, { dossierSha256: fixture.hashes.dossier, targetSha256: fixture.hashes.target, permitSha256: fixture.hashes.permit }).accepted,
    () => {
      const mutant = clone(plan);
      mutant.schema_version = "bad";
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.status = "approved_for_apply";
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.source.observation_sha256 = "0".repeat(64);
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.summary.total_findings += 1;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items.pop();
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items[0].finding_count += 1;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items[0].priority = "P3";
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items[0].human_review_required = false;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items[0].status = "applied";
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items[0].sql = "alter table";
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.privacy.contains_raw_sql = true;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.privacy.contains_object_names = true;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.privacy.contains_credentials = true;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.authorizations.remote_read = true;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.authorizations.migration_generation = true;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.authorizations.migration_apply = true;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.authorizations.production = true;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items[0].source_count_field = "migration_entries";
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    },
    () => {
      const mutant = clone(plan);
      mutant.items[6].requires_migration_design = false;
      return validateSanitizedRemediationPlan(mutant, fixture.observation, fixture.hashes).accepted;
    }
  ];
  const rejected = mutants.filter((mutant) => mutant() === false).length;
  return {
    safe_baseline: baseline ? "accepted" : "rejected",
    total_findings: plan.summary.total_findings,
    active_workstreams: plan.summary.active_workstreams,
    mutants_rejected: rejected,
    mutants_total: mutants.length,
    remote_command_executed: false,
    file_written: false,
    migration_generated: false,
    migration_applied: false,
    production_touched: false
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const payload = process.argv.includes("--self-test")
    ? selfTest()
    : assessSanitizedRemediationPlan();
  console.log(JSON.stringify(payload, null, 2));
  if (
    process.argv.includes("--self-test") &&
    (payload.safe_baseline !== "accepted" ||
      payload.mutants_rejected !== payload.mutants_total)
  ) {
    process.exit(1);
  }
}

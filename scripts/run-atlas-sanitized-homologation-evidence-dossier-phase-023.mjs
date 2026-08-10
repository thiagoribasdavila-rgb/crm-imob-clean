import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessLocalDisposableMigrationRehearsal } from "./run-atlas-local-disposable-migration-rehearsal-phase-022.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(
      root,
      "config/atlas-10x-phase-023-sanitized-homologation-evidence-dossier.json",
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
const clone = (value) => JSON.parse(JSON.stringify(value));
const safeIdentifier = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:@/-]{3,120}$/.test(value);
const validDate = (value) => Number.isFinite(new Date(value).getTime());
const isNonNegativeInteger = (value) =>
  Number.isInteger(value) && value >= 0;

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
    return { exists: false, parses: false, value: null, hash: "" };
  }
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    return { exists: false, parses: false, value: null, hash: "" };
  }
  const source = readFileSync(absolute, "utf8");
  try {
    return {
      exists: true,
      parses: true,
      value: JSON.parse(source),
      hash: sha256(source),
    };
  } catch {
    return {
      exists: true,
      parses: false,
      value: null,
      hash: sha256(source),
    };
  }
}

function falseRecord(fields) {
  return Object.fromEntries(fields.map((field) => [field, false]));
}

function trueRecord(fields) {
  return Object.fromEntries(fields.map((field) => [field, true]));
}

function securityCatalogHash() {
  return sha256(JSON.stringify(config.security_test_catalog));
}

export function validateExecutionReceipt(receipt, { phase022 } = {}) {
  const source = receipt?.source ?? {};
  const environment = receipt?.environment ?? {};
  const execution = receipt?.execution ?? {};
  const tests = receipt?.test_results ?? {};
  const lint = receipt?.lint_results ?? {};
  const fingerprints = receipt?.fingerprints ?? {};
  const cleanup = receipt?.cleanup ?? {};
  const privacy = receipt?.privacy ?? {};
  const authorizations = receipt?.authorizations ?? {};
  const startedAt = new Date(execution.started_at ?? "");
  const completedAt = new Date(execution.completed_at ?? "");
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
    receipt_phase_022_snapshot_is_ready:
      source.phase_022_schema_version ===
        config.source_contract.phase_022_schema_version &&
      source.phase_022_status ===
        "ready_for_single_disposable_local_rehearsal" &&
      source.phase_022_gates_passed === source.phase_022_gates_total &&
      source.phase_022_gates_total === 83 &&
      phase022?.schema_version ===
        config.source_contract.phase_022_schema_version,
    receipt_source_hashes_are_sha256: [
      source.phase_022_plan_sha256,
      source.authoring_receipt_sha256,
      source.rehearsal_authorization_sha256,
      source.migration_sha256,
      source.pgtap_sha256,
      source.baseline_manifest_sha256,
    ].every(isSha256),
    receipt_environment_shape_is_exact: exactKeys(
      environment,
      config.receipt_contract.required_environment_fields,
    ),
    receipt_environment_is_isolated:
      environment.cli_version ===
        config.source_contract.required_cli_version &&
      environment.project_id ===
        config.source_contract.required_project_id &&
      environment.workdir === config.source_contract.required_workdir &&
      environment.external_traffic_allowed === false &&
      environment.synthetic_fixtures_only === true &&
      environment.seed_executed === false,
    receipt_source_config_hash_is_sha256: isSha256(
      environment.source_config_sha256,
    ),
    receipt_execution_shape_is_exact: exactKeys(
      execution,
      config.receipt_contract.required_execution_fields,
    ),
    receipt_execution_timestamps_are_valid:
      validDate(execution.started_at) &&
      validDate(execution.completed_at) &&
      completedAt.getTime() >= startedAt.getTime(),
    receipt_authorization_was_consumed:
      execution.authorization_consumed === true,
    receipt_all_execution_steps_passed:
      config.receipt_contract.required_execution_fields
        .filter(
          (field) => !["started_at", "completed_at"].includes(field),
        )
        .every((field) => execution[field] === true),
    receipt_test_results_shape_is_exact: exactKeys(
      tests,
      config.receipt_contract.required_test_result_fields,
    ),
    receipt_test_results_are_complete:
      tests.file === config.source_contract.required_test_file &&
      tests.total === config.source_contract.required_test_count &&
      tests.passed === config.source_contract.required_test_count &&
      tests.failed === 0 &&
      tests.skipped === 0,
    receipt_test_catalog_hash_matches:
      tests.catalog_sha256 === securityCatalogHash(),
    receipt_lint_results_shape_is_exact: exactKeys(
      lint,
      config.receipt_contract.required_lint_result_fields,
    ),
    receipt_lint_has_zero_errors:
      lint.level === "error" &&
      lint.fail_on === "error" &&
      lint.errors === 0 &&
      isNonNegativeInteger(lint.warnings),
    receipt_fingerprint_shape_is_exact: exactKeys(
      fingerprints,
      config.receipt_contract.required_fingerprint_fields,
    ),
    receipt_schema_fingerprint_restored:
      isSha256(fingerprints.schema_before_sha256) &&
      fingerprints.schema_restored_sha256 ===
        fingerprints.schema_before_sha256,
    receipt_history_fingerprint_restored:
      isSha256(fingerprints.migration_history_before_sha256) &&
      fingerprints.migration_history_restored_sha256 ===
        fingerprints.migration_history_before_sha256,
    receipt_migration_changed_schema:
      isSha256(fingerprints.schema_after_sha256) &&
      fingerprints.schema_after_sha256 !==
        fingerprints.schema_before_sha256,
    receipt_migration_changed_history:
      isSha256(fingerprints.migration_history_after_sha256) &&
      fingerprints.migration_history_after_sha256 !==
        fingerprints.migration_history_before_sha256,
    receipt_cleanup_shape_is_exact: exactKeys(
      cleanup,
      config.receipt_contract.required_cleanup_fields,
    ),
    receipt_cleanup_is_targeted_and_complete:
      cleanup.project_id === config.source_contract.required_project_id &&
      cleanup.used_all_flag === false &&
      cleanup.used_no_backup === true &&
      cleanup.volumes_removed === true &&
      cleanup.workdir_removed === true &&
      cleanup.residual_containers === 0 &&
      cleanup.residual_volumes === 0,
    receipt_privacy_shape_is_exact: exactKeys(
      privacy,
      config.receipt_contract.required_privacy_fields,
    ),
    receipt_contains_no_sensitive_or_raw_evidence:
      Object.values(privacy).every((value) => value === false),
    receipt_authorization_shape_is_exact: exactKeys(
      authorizations,
      config.receipt_contract.required_authorization_fields,
    ),
    receipt_authorizes_no_remote_action:
      Object.values(authorizations).every((value) => value === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function validateHumanReview(
  review,
  executionReceiptHash,
  now = new Date(),
) {
  const checks = review?.checks ?? {};
  const authorizations = review?.authorizations ?? {};
  const issuedAt = new Date(review?.issued_at ?? "");
  const expiresAt = new Date(review?.expires_at ?? "");
  const ttl =
    config.input_contract.review_ttl_minutes * 60 * 1000;
  const gates = {
    review_schema_and_status_match:
      review?.schema_version ===
        config.input_contract.required_review_schema_version &&
      review?.status === config.input_contract.required_review_status,
    review_root_shape_is_exact: exactKeys(
      review,
      config.review_contract.required_root_fields,
    ),
    review_scope_matches:
      review?.scope === config.input_contract.required_review_scope,
    review_is_one_shot_and_unused:
      review?.one_shot === true && review?.consumed === false,
    review_window_is_valid:
      validDate(review?.issued_at) &&
      validDate(review?.expires_at) &&
      expiresAt.getTime() > issuedAt.getTime() &&
      expiresAt.getTime() - issuedAt.getTime() <= ttl &&
      now.getTime() >= issuedAt.getTime() &&
      now.getTime() <= expiresAt.getTime(),
    reviewer_is_present: safeIdentifier(review?.reviewed_by),
    review_change_ticket_is_present: safeIdentifier(review?.change_ticket),
    review_receipt_hash_matches:
      isSha256(executionReceiptHash) &&
      review?.execution_receipt_sha256 === executionReceiptHash,
    review_checks_shape_is_exact: exactKeys(
      checks,
      config.review_contract.required_check_fields,
    ),
    review_checks_are_all_approved:
      Object.values(checks).every((value) => value === true),
    review_decision_is_limited:
      review?.decision === config.review_contract.required_decision,
    review_authorization_shape_is_exact: exactKeys(
      authorizations,
      config.review_contract.required_authorization_fields,
    ),
    review_authorizes_only_dossier_preparation:
      authorizations.dossier_generation === true &&
      authorizations.homologation_decision_preparation === true &&
      Object.entries(authorizations)
        .filter(
          ([field]) =>
            ![
              "dossier_generation",
              "homologation_decision_preparation",
            ].includes(field),
        )
        .every(([, value]) => value === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function buildSanitizedDossier(
  receipt,
  review,
  executionReceiptHash,
  humanReviewHash,
) {
  const tests = receipt.test_results;
  const lint = receipt.lint_results;
  const fingerprints = receipt.fingerprints;
  const cleanup = receipt.cleanup;
  return {
    schema_version: config.dossier_contract.schema_version,
    status: config.dossier_contract.ready_status,
    source: {
      execution_receipt_sha256: executionReceiptHash,
      human_review_sha256: humanReviewHash,
      migration_sha256: receipt.source.migration_sha256,
      pgtap_sha256: receipt.source.pgtap_sha256,
      baseline_manifest_sha256:
        receipt.source.baseline_manifest_sha256,
    },
    environment: {
      cli_version: receipt.environment.cli_version,
      project_id: receipt.environment.project_id,
      workdir: receipt.environment.workdir,
      external_traffic_allowed: false,
      synthetic_fixtures_only: true,
      production_hardening_claimed: false,
    },
    verification: {
      pgtap_total: tests.total,
      pgtap_passed: tests.passed,
      pgtap_failed: tests.failed,
      pgtap_skipped: tests.skipped,
      lint_errors: lint.errors,
      lint_warnings: lint.warnings,
      tests_before_cleanup_passed:
        receipt.execution.pre_cleanup_tests_passed,
      tests_after_restore_passed:
        receipt.execution.post_restore_tests_passed,
    },
    security_coverage: {
      anonymous_crud_denied: true,
      cross_tenant_crud_denied: true,
      owned_crud_allowed: true,
      tenant_reassignment_denied: true,
      data_api_grants_and_rls_verified: true,
      security_invoker_verified: true,
      public_function_execute_denied: true,
      service_secret_absent_from_client: true,
    },
    rollback: {
      strategy: "destroy_volume_rebuild_baseline_and_compare_sha256",
      schema_restored:
        fingerprints.schema_before_sha256 ===
        fingerprints.schema_restored_sha256,
      migration_history_restored:
        fingerprints.migration_history_before_sha256 ===
        fingerprints.migration_history_restored_sha256,
      fingerprints_present: [
        fingerprints.schema_before_sha256,
        fingerprints.schema_after_sha256,
        fingerprints.schema_restored_sha256,
        fingerprints.migration_history_before_sha256,
        fingerprints.migration_history_after_sha256,
        fingerprints.migration_history_restored_sha256,
      ].every(isSha256),
    },
    cleanup: {
      targeted_project_id: cleanup.project_id,
      global_cleanup_used: cleanup.used_all_flag,
      volumes_removed: cleanup.volumes_removed,
      workdir_removed: cleanup.workdir_removed,
      residual_resources:
        cleanup.residual_containers + cleanup.residual_volumes,
    },
    decision: {
      recommendation: "eligible_for_final_human_homologation_review",
      human_approval_required: true,
      remote_apply_authorized: false,
      linked_project_authorized: false,
      production_authorized: false,
      next_phase: "24/24",
    },
    privacy: falseRecord(
      config.dossier_contract.required_privacy_fields,
    ),
    authorizations: falseRecord(
      config.dossier_contract.required_authorization_fields,
    ),
  };
}

export function validateSanitizedDossier(
  dossier,
  receipt,
  review,
  executionReceiptHash,
  humanReviewHash,
) {
  const source = dossier?.source ?? {};
  const environment = dossier?.environment ?? {};
  const verification = dossier?.verification ?? {};
  const security = dossier?.security_coverage ?? {};
  const rollback = dossier?.rollback ?? {};
  const cleanup = dossier?.cleanup ?? {};
  const decision = dossier?.decision ?? {};
  const privacy = dossier?.privacy ?? {};
  const authorizations = dossier?.authorizations ?? {};
  const gates = {
    dossier_schema_and_status_match:
      dossier?.schema_version ===
        config.dossier_contract.schema_version &&
      dossier?.status === config.dossier_contract.ready_status,
    dossier_root_shape_is_exact: exactKeys(
      dossier,
      config.dossier_contract.required_root_fields,
    ),
    dossier_source_shape_is_exact: exactKeys(
      source,
      config.dossier_contract.required_source_fields,
    ),
    dossier_source_hashes_match:
      source.execution_receipt_sha256 === executionReceiptHash &&
      source.human_review_sha256 === humanReviewHash &&
      source.migration_sha256 === receipt?.source?.migration_sha256 &&
      source.pgtap_sha256 === receipt?.source?.pgtap_sha256 &&
      source.baseline_manifest_sha256 ===
        receipt?.source?.baseline_manifest_sha256 &&
      Object.values(source).every(isSha256),
    dossier_environment_shape_is_exact: exactKeys(
      environment,
      config.dossier_contract.required_environment_fields,
    ),
    dossier_environment_is_non_production:
      environment.cli_version ===
        config.source_contract.required_cli_version &&
      environment.project_id ===
        config.source_contract.required_project_id &&
      environment.workdir === config.source_contract.required_workdir &&
      environment.external_traffic_allowed === false &&
      environment.synthetic_fixtures_only === true &&
      environment.production_hardening_claimed === false,
    dossier_verification_shape_is_exact: exactKeys(
      verification,
      config.dossier_contract.required_verification_fields,
    ),
    dossier_tests_are_complete:
      verification.pgtap_total ===
        config.source_contract.required_test_count &&
      verification.pgtap_passed ===
        config.source_contract.required_test_count &&
      verification.pgtap_failed === 0 &&
      verification.pgtap_skipped === 0 &&
      verification.tests_before_cleanup_passed === true &&
      verification.tests_after_restore_passed === true,
    dossier_lint_is_acceptable:
      verification.lint_errors === 0 &&
      isNonNegativeInteger(verification.lint_warnings),
    dossier_security_coverage_shape_is_exact: exactKeys(
      security,
      config.dossier_contract.required_security_coverage_fields,
    ),
    dossier_security_coverage_is_complete:
      Object.values(security).every((value) => value === true) &&
      Object.values(review?.checks ?? {}).every((value) => value === true),
    dossier_rollback_shape_is_exact: exactKeys(
      rollback,
      config.dossier_contract.required_rollback_fields,
    ),
    dossier_rollback_is_verified:
      rollback.strategy ===
        "destroy_volume_rebuild_baseline_and_compare_sha256" &&
      rollback.schema_restored === true &&
      rollback.migration_history_restored === true &&
      rollback.fingerprints_present === true,
    dossier_cleanup_shape_is_exact: exactKeys(
      cleanup,
      config.dossier_contract.required_cleanup_fields,
    ),
    dossier_cleanup_is_verified:
      cleanup.targeted_project_id ===
        config.source_contract.required_project_id &&
      cleanup.global_cleanup_used === false &&
      cleanup.volumes_removed === true &&
      cleanup.workdir_removed === true &&
      cleanup.residual_resources === 0,
    dossier_decision_shape_is_exact: exactKeys(
      decision,
      config.dossier_contract.required_decision_fields,
    ),
    dossier_requires_human_approval:
      decision.recommendation ===
        "eligible_for_final_human_homologation_review" &&
      decision.human_approval_required === true &&
      decision.next_phase === "24/24",
    dossier_authorizes_no_remote_apply:
      decision.remote_apply_authorized === false &&
      decision.linked_project_authorized === false &&
      decision.production_authorized === false,
    dossier_privacy_shape_is_exact: exactKeys(
      privacy,
      config.dossier_contract.required_privacy_fields,
    ),
    dossier_contains_no_sensitive_or_raw_evidence:
      Object.values(privacy).every((value) => value === false),
    dossier_authorization_shape_is_exact: exactKeys(
      authorizations,
      config.dossier_contract.required_authorization_fields,
    ),
    dossier_authorizes_no_remote_action:
      Object.values(authorizations).every((value) => value === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function assessSanitizedHomologationEvidence({
  executionReceiptPath = config.input_contract.execution_receipt_path,
  humanReviewPath = config.input_contract.human_review_path,
  now = new Date(),
  phase022Assessment,
} = {}) {
  const phase022 =
    phase022Assessment ?? assessLocalDisposableMigrationRehearsal();
  const phase022Available =
    phase022?.schema_version ===
    config.source_contract.phase_022_schema_version;
  const receiptArtifact = readArtifact(executionReceiptPath);
  const receiptValidation = receiptArtifact.parses
    ? validateExecutionReceipt(receiptArtifact.value, { phase022 })
    : { accepted: false, gates: {} };
  const reviewArtifact = readArtifact(humanReviewPath);
  const reviewValidation =
    reviewArtifact.parses && receiptValidation.accepted
      ? validateHumanReview(
          reviewArtifact.value,
          receiptArtifact.hash,
          now,
        )
      : { accepted: false, gates: {} };
  const readyForDossier =
    receiptValidation.accepted && reviewValidation.accepted;
  const dossier = readyForDossier
    ? buildSanitizedDossier(
        receiptArtifact.value,
        reviewArtifact.value,
        receiptArtifact.hash,
        reviewArtifact.hash,
      )
    : null;
  const dossierValidation = dossier
    ? validateSanitizedDossier(
        dossier,
        receiptArtifact.value,
        reviewArtifact.value,
        receiptArtifact.hash,
        reviewArtifact.hash,
      )
    : { accepted: false, gates: {} };
  const baseGates = {
    phase_022_assessment_is_available: phase022Available,
    execution_receipt_exists: receiptArtifact.exists,
    execution_receipt_parses: receiptArtifact.parses,
    ...receiptValidation.gates,
    human_review_exists: reviewArtifact.exists,
    human_review_parses: reviewArtifact.parses,
    ...reviewValidation.gates,
    dossier_is_generated_in_memory: dossier !== null,
    ...dossierValidation.gates,
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
    phase: "23/24",
    status: ready ? dossier.status : config.status,
    dossier_gates: {
      passed,
      total: config.required_gates.length,
      percentage: Math.round((passed / config.required_gates.length) * 100),
      blockers,
    },
    inputs: {
      phase_022_assessment_available: phase022Available,
      execution_receipt_exists: receiptArtifact.exists,
      execution_receipt_parses: receiptArtifact.parses,
      execution_receipt_sha256: receiptArtifact.hash || null,
      human_review_exists: reviewArtifact.exists,
      human_review_parses: reviewArtifact.parses,
      human_review_sha256: reviewArtifact.hash || null,
    },
    dossier: ready
      ? dossier
      : {
          generated_in_memory: false,
          persisted: false,
          raw_evidence_embedded: false,
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
      ready_for_human_homologation_decision: ready,
      human_approval_required: true,
      remote_apply_authorized: false,
      linked_project_authorized: false,
      production_authorized: false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticExecutionReceipt() {
  return {
    schema_version: config.input_contract.required_receipt_schema_version,
    status: config.input_contract.required_receipt_status,
    source: {
      phase_022_schema_version:
        config.source_contract.phase_022_schema_version,
      phase_022_status: "ready_for_single_disposable_local_rehearsal",
      phase_022_gates_passed: 83,
      phase_022_gates_total: 83,
      phase_022_plan_sha256: "1".repeat(64),
      authoring_receipt_sha256: "2".repeat(64),
      rehearsal_authorization_sha256: "3".repeat(64),
      migration_sha256: "4".repeat(64),
      pgtap_sha256: "5".repeat(64),
      baseline_manifest_sha256: "6".repeat(64),
    },
    environment: {
      cli_version: config.source_contract.required_cli_version,
      project_id: config.source_contract.required_project_id,
      workdir: config.source_contract.required_workdir,
      source_config_sha256: "7".repeat(64),
      external_traffic_allowed: false,
      synthetic_fixtures_only: true,
      seed_executed: false,
    },
    execution: {
      started_at: "2026-07-23T12:00:00.000Z",
      completed_at: "2026-07-23T12:10:00.000Z",
      authorization_consumed: true,
      db_start_passed: true,
      baseline_reset_passed: true,
      migration_up_passed: true,
      pgtap_passed: true,
      db_lint_passed: true,
      pre_cleanup_tests_passed: true,
      volume_destroyed: true,
      baseline_rebuild_passed: true,
      post_restore_tests_passed: true,
      final_cleanup_passed: true,
    },
    test_results: {
      file: config.source_contract.required_test_file,
      total: config.source_contract.required_test_count,
      passed: config.source_contract.required_test_count,
      failed: 0,
      skipped: 0,
      catalog_sha256: securityCatalogHash(),
    },
    lint_results: {
      level: "error",
      fail_on: "error",
      errors: 0,
      warnings: 0,
    },
    fingerprints: {
      schema_before_sha256: "8".repeat(64),
      schema_after_sha256: "9".repeat(64),
      schema_restored_sha256: "8".repeat(64),
      migration_history_before_sha256: "a".repeat(64),
      migration_history_after_sha256: "b".repeat(64),
      migration_history_restored_sha256: "a".repeat(64),
    },
    cleanup: {
      project_id: config.source_contract.required_project_id,
      used_all_flag: false,
      used_no_backup: true,
      volumes_removed: true,
      workdir_removed: true,
      residual_containers: 0,
      residual_volumes: 0,
    },
    privacy: falseRecord(
      config.receipt_contract.required_privacy_fields,
    ),
    authorizations: falseRecord(
      config.receipt_contract.required_authorization_fields,
    ),
  };
}

function syntheticHumanReview(receiptHash) {
  const authorizations = falseRecord(
    config.review_contract.required_authorization_fields,
  );
  authorizations.dossier_generation = true;
  authorizations.homologation_decision_preparation = true;
  return {
    schema_version: config.input_contract.required_review_schema_version,
    status: config.input_contract.required_review_status,
    scope: config.input_contract.required_review_scope,
    one_shot: true,
    consumed: false,
    issued_at: "2026-07-23T12:15:00.000Z",
    expires_at: "2026-07-23T12:45:00.000Z",
    reviewed_by: "security-reviewer",
    change_ticket: "ATLAS-023",
    execution_receipt_sha256: receiptHash,
    checks: trueRecord(config.review_contract.required_check_fields),
    decision: config.review_contract.required_decision,
    authorizations,
  };
}

function mutations(value, paths) {
  return paths.map(([path, replacement]) => {
    const copy = clone(value);
    const segments = path.split(".");
    let target = copy;
    for (const segment of segments.slice(0, -1)) target = target[segment];
    target[segments.at(-1)] = replacement;
    return { path, value: copy };
  });
}

export function selfTest() {
  const phase022 = {
    schema_version: config.source_contract.phase_022_schema_version,
  };
  const receipt = syntheticExecutionReceipt();
  const receiptSource = JSON.stringify(receipt);
  const receiptHash = sha256(receiptSource);
  const review = syntheticHumanReview(receiptHash);
  const reviewHash = sha256(JSON.stringify(review));
  const now = new Date("2026-07-23T12:20:00.000Z");
  const receiptValidation = validateExecutionReceipt(receipt, {
    phase022,
  });
  const reviewValidation = validateHumanReview(
    review,
    receiptHash,
    now,
  );
  const dossier = buildSanitizedDossier(
    receipt,
    review,
    receiptHash,
    reviewHash,
  );
  const dossierValidation = validateSanitizedDossier(
    dossier,
    receipt,
    review,
    receiptHash,
    reviewHash,
  );
  const receiptMutants = mutations(receipt, [
    ["schema_version", "wrong"],
    ["status", "wrong"],
    ["source.phase_022_status", "blocked"],
    ["source.phase_022_gates_passed", 82],
    ["source.phase_022_plan_sha256", "bad"],
    ["environment.cli_version", "0.0.0"],
    ["environment.project_id", "other"],
    ["environment.workdir", "../escape"],
    ["environment.source_config_sha256", "bad"],
    ["environment.external_traffic_allowed", true],
    ["environment.synthetic_fixtures_only", false],
    ["environment.seed_executed", true],
    ["execution.completed_at", "invalid"],
    ["execution.authorization_consumed", false],
    ["execution.db_start_passed", false],
    ["execution.baseline_reset_passed", false],
    ["execution.migration_up_passed", false],
    ["execution.pgtap_passed", false],
    ["execution.db_lint_passed", false],
    ["execution.pre_cleanup_tests_passed", false],
    ["execution.volume_destroyed", false],
    ["execution.baseline_rebuild_passed", false],
    ["execution.post_restore_tests_passed", false],
    ["execution.final_cleanup_passed", false],
    ["test_results.file", "other.sql"],
    ["test_results.total", 17],
    ["test_results.passed", 17],
    ["test_results.failed", 1],
    ["test_results.skipped", 1],
    ["test_results.catalog_sha256", "bad"],
    ["lint_results.level", "warning"],
    ["lint_results.fail_on", "none"],
    ["lint_results.errors", 1],
    ["lint_results.warnings", -1],
    ["fingerprints.schema_before_sha256", "bad"],
    ["fingerprints.schema_after_sha256", "8".repeat(64)],
    ["fingerprints.schema_restored_sha256", "c".repeat(64)],
    ["fingerprints.migration_history_before_sha256", "bad"],
    ["fingerprints.migration_history_after_sha256", "a".repeat(64)],
    ["fingerprints.migration_history_restored_sha256", "c".repeat(64)],
    ["cleanup.project_id", "other"],
    ["cleanup.used_all_flag", true],
    ["cleanup.used_no_backup", false],
    ["cleanup.volumes_removed", false],
    ["cleanup.workdir_removed", false],
    ["cleanup.residual_containers", 1],
    ["cleanup.residual_volumes", 1],
    ["privacy.contains_raw_sql", true],
    ["privacy.contains_credentials", true],
    ["authorizations.remote_read", true],
    ["authorizations.production", true],
    ["authorizations.build", true],
  ]);
  const receiptExtra = clone(receipt);
  receiptExtra.unexpected = true;
  receiptMutants.push({ path: "unexpected", value: receiptExtra });

  const reviewMutants = mutations(review, [
    ["schema_version", "wrong"],
    ["status", "wrong"],
    ["scope", "wrong"],
    ["one_shot", false],
    ["consumed", true],
    ["expires_at", "2026-07-23T13:00:00.000Z"],
    ["reviewed_by", ""],
    ["change_ticket", ""],
    ["execution_receipt_sha256", "c".repeat(64)],
    ["checks.receipt_shape_reviewed", false],
    ["checks.hash_chain_reviewed", false],
    ["checks.pgtap_reviewed", false],
    ["checks.lint_reviewed", false],
    ["checks.rollback_reviewed", false],
    ["checks.cleanup_reviewed", false],
    ["checks.privacy_reviewed", false],
    ["checks.data_api_grants_and_rls_reviewed", false],
    ["checks.view_and_function_boundaries_reviewed", false],
    ["checks.service_secret_boundary_reviewed", false],
    ["decision", "apply_remote"],
    ["authorizations.dossier_generation", false],
    ["authorizations.homologation_decision_preparation", false],
    ["authorizations.remote_read", true],
    ["authorizations.linked_project", true],
    ["authorizations.db_push", true],
    ["authorizations.production", true],
    ["authorizations.release_package", true],
  ]);
  const expiredReview = clone(review);
  reviewMutants.push({ path: "expired", value: expiredReview });
  const reviewExtra = clone(review);
  reviewExtra.unexpected = true;
  reviewMutants.push({ path: "unexpected", value: reviewExtra });

  const dossierMutants = mutations(dossier, [
    ["schema_version", "wrong"],
    ["status", "wrong"],
    ["source.execution_receipt_sha256", "c".repeat(64)],
    ["source.human_review_sha256", "c".repeat(64)],
    ["environment.external_traffic_allowed", true],
    ["environment.production_hardening_claimed", true],
    ["verification.pgtap_passed", 17],
    ["verification.pgtap_failed", 1],
    ["verification.pgtap_skipped", 1],
    ["verification.lint_errors", 1],
    ["verification.tests_before_cleanup_passed", false],
    ["verification.tests_after_restore_passed", false],
    ["security_coverage.anonymous_crud_denied", false],
    ["security_coverage.data_api_grants_and_rls_verified", false],
    ["security_coverage.security_invoker_verified", false],
    ["security_coverage.public_function_execute_denied", false],
    ["security_coverage.service_secret_absent_from_client", false],
    ["rollback.schema_restored", false],
    ["rollback.migration_history_restored", false],
    ["rollback.fingerprints_present", false],
    ["cleanup.global_cleanup_used", true],
    ["cleanup.residual_resources", 1],
    ["decision.human_approval_required", false],
    ["decision.remote_apply_authorized", true],
    ["decision.linked_project_authorized", true],
    ["decision.production_authorized", true],
    ["privacy.contains_raw_cli_output", true],
    ["privacy.contains_credentials", true],
    ["authorizations.remote_read", true],
    ["authorizations.production", true],
  ]);
  const dossierExtra = clone(dossier);
  dossierExtra.unexpected = true;
  dossierMutants.push({ path: "unexpected", value: dossierExtra });

  const receiptRejected = receiptMutants.filter(
    ({ value }) =>
      !validateExecutionReceipt(value, { phase022 }).accepted,
  ).length;
  const reviewRejected = reviewMutants.filter(({ path, value }) => {
    const mutantNow =
      path === "expired"
        ? new Date("2026-07-23T13:00:00.000Z")
        : now;
    return !validateHumanReview(value, receiptHash, mutantNow).accepted;
  }).length;
  const dossierRejected = dossierMutants.filter(
    ({ value }) =>
      !validateSanitizedDossier(
        value,
        receipt,
        review,
        receiptHash,
        reviewHash,
      ).accepted,
  ).length;
  const total =
    receiptMutants.length + reviewMutants.length + dossierMutants.length;
  const rejected = receiptRejected + reviewRejected + dossierRejected;
  return {
    passed:
      receiptValidation.accepted &&
      reviewValidation.accepted &&
      dossierValidation.accepted &&
      rejected === total,
    valid_fixture: {
      receipt: receiptValidation.accepted,
      review: reviewValidation.accepted,
      dossier: dossierValidation.accepted,
    },
    mutants: {
      rejected,
      total,
      receipt_rejected: receiptRejected,
      review_rejected: reviewRejected,
      dossier_rejected: dossierRejected,
    },
    effects: {
      commands_executed: 0,
      files_written: 0,
      local_database_started: false,
      docker_accessed: false,
      migration_applied: false,
      remote_accessed: false,
      build_executed: false,
      package_created: false,
    },
  };
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const mode = process.argv.includes("--self-test")
    ? "self-test"
    : "assessment";
  const output =
    mode === "self-test"
      ? selfTest()
      : assessSanitizedHomologationEvidence();
  console.log(JSON.stringify(output, null, 2));
  if (mode === "self-test" && !output.passed) process.exitCode = 1;
}

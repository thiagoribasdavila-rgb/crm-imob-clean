import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessLocalDisposableMigrationRehearsal } from "./run-atlas-local-disposable-migration-rehearsal-phase-022.mjs";
import {
  assessSanitizedHomologationEvidence,
  buildSanitizedDossier,
  validateExecutionReceipt,
  validateHumanReview,
  validateSanitizedDossier,
} from "./run-atlas-sanitized-homologation-evidence-dossier-phase-023.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(
      root,
      "config/atlas-10x-phase-024-final-human-homologation-decision.json",
    ),
    "utf8",
  ),
);
const phase023Config = JSON.parse(
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
const clone = (value) => JSON.parse(JSON.stringify(value));
const allTrue = (value) => Object.values(value).every(Boolean);
const exactKeys = (value, expected) => {
  const keys = Object.keys(value ?? {});
  return (
    keys.length === expected.length &&
    keys.every((key) => expected.includes(key))
  );
};
const validDate = (value) => Number.isFinite(new Date(value).getTime());
const safeIdentifier = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:@/-]{3,120}$/.test(value);
const falseRecord = (fields) =>
  Object.fromEntries(fields.map((field) => [field, false]));
const trueRecord = (fields) =>
  Object.fromEntries(fields.map((field) => [field, true]));

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

export function validateFinalDecision(
  decision,
  sanitizedDossierHash,
  now = new Date(),
) {
  const environment = decision?.target_environment ?? {};
  const checks = decision?.checks ?? {};
  const authorizations = decision?.authorizations ?? {};
  const issuedAt = new Date(decision?.issued_at ?? "");
  const expiresAt = new Date(decision?.expires_at ?? "");
  const ttl = config.input_contract.decision_ttl_minutes * 60 * 1000;
  const gates = {
    decision_schema_and_status_match:
      decision?.schema_version ===
        config.input_contract.required_decision_schema_version &&
      decision?.status === config.input_contract.required_decision_status,
    decision_root_shape_is_exact: exactKeys(
      decision,
      config.decision_contract.required_root_fields,
    ),
    decision_scope_matches:
      decision?.scope === config.input_contract.required_decision_scope,
    decision_is_one_shot_and_unused:
      decision?.one_shot === true && decision?.consumed === false,
    decision_window_is_valid:
      validDate(decision?.issued_at) &&
      validDate(decision?.expires_at) &&
      expiresAt.getTime() > issuedAt.getTime() &&
      expiresAt.getTime() - issuedAt.getTime() <= ttl &&
      now.getTime() >= issuedAt.getTime() &&
      now.getTime() <= expiresAt.getTime(),
    decision_maker_is_present: safeIdentifier(decision?.decided_by),
    decision_change_ticket_is_present: safeIdentifier(
      decision?.change_ticket,
    ),
    decision_dossier_hash_matches:
      isSha256(sanitizedDossierHash) &&
      decision?.sanitized_dossier_sha256 === sanitizedDossierHash,
    decision_environment_shape_is_exact: exactKeys(
      environment,
      config.decision_contract.required_environment_fields,
    ),
    decision_targets_hostinger_supabase_homologation:
      environment.hosting_provider === "hostinger" &&
      environment.database_provider === "supabase" &&
      environment.target === "homologation",
    decision_postgres_version_is_supported:
      config.decision_contract.allowed_postgres_majors.includes(
        environment.postgres_major,
      ) &&
      environment.pg14_not_used === true,
    decision_environment_checks_are_complete:
      environment.deprecated_extensions_reviewed === true &&
      environment.breaking_changes_reviewed === true &&
      environment.backup_plan_documented === true &&
      environment.restore_rehearsal_documented === true &&
      environment.maintenance_window_documented === true &&
      environment.rollback_owner_present === true &&
      environment.data_api_grants_and_rls_reviewed === true &&
      environment.view_and_function_boundaries_reviewed === true &&
      environment.service_secret_boundary_reviewed === true,
    decision_checks_shape_is_exact: exactKeys(
      checks,
      config.decision_contract.required_check_fields,
    ),
    decision_checks_are_all_approved:
      Object.values(checks).every((value) => value === true),
    decision_is_limited_to_plan_preparation:
      decision?.decision === config.decision_contract.required_decision,
    decision_authorization_shape_is_exact: exactKeys(
      authorizations,
      config.decision_contract.required_authorization_fields,
    ),
    decision_authorizes_only_status_and_plan:
      authorizations.homologation_status_recording === true &&
      authorizations.controlled_change_plan_preparation === true &&
      Object.entries(authorizations)
        .filter(
          ([field]) =>
            ![
              "homologation_status_recording",
              "controlled_change_plan_preparation",
            ].includes(field),
        )
        .every(([, value]) => value === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function buildFinalDecisionRecord({
  review,
  dossier,
  decision,
  receiptHash,
  reviewHash,
  dossierHash,
  decisionHash,
}) {
  return {
    schema_version: config.record_contract.schema_version,
    status: config.record_contract.ready_status,
    source: {
      execution_receipt_sha256: receiptHash,
      human_review_sha256: reviewHash,
      sanitized_dossier_sha256: dossierHash,
      final_decision_sha256: decisionHash,
    },
    target_environment: clone(decision.target_environment),
    evidence: {
      pgtap_total: dossier.verification.pgtap_total,
      pgtap_passed: dossier.verification.pgtap_passed,
      lint_errors: dossier.verification.lint_errors,
      rollback_verified:
        dossier.rollback.schema_restored &&
        dossier.rollback.migration_history_restored,
      cleanup_verified:
        dossier.cleanup.residual_resources === 0 &&
        dossier.cleanup.global_cleanup_used === false,
      security_coverage_verified: Object.values(
        dossier.security_coverage,
      ).every(Boolean),
      reviewer: review.reviewed_by,
      change_ticket: decision.change_ticket,
    },
    security: {
      data_api_grants_and_rls_verified:
        dossier.security_coverage.data_api_grants_and_rls_verified,
      security_invoker_verified:
        dossier.security_coverage.security_invoker_verified,
      public_function_execute_denied:
        dossier.security_coverage.public_function_execute_denied,
      service_secret_absent_from_client:
        dossier.security_coverage.service_secret_absent_from_client,
      postgres_version_supported:
        config.decision_contract.allowed_postgres_majors.includes(
          decision.target_environment.postgres_major,
        ),
      deprecated_extensions_reviewed:
        decision.target_environment.deprecated_extensions_reviewed,
    },
    decision: {
      homologation_evidence_accepted: true,
      controlled_change_plan_required: true,
      human_execution_authorization_required: true,
      remote_apply_authorized: false,
      linked_project_authorized: false,
      production_authorized: false,
      build_authorized: false,
      zip_authorized: false,
      deploy_authorized: false,
      next_action: "prepare_separate_controlled_change_plan",
    },
    privacy: falseRecord(config.record_contract.required_privacy_fields),
    authorizations: falseRecord(
      config.record_contract.required_authorization_fields,
    ),
  };
}

export function validateFinalDecisionRecord(
  record,
  {
    receiptHash,
    reviewHash,
    dossierHash,
    decisionHash,
    decision,
  } = {},
) {
  const source = record?.source ?? {};
  const environment = record?.target_environment ?? {};
  const evidence = record?.evidence ?? {};
  const security = record?.security ?? {};
  const finalDecision = record?.decision ?? {};
  const privacy = record?.privacy ?? {};
  const authorizations = record?.authorizations ?? {};
  const gates = {
    record_schema_and_status_match:
      record?.schema_version === config.record_contract.schema_version &&
      record?.status === config.record_contract.ready_status,
    record_root_shape_is_exact: exactKeys(
      record,
      config.record_contract.required_root_fields,
    ),
    record_source_shape_is_exact: exactKeys(
      source,
      config.record_contract.required_source_fields,
    ),
    record_source_hashes_match:
      source.execution_receipt_sha256 === receiptHash &&
      source.human_review_sha256 === reviewHash &&
      source.sanitized_dossier_sha256 === dossierHash &&
      source.final_decision_sha256 === decisionHash &&
      Object.values(source).every(isSha256),
    record_environment_matches_decision:
      exactKeys(
        environment,
        config.decision_contract.required_environment_fields,
      ) &&
      JSON.stringify(environment) ===
        JSON.stringify(decision?.target_environment ?? null),
    record_evidence_shape_is_exact: exactKeys(
      evidence,
      config.record_contract.required_evidence_fields,
    ),
    record_evidence_is_complete:
      evidence.pgtap_total === 18 &&
      evidence.pgtap_passed === 18 &&
      evidence.lint_errors === 0 &&
      evidence.rollback_verified === true &&
      evidence.cleanup_verified === true &&
      evidence.security_coverage_verified === true &&
      safeIdentifier(evidence.reviewer) &&
      safeIdentifier(evidence.change_ticket),
    record_security_shape_is_exact: exactKeys(
      security,
      config.record_contract.required_security_fields,
    ),
    record_security_is_complete:
      Object.values(security).every((value) => value === true),
    record_decision_shape_is_exact: exactKeys(
      finalDecision,
      config.record_contract.required_decision_fields,
    ),
    record_requires_separate_controlled_change:
      finalDecision.homologation_evidence_accepted === true &&
      finalDecision.controlled_change_plan_required === true &&
      finalDecision.human_execution_authorization_required === true &&
      finalDecision.next_action ===
        "prepare_separate_controlled_change_plan",
    record_authorizes_no_apply_build_zip_or_deploy:
      finalDecision.remote_apply_authorized === false &&
      finalDecision.linked_project_authorized === false &&
      finalDecision.production_authorized === false &&
      finalDecision.build_authorized === false &&
      finalDecision.zip_authorized === false &&
      finalDecision.deploy_authorized === false,
    record_privacy_shape_is_exact: exactKeys(
      privacy,
      config.record_contract.required_privacy_fields,
    ),
    record_contains_no_sensitive_or_raw_evidence:
      Object.values(privacy).every((value) => value === false),
    record_authorization_shape_is_exact: exactKeys(
      authorizations,
      config.record_contract.required_authorization_fields,
    ),
    record_authorizes_no_operational_action:
      Object.values(authorizations).every((value) => value === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function assessFinalHumanHomologationDecision({
  executionReceiptPath = config.input_contract.execution_receipt_path,
  humanReviewPath = config.input_contract.human_review_path,
  sanitizedDossierPath = config.input_contract.sanitized_dossier_path,
  finalDecisionPath = config.input_contract.final_decision_path,
  now = new Date(),
  phase022Assessment,
  phase023Assessment,
} = {}) {
  const phase022 =
    phase022Assessment ?? assessLocalDisposableMigrationRehearsal();
  const phase023 =
    phase023Assessment ?? assessSanitizedHomologationEvidence();
  const phase022Available =
    phase022?.schema_version === "atlas.10x.phase-022.v1";
  const phase023Available =
    phase023?.schema_version === "atlas.10x.phase-023.v1";

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
  const dossierArtifact = readArtifact(sanitizedDossierPath);
  const dossierValidation =
    dossierArtifact.parses &&
    receiptValidation.accepted &&
    reviewValidation.accepted
      ? validateSanitizedDossier(
          dossierArtifact.value,
          receiptArtifact.value,
          reviewArtifact.value,
          receiptArtifact.hash,
          reviewArtifact.hash,
        )
      : { accepted: false, gates: {} };
  const decisionArtifact = readArtifact(finalDecisionPath);
  const decisionValidation =
    decisionArtifact.parses && dossierValidation.accepted
      ? validateFinalDecision(
          decisionArtifact.value,
          dossierArtifact.hash,
          now,
        )
      : { accepted: false, gates: {} };
  const readyForRecord =
    receiptValidation.accepted &&
    reviewValidation.accepted &&
    dossierValidation.accepted &&
    decisionValidation.accepted;
  const record = readyForRecord
    ? buildFinalDecisionRecord({
        receipt: receiptArtifact.value,
        review: reviewArtifact.value,
        dossier: dossierArtifact.value,
        decision: decisionArtifact.value,
        receiptHash: receiptArtifact.hash,
        reviewHash: reviewArtifact.hash,
        dossierHash: dossierArtifact.hash,
        decisionHash: decisionArtifact.hash,
      })
    : null;
  const recordValidation = record
    ? validateFinalDecisionRecord(record, {
        receiptHash: receiptArtifact.hash,
        reviewHash: reviewArtifact.hash,
        dossierHash: dossierArtifact.hash,
        decisionHash: decisionArtifact.hash,
        decision: decisionArtifact.value,
      })
    : { accepted: false, gates: {} };

  const baseGates = {
    phase_022_assessment_is_available: phase022Available,
    phase_023_assessment_is_available: phase023Available,
    execution_receipt_exists: receiptArtifact.exists,
    execution_receipt_parses: receiptArtifact.parses,
    execution_receipt_is_valid: receiptValidation.accepted,
    human_review_exists: reviewArtifact.exists,
    human_review_parses: reviewArtifact.parses,
    human_review_is_valid: reviewValidation.accepted,
    sanitized_dossier_exists: dossierArtifact.exists,
    sanitized_dossier_parses: dossierArtifact.parses,
    sanitized_dossier_is_valid: dossierValidation.accepted,
    sanitized_dossier_hash_chain_matches:
      dossierValidation.accepted &&
      dossierArtifact.value?.source?.execution_receipt_sha256 ===
        receiptArtifact.hash &&
      dossierArtifact.value?.source?.human_review_sha256 ===
        reviewArtifact.hash,
    final_decision_exists: decisionArtifact.exists,
    final_decision_parses: decisionArtifact.parses,
    ...decisionValidation.gates,
    final_record_is_generated_in_memory: record !== null,
    ...recordValidation.gates,
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
    deploy_not_executed: true,
    hostinger_not_mutated: true,
    meta_not_mutated: true,
    whatsapp_not_sent: true,
  };
  const gates = Object.fromEntries(
    config.required_gates.map((gate) => [gate, Boolean(baseGates[gate])]),
  );
  const blockers = config.required_gates.filter((gate) => !gates[gate]);
  const passed = config.required_gates.length - blockers.length;
  const ready = blockers.length === 0;

  return {
    schema_version: config.schema_version,
    phase: "24/24",
    status: ready ? record.status : config.status,
    final_decision_gates: {
      passed,
      total: config.required_gates.length,
      percentage: Math.round((passed / config.required_gates.length) * 100),
      blockers,
    },
    inputs: {
      phase_022_assessment_available: phase022Available,
      phase_023_assessment_available: phase023Available,
      execution_receipt_exists: receiptArtifact.exists,
      execution_receipt_parses: receiptArtifact.parses,
      execution_receipt_sha256: receiptArtifact.hash || null,
      human_review_exists: reviewArtifact.exists,
      human_review_parses: reviewArtifact.parses,
      human_review_sha256: reviewArtifact.hash || null,
      sanitized_dossier_exists: dossierArtifact.exists,
      sanitized_dossier_parses: dossierArtifact.parses,
      sanitized_dossier_sha256: dossierArtifact.hash || null,
      final_decision_exists: decisionArtifact.exists,
      final_decision_parses: decisionArtifact.parses,
      final_decision_sha256: decisionArtifact.hash || null,
    },
    final_record: ready
      ? record
      : {
          generated_in_memory: false,
          persisted: false,
          operational_authority_granted: false,
        },
    safety: {
      evaluator_executed_command: false,
      evaluator_wrote_file: false,
      local_database_started: false,
      docker_accessed: false,
      migration_applied: false,
      remote_read_executed: false,
      remote_write_executed: false,
      linked_project_accessed: false,
      production_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
      deploy_executed: false,
      hostinger_mutated: false,
      meta_mutated: false,
      whatsapp_sent: false,
    },
    conclusion: {
      governance_foundation_cycle_complete: true,
      eligible_for_separate_controlled_change_plan: ready,
      human_execution_authorization_still_required: true,
      remote_apply_authorized: false,
      production_authorized: false,
      build_authorized: false,
      zip_authorized: false,
      deploy_authorized: false,
      next_cycle: config.next_cycle,
    },
  };
}

function syntheticExecutionReceipt() {
  const catalogHash = sha256(
    JSON.stringify(phase023Config.security_test_catalog),
  );
  return {
    schema_version: "atlas.local_rehearsal_execution_receipt.v1",
    status: "single_disposable_local_rehearsal_completed",
    source: {
      phase_022_schema_version: "atlas.10x.phase-022.v1",
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
      cli_version: "2.109.1",
      project_id: "atlas-phase-022-rehearsal",
      workdir: ".atlas/runtime/phase-022/rehearsal",
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
      file: "supabase/tests/atlas_security_remediation_test.sql",
      total: 18,
      passed: 18,
      failed: 0,
      skipped: 0,
      catalog_sha256: catalogHash,
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
      project_id: "atlas-phase-022-rehearsal",
      used_all_flag: false,
      used_no_backup: true,
      volumes_removed: true,
      workdir_removed: true,
      residual_containers: 0,
      residual_volumes: 0,
    },
    privacy: falseRecord(
      phase023Config.receipt_contract.required_privacy_fields,
    ),
    authorizations: falseRecord(
      phase023Config.receipt_contract.required_authorization_fields,
    ),
  };
}

function syntheticHumanReview(receiptHash) {
  const authorizations = falseRecord(
    phase023Config.review_contract.required_authorization_fields,
  );
  authorizations.dossier_generation = true;
  authorizations.homologation_decision_preparation = true;
  return {
    schema_version: "atlas.homologation_evidence_review.v1",
    status: "approved_for_homologation_dossier_generation",
    scope: "phase_022_sanitized_execution_receipt_only",
    one_shot: true,
    consumed: false,
    issued_at: "2026-07-23T12:15:00.000Z",
    expires_at: "2026-07-23T12:45:00.000Z",
    reviewed_by: "security-reviewer",
    change_ticket: "ATLAS-023",
    execution_receipt_sha256: receiptHash,
    checks: trueRecord(phase023Config.review_contract.required_check_fields),
    decision: "prepare_human_homologation_decision_only",
    authorizations,
  };
}

function syntheticFinalDecision(dossierHash) {
  const authorizations = falseRecord(
    config.decision_contract.required_authorization_fields,
  );
  authorizations.homologation_status_recording = true;
  authorizations.controlled_change_plan_preparation = true;
  return {
    schema_version: config.input_contract.required_decision_schema_version,
    status: config.input_contract.required_decision_status,
    scope: config.input_contract.required_decision_scope,
    one_shot: true,
    consumed: false,
    issued_at: "2026-07-23T12:20:00.000Z",
    expires_at: "2026-07-23T12:50:00.000Z",
    decided_by: "homologation-owner",
    change_ticket: "ATLAS-024",
    sanitized_dossier_sha256: dossierHash,
    target_environment: {
      hosting_provider: "hostinger",
      database_provider: "supabase",
      target: "homologation",
      postgres_major: 17,
      pg14_not_used: true,
      deprecated_extensions_reviewed: true,
      breaking_changes_reviewed: true,
      backup_plan_documented: true,
      restore_rehearsal_documented: true,
      maintenance_window_documented: true,
      rollback_owner_present: true,
      data_api_grants_and_rls_reviewed: true,
      view_and_function_boundaries_reviewed: true,
      service_secret_boundary_reviewed: true,
    },
    checks: trueRecord(config.decision_contract.required_check_fields),
    decision: config.decision_contract.required_decision,
    authorizations,
  };
}

function mutate(value, path, replacement) {
  const copy = clone(value);
  const segments = path.split(".");
  let target = copy;
  for (const segment of segments.slice(0, -1)) target = target[segment];
  target[segments.at(-1)] = replacement;
  return copy;
}

export function selfTest() {
  const phase022 = { schema_version: "atlas.10x.phase-022.v1" };
  const receipt = syntheticExecutionReceipt();
  const receiptHash = sha256(JSON.stringify(receipt));
  const review = syntheticHumanReview(receiptHash);
  const reviewHash = sha256(JSON.stringify(review));
  const dossier = buildSanitizedDossier(
    receipt,
    review,
    receiptHash,
    reviewHash,
  );
  const dossierHash = sha256(JSON.stringify(dossier));
  const decision = syntheticFinalDecision(dossierHash);
  const decisionHash = sha256(JSON.stringify(decision));
  const now = new Date("2026-07-23T12:30:00.000Z");
  const receiptValidation = validateExecutionReceipt(receipt, { phase022 });
  const reviewValidation = validateHumanReview(review, receiptHash, now);
  const dossierValidation = validateSanitizedDossier(
    dossier,
    receipt,
    review,
    receiptHash,
    reviewHash,
  );
  const decisionValidation = validateFinalDecision(
    decision,
    dossierHash,
    now,
  );
  const record = buildFinalDecisionRecord({
    receipt,
    review,
    dossier,
    decision,
    receiptHash,
    reviewHash,
    dossierHash,
    decisionHash,
  });
  const recordValidation = validateFinalDecisionRecord(record, {
    receiptHash,
    reviewHash,
    dossierHash,
    decisionHash,
    decision,
  });

  const decisionPaths = [
    ["schema_version", "wrong"],
    ["status", "wrong"],
    ["scope", "wrong"],
    ["one_shot", false],
    ["consumed", true],
    ["expires_at", "2026-07-23T13:30:00.000Z"],
    ["decided_by", ""],
    ["change_ticket", ""],
    ["sanitized_dossier_sha256", "c".repeat(64)],
    ["target_environment.hosting_provider", "other"],
    ["target_environment.database_provider", "other"],
    ["target_environment.target", "production"],
    ["target_environment.postgres_major", 14],
    ["target_environment.pg14_not_used", false],
    ...config.decision_contract.required_environment_fields
      .filter((field) => field.endsWith("_reviewed"))
      .map((field) => [`target_environment.${field}`, false]),
    ["target_environment.backup_plan_documented", false],
    ["target_environment.restore_rehearsal_documented", false],
    ["target_environment.maintenance_window_documented", false],
    ["target_environment.rollback_owner_present", false],
    ...config.decision_contract.required_check_fields.map((field) => [
      `checks.${field}`,
      false,
    ]),
    ["decision", "apply_remote"],
    ["authorizations.homologation_status_recording", false],
    ["authorizations.controlled_change_plan_preparation", false],
    ...config.decision_contract.required_authorization_fields
      .filter(
        (field) =>
          ![
            "homologation_status_recording",
            "controlled_change_plan_preparation",
          ].includes(field),
      )
      .map((field) => [`authorizations.${field}`, true]),
  ];
  const decisionMutants = decisionPaths.map(([path, replacement]) => ({
    path,
    value: mutate(decision, path, replacement),
  }));
  const decisionExtra = clone(decision);
  decisionExtra.unexpected = true;
  decisionMutants.push({ path: "unexpected", value: decisionExtra });

  const recordPaths = [
    ["schema_version", "wrong"],
    ["status", "wrong"],
    ["source.execution_receipt_sha256", "c".repeat(64)],
    ["source.human_review_sha256", "c".repeat(64)],
    ["source.sanitized_dossier_sha256", "c".repeat(64)],
    ["source.final_decision_sha256", "c".repeat(64)],
    ["target_environment.target", "production"],
    ["evidence.pgtap_total", 17],
    ["evidence.pgtap_passed", 17],
    ["evidence.lint_errors", 1],
    ["evidence.rollback_verified", false],
    ["evidence.cleanup_verified", false],
    ["evidence.security_coverage_verified", false],
    ["evidence.reviewer", ""],
    ["evidence.change_ticket", ""],
    ...config.record_contract.required_security_fields.map((field) => [
      `security.${field}`,
      false,
    ]),
    ["decision.homologation_evidence_accepted", false],
    ["decision.controlled_change_plan_required", false],
    ["decision.human_execution_authorization_required", false],
    ["decision.remote_apply_authorized", true],
    ["decision.linked_project_authorized", true],
    ["decision.production_authorized", true],
    ["decision.build_authorized", true],
    ["decision.zip_authorized", true],
    ["decision.deploy_authorized", true],
    ["decision.next_action", "deploy"],
    ["privacy.contains_credentials", true],
    ["privacy.contains_raw_sql", true],
    ["privacy.contains_raw_cli_output", true],
    ...config.record_contract.required_authorization_fields.map((field) => [
      `authorizations.${field}`,
      true,
    ]),
  ];
  const recordMutants = recordPaths.map(([path, replacement]) => ({
    path,
    value: mutate(record, path, replacement),
  }));
  const recordExtra = clone(record);
  recordExtra.unexpected = true;
  recordMutants.push({ path: "unexpected", value: recordExtra });

  const dossierMutants = [
    mutate(dossier, "source.execution_receipt_sha256", "c".repeat(64)),
    mutate(dossier, "source.human_review_sha256", "c".repeat(64)),
    mutate(dossier, "decision.production_authorized", true),
    mutate(dossier, "privacy.contains_credentials", true),
  ];
  const decisionRejected = decisionMutants.filter(({ path, value }) => {
    const mutantNow =
      path === "expires_at"
        ? new Date("2026-07-23T13:00:00.000Z")
        : now;
    return !validateFinalDecision(value, dossierHash, mutantNow).accepted;
  }).length;
  const recordRejected = recordMutants.filter(
    ({ value }) =>
      !validateFinalDecisionRecord(value, {
        receiptHash,
        reviewHash,
        dossierHash,
        decisionHash,
        decision,
      }).accepted,
  ).length;
  const dossierRejected = dossierMutants.filter(
    (value) =>
      !validateSanitizedDossier(
        value,
        receipt,
        review,
        receiptHash,
        reviewHash,
      ).accepted,
  ).length;
  const total =
    decisionMutants.length + recordMutants.length + dossierMutants.length;
  const rejected = decisionRejected + recordRejected + dossierRejected;

  return {
    passed:
      receiptValidation.accepted &&
      reviewValidation.accepted &&
      dossierValidation.accepted &&
      decisionValidation.accepted &&
      recordValidation.accepted &&
      rejected === total,
    valid_fixture: {
      receipt: receiptValidation.accepted,
      review: reviewValidation.accepted,
      dossier: dossierValidation.accepted,
      decision: decisionValidation.accepted,
      final_record: recordValidation.accepted,
    },
    mutants: {
      rejected,
      total,
      decision_rejected: decisionRejected,
      record_rejected: recordRejected,
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
      deploy_executed: false,
    },
  };
}

const invokedDirectly =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const output = process.argv.includes("--self-test")
    ? selfTest()
    : assessFinalHumanHomologationDecision();
  console.log(JSON.stringify(output, null, 2));
  if (process.argv.includes("--self-test") && !output.passed) {
    process.exitCode = 1;
  }
}

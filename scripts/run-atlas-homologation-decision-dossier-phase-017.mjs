import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(root, "config/atlas-10x-phase-017-homologation-decision-dossier.json"),
    "utf8",
  ),
);

const isSha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const isOpaqueId = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]{8,80}$/.test(value) &&
  !value.includes("@");
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const allTrue = (object) => Object.values(object).every(Boolean);

function safeWorkspacePath(candidate, allowedRoot) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  if (isAbsolute(candidate) || candidate.includes("\0")) return false;
  const absolute = resolve(root, candidate);
  const allowed = resolve(root, allowedRoot);
  const offset = relative(allowed, absolute);
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

function readArtifact(path) {
  if (!safeWorkspacePath(path, ".")) {
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
    return { exists: true, parses: false, value: null, source, hash: sha256(source) };
  }
}

export function validateLocalRehearsal(result) {
  const run = result?.rehearsal ?? {};
  const privacy = result?.privacy ?? {};
  const safety = result?.safety ?? {};
  const gates = {
    phase_016_result_schema_matches:
      result?.schema_version ===
      config.input_contract.required_local_result_schema_version,
    phase_016_result_status_is_approved:
      result?.status === config.input_contract.required_local_result_status,
    phase_016_scope_is_local_pg17:
      result?.scope === config.local_rehearsal_contract.scope &&
      result?.postgres_major === config.local_rehearsal_contract.postgres_major,
    phase_016_cli_version_matches:
      result?.cli_version === config.local_rehearsal_contract.cli_version,
    phase_016_permit_was_consumed: result?.permit?.consumed === true,
    phase_016_first_reset_passed: run.first_reset === "passed",
    phase_016_first_dynamic_test_passed:
      run.first_dynamic_test === "passed",
    phase_016_migration_history_passed:
      run.migration_history === "passed",
    phase_016_lint_passed: run.lint === "passed",
    phase_016_security_advisor_passed:
      run.security_advisor === "passed",
    phase_016_performance_advisor_passed:
      run.performance_advisor === "passed",
    phase_016_catalog_delta_exact:
      run.catalog_delta === "exact_allowlist_match",
    phase_016_second_reset_passed: run.second_reset === "passed",
    phase_016_second_dynamic_test_passed:
      run.second_dynamic_test === "passed",
    phase_016_idempotency_proved: run.idempotency === "proved",
    phase_016_human_review_passed:
      result?.human_review?.status === "approved" &&
      isOpaqueId(result?.human_review?.reviewed_by),
    phase_016_evidence_is_sanitized:
      privacy.contains_secrets === false &&
      privacy.contains_personal_data === false &&
      privacy.contains_database_url === false &&
      privacy.contains_fixture_identifiers === false &&
      privacy.raw_cli_output_persisted === false,
    phase_016_remote_was_not_touched:
      safety.remote_read_executed === false &&
      safety.remote_write_executed === false &&
      safety.live_homologation_touched === false &&
      safety.production_touched === false,
  };
  return { accepted: allTrue(gates), gates };
}

export function validateRecovery(evidence) {
  const controls = evidence?.controls ?? {};
  const gates = {
    recovery_schema_matches:
      evidence?.schema_version ===
      config.input_contract.required_recovery_schema_version,
    recovery_status_is_approved:
      evidence?.status === config.input_contract.required_recovery_status,
    recovery_is_isolated:
      evidence?.environment === "isolated_recovery" &&
      evidence?.production_touched === false,
    database_restore_passed: controls.database_restore === "passed",
    storage_restore_passed: controls.storage_restore === "passed",
    previous_v3_artifact_is_immutable:
      controls.previous_v3_artifact === "immutable" &&
      isSha256(evidence?.previous_v3_artifact_sha256),
    authenticated_smoke_passed:
      controls.authenticated_smoke === "passed",
    recovery_metrics_are_present:
      Number.isFinite(evidence?.metrics?.rto_minutes) &&
      evidence.metrics.rto_minutes >= 0 &&
      Number.isFinite(evidence?.metrics?.rpo_minutes) &&
      evidence.metrics.rpo_minutes >= 0,
    director_approval_is_present:
      evidence?.director_approval?.status === "approved" &&
      isOpaqueId(evidence?.director_approval?.approved_by),
    legacy_v2_is_not_rollback: evidence?.rollback_target === "previous_v3_release",
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
    target_descriptor_shape_is_exact:
      Object.keys(target ?? {}).length ===
        config.target_contract.allowed_descriptor_fields.length &&
      Object.keys(target ?? {}).every((field) =>
        config.target_contract.allowed_descriptor_fields.includes(field),
      ),
    target_branch_health_is_preflight_pending:
      target?.branch_health === "preflight_pending",
    target_contains_no_credentials: forbiddenFields.every(
      (field) => !(field in (target ?? {})),
    ),
  };
  return { accepted: allTrue(gates), gates };
}

export function validateDecision(decision, context, now = new Date()) {
  const issuedAt = new Date(decision?.issued_at ?? "");
  const expiresAt = new Date(decision?.expires_at ?? "");
  const validityHours =
    (expiresAt.getTime() - issuedAt.getTime()) / (60 * 60 * 1000);
  const risks = Array.isArray(decision?.risk_register)
    ? decision.risk_register
    : [];
  const expectedHashes = context.hashes ?? {};
  const gates = {
    decision_schema_matches:
      decision?.schema_version ===
      config.input_contract.required_decision_schema_version,
    decision_status_is_preflight_only:
      decision?.status ===
      config.input_contract.required_decision_status,
    decision_is_one_shot_and_current:
      decision?.one_shot === true &&
      decision?.consumed === false &&
      Number.isFinite(issuedAt.getTime()) &&
      Number.isFinite(expiresAt.getTime()) &&
      issuedAt <= now &&
      expiresAt > now &&
      validityHours > 0 &&
      validityHours <= config.decision_contract.maximum_validity_hours,
    decision_reviewer_is_opaque_and_independent:
      isOpaqueId(decision?.reviewed_by) &&
      decision.reviewed_by !== context.localReviewer &&
      decision.reviewed_by !== context.directorApprover,
    decision_change_ticket_is_present: isOpaqueId(decision?.change_ticket),
    decision_hash_bindings_match:
      isSha256(decision?.local_result_sha256) &&
      isSha256(decision?.recovery_evidence_sha256) &&
      isSha256(decision?.target_descriptor_sha256) &&
      isSha256(decision?.manifest_sha256) &&
      isSha256(decision?.migration_sha256) &&
      isSha256(decision?.dynamic_test_sha256) &&
      decision.local_result_sha256 === expectedHashes.localResult &&
      decision.recovery_evidence_sha256 === expectedHashes.recovery &&
      decision.target_descriptor_sha256 === expectedHashes.target &&
      decision.manifest_sha256 === expectedHashes.manifest &&
      decision.migration_sha256 === context.migrationSha256 &&
      decision.dynamic_test_sha256 === context.dynamicTestSha256,
    decision_risk_register_is_complete:
      risks.length > 0 &&
      risks.every(
        (risk) =>
          isOpaqueId(risk?.id) &&
          ["low", "medium", "high", "critical"].includes(risk?.severity) &&
          isOpaqueId(risk?.owner) &&
          ["accepted", "mitigated", "blocked"].includes(risk?.disposition) &&
          isSha256(risk?.evidence_sha256),
      ) &&
      !risks.some(
        (risk) =>
          ["high", "critical"].includes(risk.severity) &&
          risk.disposition === "accepted",
      ),
    decision_does_not_authorize_apply:
      decision?.authorizations?.homologation_preflight === true &&
      decision?.authorizations?.remote_apply === false &&
      decision?.authorizations?.production === false &&
      decision?.authorizations?.real_data_copy === false,
  };
  return { accepted: allTrue(gates), gates };
}

export function assessHomologationDossier({
  now = new Date(),
  paths = config.input_contract,
} = {}) {
  const localResult = readArtifact(paths.phase_016_execution_result_path);
  const manifest = readArtifact(paths.phase_015_manifest_path);
  const recovery = readArtifact(paths.phase_002_recovery_evidence_path);
  const target = readArtifact(paths.target_descriptor_path);
  const decision = readArtifact(paths.decision_approval_path);

  const localValidation = localResult.parses
    ? validateLocalRehearsal(localResult.value)
    : { accepted: false, gates: {} };
  const recoveryValidation = recovery.parses
    ? validateRecovery(recovery.value)
    : { accepted: false, gates: {} };
  const targetValidation = target.parses
    ? validateTarget(target.value)
    : { accepted: false, gates: {} };

  const localManifestHash = localResult.value?.artifacts?.manifest_sha256;
  const manifestHashMatches =
    manifest.exists &&
    manifest.parses &&
    isSha256(localManifestHash) &&
    manifest.hash === localManifestHash;

  const decisionValidation = decision.parses
    ? validateDecision(
        decision.value,
        {
          hashes: {
            localResult: localResult.hash,
            recovery: recovery.hash,
            target: target.hash,
            manifest: manifest.hash,
          },
          migrationSha256:
            localResult.value?.artifacts?.migration_sha256,
          dynamicTestSha256:
            localResult.value?.artifacts?.dynamic_test_sha256,
          localReviewer: localResult.value?.human_review?.reviewed_by,
          directorApprover:
            recovery.value?.director_approval?.approved_by,
        },
        now,
      )
    : { accepted: false, gates: {} };

  const baseGates = {
    phase_016_execution_result_exists: localResult.exists,
    phase_016_execution_result_parses: localResult.parses,
    ...localValidation.gates,
    phase_015_manifest_exists: manifest.exists,
    phase_015_manifest_parses: manifest.parses,
    phase_015_manifest_hash_matches_local_result: manifestHashMatches,
    recovery_evidence_exists: recovery.exists,
    recovery_evidence_parses: recovery.parses,
    ...recoveryValidation.gates,
    target_descriptor_exists: target.exists,
    target_descriptor_parses: target.parses,
    ...targetValidation.gates,
    decision_approval_exists: decision.exists,
    decision_approval_parses: decision.parses,
    ...decisionValidation.gates,
    dossier_contains_no_apply_command:
      config.dossier_contract.contains_apply_command === false &&
      config.dossier_contract.contains_db_push_command === false &&
      config.dossier_contract.contains_migration_repair_command === false,
    remote_read_not_executed: true,
    remote_write_not_executed: true,
    live_homologation_not_touched: true,
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

  const dossier = ready
    ? {
        schema_version: "atlas.homologation_decision_dossier.v1",
        decision: "approved_for_manual_homologation_preflight_only",
        hashes: {
          local_result_sha256: localResult.hash,
          recovery_evidence_sha256: recovery.hash,
          target_descriptor_sha256: target.hash,
          manifest_sha256: manifest.hash,
          migration_sha256: localResult.value.artifacts.migration_sha256,
          dynamic_test_sha256:
            localResult.value.artifacts.dynamic_test_sha256,
        },
        target: {
          target_type: target.value.target_type,
          environment: target.value.environment,
          data_policy: target.value.data_policy,
          project_ref_sha256: target.value.project_ref_sha256,
          target_fingerprint_sha256:
            target.value.target_fingerprint_sha256,
        },
        authorizations: {
          homologation_preflight: true,
          remote_apply: false,
          production: false,
          real_data_copy: false,
        },
      }
    : null;

  return {
    schema_version: config.schema_version,
    phase: "17/24",
    status: ready
      ? "homologation_preflight_dossier_ready"
      : config.status,
    specification: {
      passed,
      total: config.required_gates.length,
      percentage: Math.round((passed / config.required_gates.length) * 100),
      blockers,
    },
    inputs: {
      local_rehearsal_result: localResult.exists,
      manifest: manifest.exists,
      recovery_drill: recovery.exists,
      target_descriptor: target.exists,
      decision_approval: decision.exists,
    },
    dossier: {
      generated_in_memory: dossier !== null,
      content: dossier,
      contains_secrets: false,
      contains_personal_data: false,
      contains_apply_command: false,
    },
    safety: {
      preflight_only: true,
      remote_read_executed: false,
      remote_write_executed: false,
      branch_created: false,
      branch_merged: false,
      migration_applied: false,
      live_homologation_touched: false,
      production_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    gates,
    conclusion: {
      ready_for_manual_homologation_preflight: ready,
      remote_apply_authorized: false,
      production_authorized: false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticFixture(now = new Date("2026-07-23T12:00:00.000Z")) {
  const manifestSource = JSON.stringify({
    schema_version: "atlas.isolated_migration_package.v1",
    batch: ["FINDING_A"],
  });
  const localResult = {
    schema_version: "atlas.local_migration_rehearsal_result.v1",
    status: "approved_local_rehearsal",
    scope: "isolated_loopback_pg17_only",
    postgres_major: 17,
    cli_version: "2.109.1",
    permit: { consumed: true },
    rehearsal: {
      first_reset: "passed",
      first_dynamic_test: "passed",
      migration_history: "passed",
      lint: "passed",
      security_advisor: "passed",
      performance_advisor: "passed",
      catalog_delta: "exact_allowlist_match",
      second_reset: "passed",
      second_dynamic_test: "passed",
      idempotency: "proved",
    },
    human_review: { status: "approved", reviewed_by: "local_reviewer_01" },
    privacy: {
      contains_secrets: false,
      contains_personal_data: false,
      contains_database_url: false,
      contains_fixture_identifiers: false,
      raw_cli_output_persisted: false,
    },
    safety: {
      remote_read_executed: false,
      remote_write_executed: false,
      live_homologation_touched: false,
      production_touched: false,
    },
    artifacts: {
      manifest_sha256: sha256(manifestSource),
      migration_sha256: "a".repeat(64),
      dynamic_test_sha256: "b".repeat(64),
    },
  };
  const recovery = {
    schema_version: "atlas.recovery_drill.v1",
    status: "approved_recovery_drill",
    environment: "isolated_recovery",
    production_touched: false,
    controls: {
      database_restore: "passed",
      storage_restore: "passed",
      previous_v3_artifact: "immutable",
      authenticated_smoke: "passed",
    },
    previous_v3_artifact_sha256: "c".repeat(64),
    metrics: { rto_minutes: 18, rpo_minutes: 5 },
    director_approval: { status: "approved", approved_by: "director_approver_01" },
    rollback_target: "previous_v3_release",
  };
  const target = {
    schema_version: "atlas.homologation_target.v1",
    environment: "homologation",
    target_type: "supabase_persistent_branch",
    isolated_branch: true,
    production: false,
    main_branch: false,
    data_policy: "synthetic_only",
    project_ref_sha256: "d".repeat(64),
    target_fingerprint_sha256: "e".repeat(64),
    branch_health: "preflight_pending",
  };
  const sources = {
    manifest: manifestSource,
    local: JSON.stringify(localResult),
    recovery: JSON.stringify(recovery),
    target: JSON.stringify(target),
  };
  const decision = {
    schema_version: "atlas.homologation_preflight_approval.v1",
    status: "approved_for_homologation_preflight_only",
    one_shot: true,
    consumed: false,
    issued_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    reviewed_by: "independent_reviewer_01",
    change_ticket: "change_ticket_017",
    local_result_sha256: sha256(sources.local),
    recovery_evidence_sha256: sha256(sources.recovery),
    target_descriptor_sha256: sha256(sources.target),
    manifest_sha256: sha256(sources.manifest),
    migration_sha256: localResult.artifacts.migration_sha256,
    dynamic_test_sha256: localResult.artifacts.dynamic_test_sha256,
    risk_register: [
      {
        id: "risk_phase17_01",
        severity: "medium",
        owner: "risk_owner_01",
        disposition: "mitigated",
        evidence_sha256: "f".repeat(64),
      },
    ],
    authorizations: {
      homologation_preflight: true,
      remote_apply: false,
      production: false,
      real_data_copy: false,
    },
  };
  return { now, localResult, recovery, target, decision, sources };
}

export function selfTest() {
  const fixture = syntheticFixture();
  const local = validateLocalRehearsal(fixture.localResult);
  const recovery = validateRecovery(fixture.recovery);
  const target = validateTarget(fixture.target);
  const context = {
    hashes: {
      localResult: sha256(fixture.sources.local),
      recovery: sha256(fixture.sources.recovery),
      target: sha256(fixture.sources.target),
      manifest: sha256(fixture.sources.manifest),
    },
    migrationSha256: fixture.localResult.artifacts.migration_sha256,
    dynamicTestSha256: fixture.localResult.artifacts.dynamic_test_sha256,
    localReviewer: fixture.localResult.human_review.reviewed_by,
    directorApprover: fixture.recovery.director_approval.approved_by,
  };
  const decision = validateDecision(fixture.decision, context, fixture.now);
  const mutants = [
    () => validateLocalRehearsal({ ...fixture.localResult, status: "pending" }).accepted,
    () => validateLocalRehearsal({ ...fixture.localResult, postgres_major: 15 }).accepted,
    () => validateLocalRehearsal({ ...fixture.localResult, permit: { consumed: false } }).accepted,
    () => validateLocalRehearsal({ ...fixture.localResult, rehearsal: { ...fixture.localResult.rehearsal, first_dynamic_test: "failed" } }).accepted,
    () => validateLocalRehearsal({ ...fixture.localResult, rehearsal: { ...fixture.localResult.rehearsal, catalog_delta: "extra_object" } }).accepted,
    () => validateLocalRehearsal({ ...fixture.localResult, rehearsal: { ...fixture.localResult.rehearsal, idempotency: "unknown" } }).accepted,
    () => validateLocalRehearsal({ ...fixture.localResult, privacy: { ...fixture.localResult.privacy, contains_database_url: true } }).accepted,
    () => validateLocalRehearsal({ ...fixture.localResult, safety: { ...fixture.localResult.safety, remote_read_executed: true } }).accepted,
    () => validateRecovery({ ...fixture.recovery, environment: "production" }).accepted,
    () => validateRecovery({ ...fixture.recovery, controls: { ...fixture.recovery.controls, storage_restore: "not_tested" } }).accepted,
    () => validateRecovery({ ...fixture.recovery, rollback_target: "v2_archive" }).accepted,
    () => validateTarget({ ...fixture.target, production: true }).accepted,
    () => validateTarget({ ...fixture.target, main_branch: true }).accepted,
    () => validateTarget({ ...fixture.target, data_policy: "production_clone" }).accepted,
    () => validateTarget({ ...fixture.target, project_ref: "raw-project-ref" }).accepted,
    () => validateTarget({ ...fixture.target, harmless_extra_field: true }).accepted,
    () => validateTarget({ ...fixture.target, branch_health: "healthy" }).accepted,
    () => validateDecision({ ...fixture.decision, reviewed_by: context.localReviewer }, context, fixture.now).accepted,
    () => validateDecision({ ...fixture.decision, expires_at: new Date(fixture.now.getTime() + 48 * 60 * 60 * 1000).toISOString() }, context, fixture.now).accepted,
    () => validateDecision({ ...fixture.decision, local_result_sha256: "0".repeat(64) }, context, fixture.now).accepted,
    () => validateDecision({ ...fixture.decision, migration_sha256: "not-a-hash" }, context, fixture.now).accepted,
    () => validateDecision({ ...fixture.decision, risk_register: [{ ...fixture.decision.risk_register[0], severity: "critical", disposition: "accepted" }] }, context, fixture.now).accepted,
    () => validateDecision({ ...fixture.decision, authorizations: { ...fixture.decision.authorizations, remote_apply: true } }, context, fixture.now).accepted,
  ];
  const safeBaseline =
    local.accepted && recovery.accepted && target.accepted && decision.accepted;
  const rejected = mutants.filter((mutant) => mutant() === false).length;
  return {
    safe_baseline: safeBaseline ? "accepted" : "rejected",
    mutants_rejected: rejected,
    mutants_total: mutants.length,
    remote_read_executed: false,
    remote_write_executed: false,
    migration_applied: false,
    dossier_persisted: false,
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const payload = process.argv.includes("--self-test")
    ? selfTest()
    : assessHomologationDossier();
  console.log(JSON.stringify(payload, null, 2));
  if (
    process.argv.includes("--self-test") &&
    (payload.safe_baseline !== "accepted" ||
      payload.mutants_rejected !== payload.mutants_total)
  ) {
    process.exit(1);
  }
}

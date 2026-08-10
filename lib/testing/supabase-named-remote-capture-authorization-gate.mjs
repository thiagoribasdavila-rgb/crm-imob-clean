import { createHash } from "node:crypto";
import {
  buildNamedRemoteEvidenceRequest,
  EXPECTED_PROJECT_REF_SHA256,
} from "./supabase-named-remote-evidence-contract.mjs";
import {
  buildNamedRemoteCaptureProcedure,
  NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG,
} from "./supabase-named-remote-capture-procedure.mjs";

export { NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG };

export const NAMED_REMOTE_CAPTURE_AUTHORIZATION_REQUEST_SCHEMA =
  "atlas.named_remote_capture_authorization_request.v1";
export const NAMED_REMOTE_CAPTURE_AUTHORIZATION_REVIEW_SCHEMA =
  "atlas.named_remote_capture_authorization_review.v1";
export const NAMED_REMOTE_CAPTURE_AUTHORIZATION_SCOPE =
  "single_read_only_named_migration_metadata_capture";
export const NAMED_REMOTE_CAPTURE_APPROVAL_DECISION =
  "APPROVE_SINGLE_READ_ONLY_METADATA_CAPTURE";
export const NAMED_REMOTE_CAPTURE_CONFIRMATION_PHRASE =
  "CONFIRMO UMA CAPTURA SOMENTE LEITURA SEM ALTERAR O BANCO";
export const NAMED_REMOTE_CAPTURE_MAX_APPROVAL_WINDOW_MS = 15 * 60 * 1000;

const REVIEWER_ROLES = new Set(["ADMIN", "DIRETOR", "DIRETOR_DECISOR"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REVIEW_KEYS = [
  "schemaVersion",
  "status",
  "scope",
  "operationFingerprintSha256",
  "targetIdentity",
  "reviewer",
  "authorizationSignal",
  "approval",
  "guarantees",
];
const GUARANTEE_KEYS = [
  "remoteWriteForbidden",
  "sqlBodiesForbidden",
  "rawOutputPersistenceForbidden",
  "credentialPersistenceForbidden",
  "releaseForbidden",
];
const SAFEGUARD_KEYS = [
  "remoteContacted",
  "remoteWriteExecuted",
  "migrationApplied",
  "migrationPushExecuted",
  "migrationHistoryRepaired",
  "migrationFileRenamed",
  "databaseReset",
  "authorizationConsumed",
  "reviewRecordPersisted",
  "buildExecuted",
  "zipGenerated",
  "deployExecuted",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function operationBinding({ root = process.cwd(), generatedAt = new Date() } = {}) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt });
  const procedure = buildNamedRemoteCaptureProcedure({ root, generatedAt });
  const binding = {
    targetProjectRefSha256: EXPECTED_PROJECT_REF_SHA256,
    querySha256: procedure.operation.querySha256,
    localFingerprintSetSha256: request.localFingerprintSetSha256,
    captureMode: request.requiredCaptureMode,
    resultColumns: [...procedure.operation.resultColumns],
    requiredLogicalNames: [...procedure.requiredLogicalNames],
  };
  return {
    ...binding,
    fingerprintSha256: sha256(JSON.stringify(binding)),
  };
}

function blocked(reason, request, extra = {}) {
  return {
    valid: false,
    reason,
    authorizationContractAccepted: false,
    remoteExecutionAuthorized: false,
    authorizationConsumed: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    databaseReset: false,
    buildAuthorized: false,
    zipAuthorized: false,
    deployAuthorized: false,
    request,
    ...extra,
  };
}

export function buildNamedRemoteCaptureAuthorizationRequest({
  root = process.cwd(),
  generatedAt = new Date(),
} = {}) {
  const when = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  if (!Number.isFinite(when.getTime())) throw new Error("authorization_request_timestamp_invalid");
  const operation = operationBinding({ root, generatedAt: when });
  return {
    schemaVersion: NAMED_REMOTE_CAPTURE_AUTHORIZATION_REQUEST_SCHEMA,
    phase: 185,
    status: "awaiting_explicit_human_review",
    generatedAt: when.toISOString(),
    scope: NAMED_REMOTE_CAPTURE_AUTHORIZATION_SCOPE,
    targetIdentity: {
      projectRefSha256: EXPECTED_PROJECT_REF_SHA256,
      rawProjectRefIncluded: false,
    },
    operationBinding: {
      fingerprintSha256: operation.fingerprintSha256,
      querySha256: operation.querySha256,
      localFingerprintSetSha256: operation.localFingerprintSetSha256,
      captureMode: operation.captureMode,
      resultColumns: operation.resultColumns,
      requiredLogicalNameCount: operation.requiredLogicalNames.length,
    },
    reviewRequirements: {
      decision: NAMED_REMOTE_CAPTURE_APPROVAL_DECISION,
      confirmationPhrase: NAMED_REMOTE_CAPTURE_CONFIRMATION_PHRASE,
      reviewerRoles: [...REVIEWER_ROLES],
      reviewerIdentityStoredAsSha256Only: true,
      environmentFlag: NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG,
      maximumValidityMinutes: NAMED_REMOTE_CAPTURE_MAX_APPROVAL_WINDOW_MS / 60_000,
      singleUseRequired: true,
    },
    safeguards: Object.fromEntries(SAFEGUARD_KEYS.map((key) => [key, false])),
    executionAvailableInThisPhase: false,
  };
}

export function validateNamedRemoteCaptureAuthorizationReview(
  review,
  {
    root = process.cwd(),
    now = new Date(),
    maxApprovalWindowMs = NAMED_REMOTE_CAPTURE_MAX_APPROVAL_WINDOW_MS,
  } = {},
) {
  const assessedAt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(assessedAt.getTime())) {
    return blocked("authorization_assessment_timestamp_invalid", null);
  }
  const request = buildNamedRemoteCaptureAuthorizationRequest({ root, generatedAt: assessedAt });
  if (!exactKeys(review, REVIEW_KEYS)) {
    return blocked("authorization_review_missing_or_shape_invalid", request);
  }
  if (
    review.schemaVersion !== NAMED_REMOTE_CAPTURE_AUTHORIZATION_REVIEW_SCHEMA ||
    review.status !== "explicit_human_approval_recorded"
  ) {
    return blocked("authorization_review_schema_or_status_invalid", request);
  }
  if (
    review.scope !== NAMED_REMOTE_CAPTURE_AUTHORIZATION_SCOPE ||
    review.operationFingerprintSha256 !== request.operationBinding.fingerprintSha256
  ) {
    return blocked("authorization_scope_or_operation_binding_invalid", request);
  }
  if (
    !exactKeys(review.targetIdentity, ["projectRefSha256"]) ||
    review.targetIdentity.projectRefSha256 !== EXPECTED_PROJECT_REF_SHA256
  ) {
    return blocked("authorization_target_identity_invalid", request);
  }
  if (
    !exactKeys(review.reviewer, ["identitySha256", "role"]) ||
    !SHA256_PATTERN.test(review.reviewer.identitySha256 ?? "") ||
    !REVIEWER_ROLES.has(review.reviewer.role)
  ) {
    return blocked("authorization_reviewer_invalid", request);
  }
  if (
    !exactKeys(review.authorizationSignal, ["environmentFlag", "observed"]) ||
    review.authorizationSignal.environmentFlag !== NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG ||
    review.authorizationSignal.observed !== true
  ) {
    return blocked("authorization_explicit_signal_missing", request);
  }
  const approval = review.approval;
  if (
    !exactKeys(approval, [
      "decision",
      "confirmedAt",
      "expiresAt",
      "confirmationPhrase",
      "singleUse",
      "consumed",
    ]) ||
    approval.decision !== NAMED_REMOTE_CAPTURE_APPROVAL_DECISION ||
    approval.confirmationPhrase !== NAMED_REMOTE_CAPTURE_CONFIRMATION_PHRASE ||
    approval.singleUse !== true
  ) {
    return blocked("authorization_approval_statement_invalid", request);
  }
  if (approval.consumed !== false) {
    return blocked("authorization_already_consumed_or_ambiguous", request);
  }
  const confirmedAt = new Date(approval.confirmedAt);
  const expiresAt = new Date(approval.expiresAt);
  if (!Number.isFinite(confirmedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) {
    return blocked("authorization_approval_timestamp_invalid", request);
  }
  const windowMs = expiresAt.getTime() - confirmedAt.getTime();
  if (windowMs <= 0 || windowMs > maxApprovalWindowMs) {
    return blocked("authorization_approval_window_invalid", request);
  }
  if (confirmedAt.getTime() > assessedAt.getTime() + 5 * 60 * 1000) {
    return blocked("authorization_confirmation_timestamp_in_future", request);
  }
  if (expiresAt.getTime() <= assessedAt.getTime()) {
    return blocked("authorization_approval_expired", request);
  }
  if (
    !exactKeys(review.guarantees, GUARANTEE_KEYS) ||
    GUARANTEE_KEYS.some((key) => review.guarantees[key] !== true)
  ) {
    return blocked("authorization_safety_guarantees_incomplete", request);
  }
  return {
    valid: true,
    reason: "local_human_authorization_contract_valid_execution_still_unavailable",
    authorizationContractAccepted: true,
    remoteExecutionAuthorized: false,
    authorizationConsumed: false,
    expiresAt: expiresAt.toISOString(),
    reviewerRole: review.reviewer.role,
    operationFingerprintSha256: request.operationBinding.fingerprintSha256,
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    databaseReset: false,
    buildAuthorized: false,
    zipAuthorized: false,
    deployAuthorized: false,
    request,
  };
}

export function assessNamedRemoteCaptureAuthorization({
  root = process.cwd(),
  review = null,
  now = new Date(),
} = {}) {
  const validation = validateNamedRemoteCaptureAuthorizationReview(review, { root, now });
  return {
    schemaVersion: "atlas.named_remote_capture_authorization_assessment.v1",
    phase: 185,
    status: validation.valid
      ? "authorization_contract_valid_remote_execution_still_blocked"
      : "blocked_explicit_human_authorization_unavailable",
    ...validation,
    nextSafeAction: validation.valid
      ? "prepare_single_use_execution_handoff_without_contacting_remote"
      : "record_short_lived_hash_bound_human_review_locally",
  };
}

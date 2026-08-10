import { createHash, randomBytes } from "node:crypto";
import { adaptNamedRemoteMetadataCapture } from "./supabase-named-remote-capture-adapter.mjs";
import { validateNamedRemoteCaptureAuthorizationReview } from "./supabase-named-remote-capture-authorization-gate.mjs";

export const NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA =
  "atlas.named_remote_capture_handoff.v1";
export const NAMED_REMOTE_CAPTURE_HANDOFF_MAX_LIFETIME_MS = 2 * 60 * 1000;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function resultBase(reason, extra = {}) {
  return {
    ok: false,
    reason,
    authorizationConsumed: false,
    handoffConsumed: false,
    remoteExecutionAuthorized: false,
    remoteContactedByHandoff: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    databaseReset: false,
    buildAuthorized: false,
    zipAuthorized: false,
    deployAuthorized: false,
    ...extra,
  };
}

export function createNamedRemoteCaptureHandoffSession({
  root = process.cwd(),
  review = null,
  now = new Date(),
  randomBytesFn = randomBytes,
} = {}) {
  const issuedAt = timestamp(now);
  if (!issuedAt) return resultBase("handoff_issue_timestamp_invalid");

  const validation = validateNamedRemoteCaptureAuthorizationReview(review, {
    root,
    now: issuedAt,
  });
  if (!validation.valid) {
    return resultBase("handoff_authorization_review_invalid", {
      authorizationReason: validation.reason,
    });
  }

  const authorizationExpiresAt = new Date(validation.expiresAt);
  const expiresAt = new Date(Math.min(
    authorizationExpiresAt.getTime(),
    issuedAt.getTime() + NAMED_REMOTE_CAPTURE_HANDOFF_MAX_LIFETIME_MS,
  ));
  const reviewSnapshot = JSON.parse(JSON.stringify(review));
  const handoffIdSha256 = sha256(randomBytesFn(32));
  const manifest = Object.freeze({
    schemaVersion: NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA,
    phase: 186,
    status: "prepared_local_single_use_adapter_handoff",
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    maximumLifetimeSeconds: NAMED_REMOTE_CAPTURE_HANDOFF_MAX_LIFETIME_MS / 1000,
    handoffIdSha256,
    authorizationReviewSha256: sha256(JSON.stringify(reviewSnapshot)),
    operationFingerprintSha256: validation.operationFingerprintSha256,
    targetProjectRefSha256: validation.request.targetIdentity.projectRefSha256,
    querySha256: validation.request.operationBinding.querySha256,
    localFingerprintSetSha256: validation.request.operationBinding.localFingerprintSetSha256,
    captureMode: validation.request.operationBinding.captureMode,
    requiredLogicalNameCount: validation.request.operationBinding.requiredLogicalNameCount,
    rawProjectRefIncluded: false,
    credentialsIncluded: false,
    bearerTokenIncluded: false,
    remoteExecutorIncluded: false,
  });

  let consumed = false;
  let consumedAt = null;

  function getState() {
    return Object.freeze({
      handoffIdSha256,
      consumed,
      consumedAt,
      expiresAt: expiresAt.toISOString(),
      processLocalOnly: true,
    });
  }

  function consume(capture, { now: consumeNow = new Date() } = {}) {
    const assessedAt = timestamp(consumeNow);
    if (!assessedAt) return resultBase("handoff_consume_timestamp_invalid");
    if (consumed) {
      return resultBase("handoff_already_consumed", {
        authorizationConsumed: true,
        handoffConsumed: true,
        consumedAt,
      });
    }
    if (assessedAt.getTime() >= expiresAt.getTime()) {
      consumed = true;
      consumedAt = assessedAt.toISOString();
      return resultBase("handoff_expired", {
        authorizationConsumed: true,
        handoffConsumed: true,
        consumedAt,
      });
    }

    // Burn before revalidation/adaptation so malformed input cannot probe or replay the handoff.
    consumed = true;
    consumedAt = assessedAt.toISOString();

    const revalidation = validateNamedRemoteCaptureAuthorizationReview(reviewSnapshot, {
      root,
      now: assessedAt,
    });
    if (!revalidation.valid) {
      return resultBase("handoff_authorization_or_operation_changed", {
        authorizationReason: revalidation.reason,
        authorizationConsumed: true,
        handoffConsumed: true,
        consumedAt,
      });
    }
    if (
      capture?.authorizationBinding?.operationFingerprintSha256 !==
        manifest.operationFingerprintSha256 ||
      capture?.authorizationBinding?.handoffIdSha256 !== manifest.handoffIdSha256
    ) {
      return resultBase("handoff_capture_binding_invalid", {
        authorizationConsumed: true,
        handoffConsumed: true,
        consumedAt,
      });
    }

    const adapterResult = adaptNamedRemoteMetadataCapture(capture, {
      root,
      now: assessedAt,
    });
    return {
      ...resultBase(
        adapterResult.ok
          ? "handoff_consumed_capture_adapted"
          : "handoff_consumed_capture_rejected",
      ),
      ok: adapterResult.ok,
      authorizationConsumed: true,
      handoffConsumed: true,
      consumedAt,
      adapterReason: adapterResult.reason,
      evidence: adapterResult.evidence,
    };
  }

  return {
    ok: true,
    reason: "local_single_use_adapter_handoff_prepared",
    manifest,
    consume,
    getState,
  };
}

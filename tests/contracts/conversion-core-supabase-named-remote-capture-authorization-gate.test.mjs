import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assessNamedRemoteCaptureAuthorization,
  buildNamedRemoteCaptureAuthorizationRequest,
  NAMED_REMOTE_CAPTURE_APPROVAL_DECISION,
  NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG,
  NAMED_REMOTE_CAPTURE_AUTHORIZATION_REVIEW_SCHEMA,
  NAMED_REMOTE_CAPTURE_AUTHORIZATION_SCOPE,
  NAMED_REMOTE_CAPTURE_CONFIRMATION_PHRASE,
  validateNamedRemoteCaptureAuthorizationReview,
} from "../../lib/testing/supabase-named-remote-capture-authorization-gate.mjs";

const NOW = new Date("2026-08-08T21:00:00.000Z");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-named-capture-authorization-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_first.sql"), "select 1;");
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_second.sql"), "select 2;");
  return root;
}

function approvedReview(root, overrides = {}) {
  const request = buildNamedRemoteCaptureAuthorizationRequest({ root, generatedAt: NOW });
  return {
    schemaVersion: NAMED_REMOTE_CAPTURE_AUTHORIZATION_REVIEW_SCHEMA,
    status: "explicit_human_approval_recorded",
    scope: NAMED_REMOTE_CAPTURE_AUTHORIZATION_SCOPE,
    operationFingerprintSha256: request.operationBinding.fingerprintSha256,
    targetIdentity: { projectRefSha256: request.targetIdentity.projectRefSha256 },
    reviewer: { identitySha256: "a".repeat(64), role: "DIRETOR_DECISOR" },
    authorizationSignal: {
      environmentFlag: NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG,
      observed: true,
    },
    approval: {
      decision: NAMED_REMOTE_CAPTURE_APPROVAL_DECISION,
      confirmedAt: "2026-08-08T20:55:00.000Z",
      expiresAt: "2026-08-08T21:10:00.000Z",
      confirmationPhrase: NAMED_REMOTE_CAPTURE_CONFIRMATION_PHRASE,
      singleUse: true,
      consumed: false,
    },
    guarantees: {
      remoteWriteForbidden: true,
      sqlBodiesForbidden: true,
      rawOutputPersistenceForbidden: true,
      credentialPersistenceForbidden: true,
      releaseForbidden: true,
    },
    ...overrides,
  };
}

test("pedido local vincula alvo, consulta e migrations por hash sem expor project ref", () => {
  const root = fixture();
  try {
    const request = buildNamedRemoteCaptureAuthorizationRequest({ root, generatedAt: NOW });
    assert.equal(request.status, "awaiting_explicit_human_review");
    assert.equal(request.executionAvailableInThisPhase, false);
    assert.match(request.operationBinding.fingerprintSha256, /^[a-f0-9]{64}$/);
    assert.equal(request.targetIdentity.rawProjectRefIncluded, false);
    assert.equal(request.reviewRequirements.maximumValidityMinutes, 15);
    assert.equal(request.safeguards.remoteContacted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ausência de revisão humana falha fechada e não libera execução", () => {
  const root = fixture();
  try {
    const result = assessNamedRemoteCaptureAuthorization({ root, now: NOW });
    assert.equal(result.valid, false);
    assert.equal(result.remoteExecutionAuthorized, false);
    assert.equal(result.remoteContacted, false);
    assert.equal(result.reason, "authorization_review_missing_or_shape_invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("aprovação íntegra é aceita localmente mas executor remoto continua indisponível", () => {
  const root = fixture();
  try {
    const result = validateNamedRemoteCaptureAuthorizationReview(approvedReview(root), {
      root,
      now: NOW,
    });
    assert.equal(result.valid, true);
    assert.equal(result.authorizationContractAccepted, true);
    assert.equal(result.remoteExecutionAuthorized, false);
    assert.equal(result.authorizationConsumed, false);
    assert.equal(result.buildAuthorized, false);
    assert.equal(result.zipAuthorized, false);
    assert.equal(result.deployAuthorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mudança nas migrations invalida o vínculo criptográfico da aprovação", () => {
  const root = fixture();
  try {
    const review = approvedReview(root);
    writeFileSync(join(root, "supabase", "migrations", "20260808000000_third.sql"), "select 3;");
    const result = validateNamedRemoteCaptureAuthorizationReview(review, { root, now: NOW });
    assert.equal(result.reason, "authorization_scope_or_operation_binding_invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("aprovação expirada ou com janela maior que quinze minutos é recusada", () => {
  const root = fixture();
  try {
    const expired = approvedReview(root, {
      approval: {
        ...approvedReview(root).approval,
        confirmedAt: "2026-08-08T20:30:00.000Z",
        expiresAt: "2026-08-08T20:45:00.000Z",
      },
    });
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(expired, { root, now: NOW }).reason,
      "authorization_approval_expired",
    );

    const tooLong = approvedReview(root, {
      approval: {
        ...approvedReview(root).approval,
        confirmedAt: "2026-08-08T20:55:00.000Z",
        expiresAt: "2026-08-08T21:11:00.000Z",
      },
    });
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(tooLong, { root, now: NOW }).reason,
      "authorization_approval_window_invalid",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("autorização consumida não pode ser reutilizada", () => {
  const root = fixture();
  try {
    const review = approvedReview(root, {
      approval: { ...approvedReview(root).approval, consumed: true },
    });
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(review, { root, now: NOW }).reason,
      "authorization_already_consumed_or_ambiguous",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("revisor, sinal explícito e frase exata são obrigatórios", () => {
  const root = fixture();
  try {
    const badRole = approvedReview(root, {
      reviewer: { identitySha256: "a".repeat(64), role: "CORRETOR" },
    });
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(badRole, { root, now: NOW }).reason,
      "authorization_reviewer_invalid",
    );

    const noSignal = approvedReview(root, {
      authorizationSignal: {
        environmentFlag: NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG,
        observed: false,
      },
    });
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(noSignal, { root, now: NOW }).reason,
      "authorization_explicit_signal_missing",
    );

    const wrongPhrase = approvedReview(root, {
      approval: { ...approvedReview(root).approval, confirmationPhrase: "confirmo" },
    });
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(wrongPhrase, { root, now: NOW }).reason,
      "authorization_approval_statement_invalid",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("campos extras e garantia incompleta são rejeitados para evitar payload ou segredo", () => {
  const root = fixture();
  try {
    const extra = { ...approvedReview(root), credential: "not-allowed" };
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(extra, { root, now: NOW }).reason,
      "authorization_review_missing_or_shape_invalid",
    );
    const incomplete = approvedReview(root, {
      guarantees: {
        ...approvedReview(root).guarantees,
        credentialPersistenceForbidden: false,
      },
    });
    assert.equal(
      validateNamedRemoteCaptureAuthorizationReview(incomplete, { root, now: NOW }).reason,
      "authorization_safety_guarantees_incomplete",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

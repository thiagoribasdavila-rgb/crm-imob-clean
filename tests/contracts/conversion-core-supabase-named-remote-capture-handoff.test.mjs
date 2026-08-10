import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NAMED_REMOTE_CAPTURE_SCHEMA } from "../../lib/testing/supabase-named-remote-capture-adapter.mjs";
import {
  NAMED_REMOTE_CAPTURE_APPROVAL_DECISION,
  NAMED_REMOTE_CAPTURE_AUTHORIZATION_FLAG,
  NAMED_REMOTE_CAPTURE_AUTHORIZATION_REVIEW_SCHEMA,
  NAMED_REMOTE_CAPTURE_AUTHORIZATION_SCOPE,
  NAMED_REMOTE_CAPTURE_CONFIRMATION_PHRASE,
  buildNamedRemoteCaptureAuthorizationRequest,
} from "../../lib/testing/supabase-named-remote-capture-authorization-gate.mjs";
import {
  NAMED_REMOTE_CAPTURE_HANDOFF_MAX_LIFETIME_MS,
  createNamedRemoteCaptureHandoffSession,
} from "../../lib/testing/supabase-named-remote-capture-handoff.mjs";
import {
  EXPECTED_PROJECT_REF_SHA256,
  buildNamedRemoteEvidenceRequest,
} from "../../lib/testing/supabase-named-remote-evidence-contract.mjs";

const NOW = new Date("2026-08-08T21:00:00.000Z");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-named-capture-handoff-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_first.sql"), "select 1;");
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_second.sql"), "select 2;");
  return root;
}

function approvedReview(root) {
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
  };
}

function captureFor(root, binding) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt: NOW });
  return {
    schemaVersion: NAMED_REMOTE_CAPTURE_SCHEMA,
    capturedAt: "2026-08-08T20:59:30.000Z",
    captureMode: "remote_metadata_read_only",
    remoteContacted: true,
    targetIdentity: { projectRefSha256: EXPECTED_PROJECT_REF_SHA256 },
    provenance: {
      collector: "operator_authorized_read_only_named_metadata",
      cliVersion: "2.109.1",
      commandSha256: "b".repeat(64),
    },
    execution: {
      remoteWriteExecuted: false,
      migrationApplied: false,
      migrationPushExecuted: false,
      migrationHistoryRepaired: false,
      migrationFileRenamed: false,
      databaseReset: false,
    },
    sqlBodiesIncluded: false,
    secretsIncluded: false,
    authorizationBinding: binding,
    migrations: request.requiredMappings.map((entry, index) => ({
      version: `2026080800000${index + 1}`,
      name: `2026080800000${index + 1}_${entry.logicalName}`,
    })),
  };
}

function createSession(root) {
  return createNamedRemoteCaptureHandoffSession({
    root,
    review: approvedReview(root),
    now: NOW,
    randomBytesFn: () => Buffer.alloc(32, 7),
  });
}

test("handoff válido é curto, local e não contém token, credencial ou executor", () => {
  const root = fixture();
  try {
    const session = createSession(root);
    assert.equal(session.ok, true);
    assert.equal(session.manifest.maximumLifetimeSeconds, 120);
    assert.equal(NAMED_REMOTE_CAPTURE_HANDOFF_MAX_LIFETIME_MS, 120_000);
    assert.equal(session.manifest.bearerTokenIncluded, false);
    assert.equal(session.manifest.credentialsIncluded, false);
    assert.equal(session.manifest.remoteExecutorIncluded, false);
    assert.equal(session.manifest.rawProjectRefIncluded, false);
    assert.equal(typeof session.consume, "function");
    assert.equal(session.getState().processLocalOnly, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("revisão ausente ou inválida não cria capacidade de consumo", () => {
  const root = fixture();
  try {
    const result = createNamedRemoteCaptureHandoffSession({ root, now: NOW });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "handoff_authorization_review_invalid");
    assert.equal("consume" in result, false);
    assert.equal(result.remoteExecutionAuthorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("primeiro consumo adapta captura vinculada e não executa remoto nem release", () => {
  const root = fixture();
  try {
    const session = createSession(root);
    const capture = captureFor(root, {
      operationFingerprintSha256: session.manifest.operationFingerprintSha256,
      handoffIdSha256: session.manifest.handoffIdSha256,
    });
    const result = session.consume(capture, { now: new Date("2026-08-08T21:01:00.000Z") });
    assert.equal(result.ok, true);
    assert.equal(result.authorizationConsumed, true);
    assert.equal(result.handoffConsumed, true);
    assert.equal(result.remoteContactedByHandoff, false);
    assert.equal(result.remoteWriteExecuted, false);
    assert.equal(result.buildAuthorized, false);
    assert.equal(result.zipAuthorized, false);
    assert.equal(result.deployAuthorized, false);
    assert.equal(result.evidence.mappings.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("segunda tentativa é recusada mesmo após primeiro consumo válido", () => {
  const root = fixture();
  try {
    const session = createSession(root);
    const binding = {
      operationFingerprintSha256: session.manifest.operationFingerprintSha256,
      handoffIdSha256: session.manifest.handoffIdSha256,
    };
    assert.equal(session.consume(captureFor(root, binding), { now: NOW }).ok, true);
    const replay = session.consume(captureFor(root, binding), { now: NOW });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "handoff_already_consumed");
    assert.equal(replay.handoffConsumed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("captura mal vinculada queima o handoff e não permite correção posterior", () => {
  const root = fixture();
  try {
    const session = createSession(root);
    const rejected = session.consume(captureFor(root, {
      operationFingerprintSha256: "0".repeat(64),
      handoffIdSha256: session.manifest.handoffIdSha256,
    }), { now: NOW });
    assert.equal(rejected.reason, "handoff_capture_binding_invalid");
    assert.equal(rejected.authorizationConsumed, true);
    assert.equal(session.getState().consumed, true);
    assert.equal(session.consume({}, { now: NOW }).reason, "handoff_already_consumed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("captura inválida no adaptador também consome a autorização", () => {
  const root = fixture();
  try {
    const session = createSession(root);
    const capture = captureFor(root, {
      operationFingerprintSha256: session.manifest.operationFingerprintSha256,
      handoffIdSha256: session.manifest.handoffIdSha256,
    });
    capture.execution.remoteWriteExecuted = true;
    const result = session.consume(capture, { now: NOW });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "handoff_consumed_capture_rejected");
    assert.equal(result.adapterReason, "named_remote_capture_mutation_tainted_or_ambiguous");
    assert.equal(result.handoffConsumed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("handoff expirado falha fechado e fica definitivamente consumido", () => {
  const root = fixture();
  try {
    const session = createSession(root);
    const result = session.consume({}, { now: new Date("2026-08-08T21:02:00.000Z") });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "handoff_expired");
    assert.equal(result.handoffConsumed, true);
    assert.equal(session.getState().consumed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mudança nas migrations entre emissão e consumo invalida e queima o handoff", () => {
  const root = fixture();
  try {
    const session = createSession(root);
    const capture = captureFor(root, {
      operationFingerprintSha256: session.manifest.operationFingerprintSha256,
      handoffIdSha256: session.manifest.handoffIdSha256,
    });
    writeFileSync(join(root, "supabase", "migrations", "20260808000000_third.sql"), "select 3;");
    const result = session.consume(capture, { now: NOW });
    assert.equal(result.reason, "handoff_authorization_or_operation_changed");
    assert.equal(result.authorizationReason, "authorization_scope_or_operation_binding_invalid");
    assert.equal(result.handoffConsumed, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

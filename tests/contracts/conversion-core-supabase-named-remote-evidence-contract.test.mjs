import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assessNamedRemoteMigrationEvidence,
  buildNamedRemoteEvidenceRequest,
  EXPECTED_PROJECT_REF_SHA256,
  NAMED_REMOTE_EVIDENCE_SCHEMA,
  validateNamedRemoteMigrationEvidence,
} from "../../lib/testing/supabase-named-remote-evidence-contract.mjs";

const NOW = new Date("2026-08-08T15:00:00.000Z");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-named-evidence-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_first.sql"), "select 1;");
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_second.sql"), "select 2;");
  return root;
}

function evidenceFor(root, overrides = {}) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt: NOW });
  return {
    schemaVersion: NAMED_REMOTE_EVIDENCE_SCHEMA,
    capturedAt: "2026-08-08T14:30:00.000Z",
    captureMode: "remote_metadata_read_only",
    remoteContacted: true,
    targetIdentity: { projectRefSha256: EXPECTED_PROJECT_REF_SHA256 },
    provenance: {
      collector: "operator_read_only_named_ledger",
      cliVersion: "2.109.1",
      commandSha256: "a".repeat(64),
    },
    execution: {
      remoteWriteExecuted: false,
      migrationApplied: false,
      migrationPushExecuted: false,
      migrationHistoryRepaired: false,
      migrationFileRenamed: false,
      databaseReset: false,
    },
    localFingerprintSetSha256: request.localFingerprintSetSha256,
    mappings: request.requiredMappings.map((entry, index) => ({
      localFilename: entry.localFilename,
      localSha256: entry.localSha256,
      logicalName: entry.logicalName,
      remoteVersion: `2026080800000${index + 1}`,
      remoteName: `2026080800000${index + 1}_${entry.logicalName}`,
    })),
    ...overrides,
  };
}

test("missing named evidence fails closed and emits a secret-free request", () => {
  const root = fixture();
  try {
    const assessment = assessNamedRemoteMigrationEvidence({ root, now: NOW });
    assert.equal(assessment.status, "blocked_current_named_remote_evidence_unavailable");
    assert.equal(assessment.evidenceAccepted, false);
    assert.equal(assessment.evidenceRequest.requiredMappingCount, 2);
    assert.equal(assessment.evidenceRequest.sqlBodiesIncluded, false);
    assert.equal(assessment.evidenceRequest.secretsIncluded, false);
    assert.equal(assessment.remoteWriteExecuted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale current evidence is rejected", () => {
  const root = fixture();
  try {
    const evidence = evidenceFor(root, { capturedAt: "2026-08-06T14:30:00.000Z" });
    assert.equal(
      validateNamedRemoteMigrationEvidence(evidence, { root, now: NOW }).reason,
      "current_named_remote_evidence_stale",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mutation-tainted or mutation-ambiguous evidence is rejected", () => {
  const root = fixture();
  try {
    const evidence = evidenceFor(root);
    evidence.execution.migrationPushExecuted = true;
    assert.equal(
      validateNamedRemoteMigrationEvidence(evidence, { root, now: NOW }).reason,
      "evidence_contains_forbidden_or_unproven_mutation",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("valid current evidence proves mappings but never authorizes reconciliation or release", () => {
  const root = fixture();
  try {
    const assessment = assessNamedRemoteMigrationEvidence({ root, evidence: evidenceFor(root), now: NOW });
    assert.equal(assessment.evidenceAccepted, true);
    assert.equal(assessment.mappingCount, 2);
    assert.equal(assessment.status, "current_named_evidence_valid_reconciliation_still_requires_human_review");
    assert.equal(assessment.migrationFileRenamed, false);
    assert.equal(assessment.migrationHistoryRepaired, false);
    assert.equal(assessment.directPushAuthorized, false);
    assert.equal(assessment.buildAuthorized, false);
    assert.equal(assessment.zipAuthorized, false);
    assert.equal(assessment.deployAuthorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a changed local migration fingerprint invalidates otherwise current evidence", () => {
  const root = fixture();
  try {
    const evidence = evidenceFor(root);
    writeFileSync(join(root, "supabase", "migrations", "20260808000000_first.sql"), "select 99;");
    assert.equal(
      validateNamedRemoteMigrationEvidence(evidence, { root, now: NOW }).reason,
      "local_migration_fingerprint_set_mismatch",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

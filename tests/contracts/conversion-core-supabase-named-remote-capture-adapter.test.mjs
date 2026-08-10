import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  adaptNamedRemoteMetadataCapture,
  buildNamedRemoteCaptureTemplate,
  NAMED_REMOTE_CAPTURE_SCHEMA,
} from "../../lib/testing/supabase-named-remote-capture-adapter.mjs";
import {
  buildNamedRemoteEvidenceRequest,
  EXPECTED_PROJECT_REF_SHA256,
  validateNamedRemoteMigrationEvidence,
} from "../../lib/testing/supabase-named-remote-evidence-contract.mjs";

const NOW = new Date("2026-08-08T18:00:00.000Z");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-named-capture-adapter-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_first.sql"), "select 1;");
  writeFileSync(join(root, "supabase", "migrations", "20260808000000_second.sql"), "select 2;");
  return root;
}

function captureFor(root, overrides = {}) {
  const request = buildNamedRemoteEvidenceRequest({ root, generatedAt: NOW });
  return {
    schemaVersion: NAMED_REMOTE_CAPTURE_SCHEMA,
    capturedAt: "2026-08-08T17:30:00.000Z",
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
    migrations: request.requiredMappings.map((entry, index) => ({
      version: `2026080800000${index + 1}`,
      name: `2026080800000${index + 1}_${entry.logicalName}`,
    })),
    ...overrides,
  };
}

test("template local é seguro, vazio e não simula contato remoto", () => {
  const root = fixture();
  try {
    const template = buildNamedRemoteCaptureTemplate({ root, generatedAt: NOW });
    assert.equal(template.remoteContacted, false);
    assert.equal(template.sqlBodiesIncluded, false);
    assert.equal(template.secretsIncluded, false);
    assert.deepEqual(template.migrations, []);
    assert.equal(template.requiredLogicalNames.length, 2);
    assert.equal("projectRef" in template.targetIdentity, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("captura nominal válida vira evidência aceita sem autorizar mutação ou release", () => {
  const root = fixture();
  try {
    const result = adaptNamedRemoteMetadataCapture(captureFor(root), { root, now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.evidence.mappings.length, 2);
    assert.equal(validateNamedRemoteMigrationEvidence(result.evidence, { root, now: NOW }).valid, true);
    assert.equal(result.remoteWriteExecuted, false);
    assert.equal(result.migrationFileRenamed, false);
    assert.equal(result.buildAuthorized, false);
    assert.equal(result.zipAuthorized, false);
    assert.equal(result.deployAuthorized, false);
    assert.equal(result.evidence.sqlBodiesIncluded, false);
    assert.equal(result.evidence.secretsIncluded, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mapeamento nominal ausente ou ambíguo falha fechado", () => {
  const root = fixture();
  try {
    const missing = captureFor(root);
    missing.migrations.pop();
    assert.equal(
      adaptNamedRemoteMetadataCapture(missing, { root, now: NOW }).reason,
      "named_remote_capture_required_mapping_missing",
    );

    const ambiguous = captureFor(root);
    const first = ambiguous.migrations[0];
    ambiguous.migrations.push({ version: "20260808000009", name: `20260808000009_${first.name.slice(15)}` });
    assert.equal(
      adaptNamedRemoteMetadataCapture(ambiguous, { root, now: NOW }).reason,
      "named_remote_capture_required_mapping_ambiguous",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registro com campos extras, SQL ou identidade inconsistente é recusado", () => {
  const root = fixture();
  try {
    const withSql = captureFor(root, { sqlBodiesIncluded: true });
    assert.equal(
      adaptNamedRemoteMetadataCapture(withSql, { root, now: NOW }).reason,
      "named_remote_capture_contains_prohibited_content",
    );

    const extraField = captureFor(root);
    extraField.migrations[0].sql = "select secret";
    assert.equal(
      adaptNamedRemoteMetadataCapture(extraField, { root, now: NOW }).reason,
      "named_remote_capture_migration_record_invalid",
    );

    const inconsistent = captureFor(root);
    inconsistent.migrations[0].version = "20260808000999";
    assert.equal(
      adaptNamedRemoteMetadataCapture(inconsistent, { root, now: NOW }).reason,
      "named_remote_capture_migration_identity_invalid",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("qualquer flag de escrita ou proveniência incompleta impede adaptação", () => {
  const root = fixture();
  try {
    const writeTainted = captureFor(root);
    writeTainted.execution.remoteWriteExecuted = true;
    assert.equal(
      adaptNamedRemoteMetadataCapture(writeTainted, { root, now: NOW }).reason,
      "named_remote_capture_mutation_tainted_or_ambiguous",
    );

    const noCommandProof = captureFor(root);
    noCommandProof.provenance.commandSha256 = "";
    assert.equal(
      adaptNamedRemoteMetadataCapture(noCommandProof, { root, now: NOW }).reason,
      "named_remote_capture_provenance_invalid",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.mjs";
import { NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.mjs";
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_EXPORT_AUTHORIZATION_SCHEMA,
  SNAPSHOT_EXPORT_APPROVAL_PHRASE,
  createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot-export-authorization.mjs";

const KEY = "phase-195-private-authorization-key-with-at-least-thirty-two-bytes";
const RECIPIENT = "destinatario-controlado-195";
const APPROVER = "aprovador-humano-195";
const PURPOSE = "security_audit";
const ISSUED_AT = "2026-08-09T10:00:00.000Z";
const EXPIRES_AT = "2026-08-09T10:10:00.000Z";

const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const serialized = (value) => `${JSON.stringify(canonical(value))}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-snapshot-export-authorization-"));
  mkdirSync(join(root, "private"), { mode: 0o700 });
  chmodSync(join(root, "private"), 0o700);
  return root;
}

function snapshot(root, directory = "snapshots", marker = "1") {
  const target = join(root, "private", directory);
  mkdirSync(target, { mode: 0o700 });
  chmodSync(target, 0o700);
  const entrySha256 = marker.repeat(64);
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA,
    phase: 194,
    createdAt: "2026-08-09T09:00:00.000Z",
    source: {
      indexSchemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA,
      indexDigestSha256: "a".repeat(64),
      headEntrySha256: entrySha256,
      genesisEntrySha256: entrySha256,
      entryCount: 1,
    },
    records: [{
      positionFromHead: 0,
      sequence: 0,
      entrySha256,
      custodyRecordSha256: "b".repeat(64),
      sourceProofSha256: "c".repeat(64),
      previousEntrySha256: null,
    }],
    privacy: { claimsIncluded: false, credentialsIncluded: false, personalDataIncluded: false },
    execution: {
      remoteContacted: false, remoteWriteExecuted: false, databaseWriteExecuted: false,
      migrationApplied: false, buildExecuted: false, zipGenerated: false, deployExecuted: false,
    },
  };
  const document = { ...withoutHash, snapshotSha256: sha256(serialized(withoutHash)) };
  const snapshotFileName = `${document.snapshotSha256}.json`;
  writeFileSync(join(target, snapshotFileName), serialized(document), { mode: 0o600 });
  chmodSync(join(target, snapshotFileName), 0o600);
  return { snapshotDirectory: `private/${directory}`, snapshotFileName };
}

function create(root, source, overrides = {}) {
  return createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
    root,
    ...source,
    authorizationDirectory: "private/export-authorizations",
    recipientId: RECIPIENT,
    approverId: APPROVER,
    authorizationKey: KEY,
    purposeCode: PURPOSE,
    approvalPhrase: SNAPSHOT_EXPORT_APPROVAL_PHRASE,
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  });
}

function verify(root, source, authorization, overrides = {}) {
  return verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
    root,
    ...source,
    authorizationDirectory: "private/export-authorizations",
    authorizationFileName: authorization.authorizationFileName,
    recipientId: RECIPIENT,
    approverId: APPROVER,
    authorizationKey: KEY,
    expectedPurposeCode: PURPOSE,
    now: "2026-08-09T10:05:00.000Z",
    ...overrides,
  });
}

test("cria autorização privada separada sem identidades ou chave em claro", () => {
  const root = fixture();
  try {
    const authorization = create(root, snapshot(root));
    assert.equal(authorization.ok, true);
    assert.equal(authorization.reason, "snapshot_export_authorization_created");
    const raw = readFileSync(join(root, "private/export-authorizations", authorization.authorizationFileName), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schemaVersion, NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_EXPORT_AUTHORIZATION_SCHEMA);
    for (const forbidden of [RECIPIENT, APPROVER, KEY]) assert.equal(raw.includes(forbidden), false);
    assert.equal(parsed.privacy.recipientIncluded, false);
    assert.equal(parsed.execution.exportExecuted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("verifica identidade, finalidade, validade e vínculo com o snapshot", () => {
  const root = fixture();
  try {
    const source = snapshot(root);
    const authorization = create(root, source);
    const verified = verify(root, source, authorization);
    assert.equal(verified.ok, true);
    assert.equal(verified.reason, "snapshot_export_authorization_verified");
    assert.equal(verified.exportAuthorized, true);
    assert.equal(verified.snapshotVerified, true);
    assert.equal(verified.exportExecuted, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa destinatário, aprovador ou finalidade divergente", () => {
  const root = fixture();
  try {
    const source = snapshot(root);
    const authorization = create(root, source);
    for (const override of [
      { recipientId: "outro-destinatario" },
      { approverId: "outro-aprovador" },
      { expectedPurposeCode: "regulatory_evidence_review" },
    ]) {
      assert.equal(verify(root, source, authorization, override).reason, "snapshot_export_authorization_identity_or_purpose_mismatch");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("expiração e início futuro falham fechados", () => {
  const root = fixture();
  try {
    const source = snapshot(root);
    const authorization = create(root, source);
    assert.equal(verify(root, source, authorization, { now: "2026-08-09T09:59:59.000Z" }).reason, "snapshot_export_authorization_not_yet_valid");
    assert.equal(verify(root, source, authorization, { now: EXPIRES_AT }).reason, "snapshot_export_authorization_expired");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("limita autorização a quinze minutos", () => {
  const root = fixture();
  try {
    const invalid = create(root, snapshot(root), { expiresAt: "2026-08-09T10:15:00.001Z" });
    assert.equal(invalid.reason, "snapshot_export_authorization_validity_invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("exige aprovação literal e separação de funções", () => {
  const root = fixture();
  try {
    const source = snapshot(root);
    assert.equal(create(root, source, { approvalPhrase: "sim" }).reason, "snapshot_export_authorization_phrase_invalid");
    assert.equal(create(root, source, { approverId: RECIPIENT }).reason, "snapshot_export_authorization_separation_of_duties_required");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("criação idêntica é idempotente", () => {
  const root = fixture();
  try {
    const source = snapshot(root);
    assert.equal(create(root, source).reason, "snapshot_export_authorization_created");
    const repeated = create(root, source);
    assert.equal(repeated.ok, true);
    assert.equal(repeated.reason, "snapshot_export_authorization_already_exists");
    assert.equal(repeated.localAuthorizationWritten, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta adulteração e vínculo com outro snapshot", () => {
  const root = fixture();
  try {
    const source = snapshot(root);
    const authorization = create(root, source);
    const other = snapshot(root, "other-snapshots", "2");
    assert.equal(verify(root, other, authorization).reason, "snapshot_export_authorization_snapshot_mismatch");
    const path = join(root, "private/export-authorizations", authorization.authorizationFileName);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.authorization.purposeCode = "regulatory_evidence_review";
    writeFileSync(path, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
      root, authorizationDirectory: "private/export-authorizations", authorizationFileName: authorization.authorizationFileName,
    }).reason, "snapshot_export_authorization_hash_mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa permissões amplas, symlink e fuga da raiz", () => {
  const root = fixture();
  try {
    const source = snapshot(root);
    const authorization = create(root, source);
    const path = join(root, "private/export-authorizations", authorization.authorizationFileName);
    chmodSync(path, 0o644);
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
      root, authorizationDirectory: "private/export-authorizations", authorizationFileName: authorization.authorizationFileName,
    }).reason, "snapshot_export_authorization_mode_invalid");
    chmodSync(path, 0o600);
    const linkName = `${"f".repeat(64)}.json`;
    symlinkSync(path, join(root, "private/export-authorizations", linkName));
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
      root, authorizationDirectory: "private/export-authorizations", authorizationFileName: linkName,
    }).reason, "snapshot_export_authorization_symlink_refused");
    assert.equal(create(root, source, { authorizationDirectory: "../escape" }).reason, "snapshot_export_authorization_directory_outside_root");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ausência de entrada falha fechada sem efeitos operacionais", () => {
  const created = createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization();
  const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization();
  assert.equal(created.ok, false);
  assert.equal(created.reason, "snapshot_export_authorization_recipient_invalid");
  assert.equal(verified.reason, "snapshot_export_authorization_file_name_invalid");
  for (const subject of [created, verified]) {
    for (const key of ["exportExecuted", "remoteContacted", "remoteWriteExecuted", "databaseWriteExecuted", "migrationApplied", "buildExecuted", "zipGenerated", "deployExecuted"]) {
      assert.equal(subject[key], false);
    }
  }
});

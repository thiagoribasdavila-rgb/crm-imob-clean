import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA } from "../../lib/testing/supabase-named-remote-capture-handoff.mjs";
import { persistNamedRemoteCaptureConsumptionReceipt } from "../../lib/testing/supabase-named-remote-capture-consumption-receipt.mjs";
import { createNamedRemoteCaptureReceiptLedgerCheckpoint } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint.mjs";
import { appendNamedRemoteCaptureReceiptLedgerCheckpointChain } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain.mjs";
import { createNamedRemoteCaptureReceiptLedgerCheckpointChainProof } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.mjs";
import { createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.mjs";
import { appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.mjs";
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA,
  createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.mjs";

const KEY = "phase-194-private-test-key-with-at-least-thirty-two-bytes";
const REVIEWER = "revisor-privado-194";
const PURPOSE = "validar snapshot sem revelar conteudo";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-custody-snapshot-"));
  mkdirSync(join(root, "private"), { mode: 0o700 });
  chmodSync(join(root, "private"), 0o700);
  return root;
}

function custodySource(root, seed, minute) {
  const manifest = {
    schemaVersion: NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA,
    handoffIdSha256: seed.repeat(64), authorizationReviewSha256: "a".repeat(64),
    operationFingerprintSha256: "b".repeat(64), targetProjectRefSha256: "c".repeat(64),
    querySha256: "d".repeat(64), localFingerprintSetSha256: "e".repeat(64),
    issuedAt: "2026-08-08T20:00:00.000Z", expiresAt: "2026-08-09T03:00:00.000Z",
  };
  persistNamedRemoteCaptureConsumptionReceipt({
    root, receiptDirectory: "private/receipts", manifest,
    consumption: {
      ok: true, reason: "named_remote_capture_adapted", adapterReason: null,
      handoffConsumed: true, authorizationConsumed: true,
      consumedAt: `2026-08-08T22:${minute}:00.000Z`, remoteWriteExecuted: false,
      evidence: { schemaVersion: "atlas.named_remote_capture.v1", mappings: [{ status: "aligned" }] },
    },
    recordedAt: `2026-08-08T23:${minute}:00.000Z`,
  });
  const checkpoint = createNamedRemoteCaptureReceiptLedgerCheckpoint({
    root, receiptDirectory: "private/receipts", checkpointDirectory: "private/checkpoints",
    generatedAt: `2026-08-09T00:${minute}:00.000Z`,
  });
  const chainDirectory = `private/chain-${seed}`;
  const chain = appendNamedRemoteCaptureReceiptLedgerCheckpointChain({
    root, checkpointDirectory: "private/checkpoints", checkpointFileName: checkpoint.checkpointFileName,
    chainDirectory, recordedAt: `2026-08-09T01:${minute}:00.000Z`,
  });
  const proof = createNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
    root, checkpointDirectory: "private/checkpoints", chainDirectory,
    headEntryFileName: chain.entryFileName, proofDirectory: "private/proofs",
    generatedAt: `2026-08-09T02:${minute}:00.000Z`,
  });
  return createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
    root, proofDirectory: "private/proofs", proofFileName: proof.proofFileName,
    custodyDirectory: "private/custody", reviewer: REVIEWER, purpose: PURPOSE,
    pseudonymizationKey: KEY, recordedAt: `2026-08-09T03:${minute}:00.000Z`,
  });
}

function index(root, indexDirectory = "private/custody-index", count = 2, seedOffset = 0) {
  let previousEntryFileName = null;
  for (let position = 0; position < count; position += 1) {
    const minute = String(position + 1 + seedOffset).padStart(2, "0");
    const seed = String((position + seedOffset) % 9 + 1);
    const custody = custodySource(root, seed, minute);
    const entry = appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
      root, custodyDirectory: "private/custody", custodyFileName: custody.custodyFileName,
      indexDirectory, previousEntryFileName, indexedAt: `2026-08-09T04:${minute}:00.000Z`,
    });
    assert.equal(entry.ok, true);
    previousEntryFileName = entry.entryFileName;
  }
  return previousEntryFileName;
}

function create(root, headEntryFileName, indexDirectory = "private/custody-index", createdAt = "2026-08-09T05:00:00.000Z") {
  return createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
    root, custodyDirectory: "private/custody", indexDirectory, headEntryFileName,
    snapshotDirectory: "private/snapshots", createdAt,
  });
}

test("gera snapshot compacto somente com hashes e estrutura", () => {
  const root = fixture();
  try {
    const source = index(root);
    const snapshot = create(root, source);
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.entryCount, 2);
    const raw = readFileSync(join(root, "private/snapshots", snapshot.snapshotFileName), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schemaVersion, NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA);
    assert.equal(parsed.records.length, 2);
    for (const forbidden of [REVIEWER, PURPOSE, KEY, "reviewerHmacSha256", "purposeHmacSha256", "pseudonymizationKey"]) {
      assert.equal(raw.includes(forbidden), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("verifica snapshot portátil sem acesso ao índice-fonte", () => {
  const root = fixture();
  try {
    const snapshot = create(root, index(root));
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: snapshot.snapshotFileName,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.reason, "proof_custody_index_snapshot_portable_verified");
    assert.equal(verified.sourceIndexVerified, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("revalida snapshot contra índice privado original", () => {
  const root = fixture();
  try {
    const head = index(root);
    const snapshot = create(root, head);
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: snapshot.snapshotFileName,
      custodyDirectory: "private/custody", indexDirectory: "private/custody-index", headEntryFileName: head,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.reason, "proof_custody_index_snapshot_source_verified");
    assert.equal(verified.sourceIndexVerified, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("criação idêntica é idempotente", () => {
  const root = fixture();
  try {
    const head = index(root);
    assert.equal(create(root, head).reason, "proof_custody_index_snapshot_created");
    const repeated = create(root, head);
    assert.equal(repeated.ok, true);
    assert.equal(repeated.reason, "proof_custody_index_snapshot_already_exists");
    assert.equal(repeated.localSnapshotWritten, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta adulteração do conteúdo portátil", () => {
  const root = fixture();
  try {
    const snapshot = create(root, index(root));
    const path = join(root, "private/snapshots", snapshot.snapshotFileName);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.records[0].sourceProofSha256 = "f".repeat(64);
    writeFileSync(path, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: snapshot.snapshotFileName,
    }).reason, "proof_custody_index_snapshot_hash_mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta cadeia estrutural adulterada antes do hash", () => {
  const root = fixture();
  try {
    const snapshot = create(root, index(root));
    const path = join(root, "private/snapshots", snapshot.snapshotFileName);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.records[0].previousEntrySha256 = null;
    writeFileSync(path, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: snapshot.snapshotFileName,
    }).reason, "proof_custody_index_snapshot_chain_invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa validar contra outro índice", () => {
  const root = fixture();
  try {
    const snapshot = create(root, index(root));
    const otherHead = index(root, "private/other-index", 1, 3);
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: snapshot.snapshotFileName,
      custodyDirectory: "private/custody", indexDirectory: "private/other-index", headEntryFileName: otherHead,
    });
    assert.equal(verified.reason, "proof_custody_index_snapshot_source_mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("argumentos parciais da fonte falham fechados", () => {
  const root = fixture();
  try {
    const snapshot = create(root, index(root));
    assert.equal(verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: snapshot.snapshotFileName,
      indexDirectory: "private/custody-index",
    }).reason, "proof_custody_index_snapshot_source_arguments_incomplete");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa permissões amplas, symlink e fuga da raiz", () => {
  const root = fixture();
  try {
    const source = index(root);
    const snapshot = create(root, source);
    const path = join(root, "private/snapshots", snapshot.snapshotFileName);
    chmodSync(path, 0o644);
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: snapshot.snapshotFileName,
    }).reason, "proof_custody_index_snapshot_mode_invalid");
    chmodSync(path, 0o600);
    const linkName = `${"f".repeat(64)}.json`;
    symlinkSync(path, join(root, "private/snapshots", linkName));
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, snapshotDirectory: "private/snapshots", snapshotFileName: linkName,
    }).reason, "proof_custody_index_snapshot_symlink_refused");
    assert.equal(createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
      root, custodyDirectory: "private/custody", indexDirectory: "private/custody-index",
      headEntryFileName: source, snapshotDirectory: "../escape",
    }).reason, "proof_custody_index_snapshot_directory_outside_root");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ausência de entrada falha fechada sem efeitos operacionais", () => {
  const created = createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot();
  const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot();
  assert.equal(created.ok, false);
  assert.equal(created.reason, "proof_custody_index_snapshot_source_invalid");
  assert.equal(verified.reason, "proof_custody_index_snapshot_file_name_invalid");
  for (const subject of [created, verified]) {
    for (const key of ["remoteContacted", "remoteWriteExecuted", "databaseWriteExecuted", "migrationApplied", "buildExecuted", "zipGenerated", "deployExecuted"]) {
      assert.equal(subject[key], false);
    }
  }
});

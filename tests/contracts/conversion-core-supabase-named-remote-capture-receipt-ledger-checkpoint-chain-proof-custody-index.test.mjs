import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA } from "../../lib/testing/supabase-named-remote-capture-handoff.mjs";
import { persistNamedRemoteCaptureConsumptionReceipt } from "../../lib/testing/supabase-named-remote-capture-consumption-receipt.mjs";
import { createNamedRemoteCaptureReceiptLedgerCheckpoint } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint.mjs";
import { appendNamedRemoteCaptureReceiptLedgerCheckpointChain } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain.mjs";
import { createNamedRemoteCaptureReceiptLedgerCheckpointChainProof } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.mjs";
import { createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody } from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.mjs";
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA,
  appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexEntry,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.mjs";

const KEY = "phase-193-private-test-key-with-at-least-thirty-two-bytes";
const REVIEWER = "revisor-privado-193";
const PURPOSE = "confirmar custodia sem expor alegacoes";

function fixture(prefix = "atlas-custody-index-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "private"), { mode: 0o700 });
  chmodSync(join(root, "private"), 0o700);
  return root;
}

function custodySource(root, seed = "1", minute = "01") {
  const manifest = {
    schemaVersion: NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA,
    handoffIdSha256: seed.repeat(64),
    authorizationReviewSha256: "a".repeat(64),
    operationFingerprintSha256: "b".repeat(64),
    targetProjectRefSha256: "c".repeat(64),
    querySha256: "d".repeat(64),
    localFingerprintSetSha256: "e".repeat(64),
    issuedAt: "2026-08-08T20:00:00.000Z",
    expiresAt: "2026-08-09T03:00:00.000Z",
  };
  persistNamedRemoteCaptureConsumptionReceipt({
    root,
    receiptDirectory: "private/receipts",
    manifest,
    consumption: {
      ok: true,
      reason: "named_remote_capture_adapted",
      adapterReason: null,
      handoffConsumed: true,
      authorizationConsumed: true,
      consumedAt: `2026-08-08T22:${minute}:00.000Z`,
      remoteWriteExecuted: false,
      evidence: { schemaVersion: "atlas.named_remote_capture.v1", mappings: [{ status: "aligned" }] },
    },
    recordedAt: `2026-08-08T23:${minute}:00.000Z`,
  });
  const checkpoint = createNamedRemoteCaptureReceiptLedgerCheckpoint({
    root,
    receiptDirectory: "private/receipts",
    checkpointDirectory: "private/checkpoints",
    generatedAt: `2026-08-09T00:${minute}:00.000Z`,
  });
  const chain = appendNamedRemoteCaptureReceiptLedgerCheckpointChain({
    root,
    checkpointDirectory: "private/checkpoints",
    checkpointFileName: checkpoint.checkpointFileName,
    chainDirectory: `private/chain-${seed}`,
    recordedAt: `2026-08-09T01:${minute}:00.000Z`,
  });
  const proof = createNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
    root,
    checkpointDirectory: "private/checkpoints",
    chainDirectory: `private/chain-${seed}`,
    headEntryFileName: chain.entryFileName,
    proofDirectory: "private/proofs",
    generatedAt: `2026-08-09T02:${minute}:00.000Z`,
  });
  return createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
    root,
    proofDirectory: "private/proofs",
    proofFileName: proof.proofFileName,
    custodyDirectory: "private/custody",
    reviewer: REVIEWER,
    purpose: PURPOSE,
    pseudonymizationKey: KEY,
    recordedAt: `2026-08-09T03:${minute}:00.000Z`,
  });
}

function append(root, custodyFileName, previousEntryFileName = null, minute = "01") {
  return appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
    root,
    custodyDirectory: "private/custody",
    custodyFileName,
    indexDirectory: "private/custody-index",
    previousEntryFileName,
    indexedAt: `2026-08-09T04:${minute}:00.000Z`,
  });
}

function verify(root, headEntryFileName) {
  return verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
    root,
    custodyDirectory: "private/custody",
    indexDirectory: "private/custody-index",
    headEntryFileName,
  });
}

test("cria gênese criptográfica sem revelar alegações nem pseudônimos", () => {
  const root = fixture();
  try {
    const custody = custodySource(root);
    const indexed = append(root, custody.custodyFileName);
    assert.equal(indexed.ok, true);
    assert.equal(indexed.sequence, 0);
    assert.equal(indexed.previousEntrySha256, null);
    const raw = readFileSync(join(root, "private/custody-index", indexed.entryFileName), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schemaVersion, NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA);
    assert.equal(parsed.custody.custodyRecordSha256, custody.custodyRecordSha256);
    for (const forbidden of [REVIEWER, PURPOSE, KEY, "reviewerHmacSha256", "purposeHmacSha256"]) {
      assert.equal(raw.includes(forbidden), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("encadeia dois registros e verifica o índice completo", () => {
  const root = fixture();
  try {
    const firstCustody = custodySource(root, "2", "02");
    const first = append(root, firstCustody.custodyFileName, null, "02");
    const secondCustody = custodySource(root, "3", "03");
    const second = append(root, secondCustody.custodyFileName, first.entryFileName, "03");
    const checked = verify(root, second.entryFileName);
    assert.equal(checked.ok, true);
    assert.equal(checked.reason, "proof_custody_index_verified");
    assert.equal(checked.entryCount, 2);
    assert.equal(checked.sequence, 1);
    assert.deepEqual(checked.custodyRecordHashes, [secondCustody.custodyRecordSha256, firstCustody.custodyRecordSha256]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("inspeciona entrada content-addressed válida", () => {
  const root = fixture();
  try {
    const indexed = append(root, custodySource(root, "4", "04").custodyFileName, null, "04");
    const checked = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexEntry({
      root, indexDirectory: "private/custody-index", entryFileName: indexed.entryFileName,
    });
    assert.equal(checked.ok, true);
    assert.equal(checked.entrySha256, indexed.entrySha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("repetição idêntica é idempotente", () => {
  const root = fixture();
  try {
    const custody = custodySource(root, "5", "05");
    assert.equal(append(root, custody.custodyFileName, null, "05").reason, "proof_custody_index_entry_appended");
    const repeated = append(root, custody.custodyFileName, null, "05");
    assert.equal(repeated.ok, true);
    assert.equal(repeated.reason, "proof_custody_index_entry_already_exists");
    assert.equal(repeated.localIndexEntryWritten, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa indexar novamente a mesma custódia com outra alegação temporal", () => {
  const root = fixture();
  try {
    const custody = custodySource(root, "6", "06");
    append(root, custody.custodyFileName, null, "06");
    assert.equal(append(root, custody.custodyFileName, null, "07").reason, "proof_custody_index_duplicate_custody_refused");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta adulteração de entrada", () => {
  const root = fixture();
  try {
    const indexed = append(root, custodySource(root, "7", "07").custodyFileName, null, "07");
    const path = join(root, "private/custody-index", indexed.entryFileName);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.sequence = 8;
    writeFileSync(path, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    assert.equal(verify(root, indexed.entryFileName).reason, "proof_custody_index_entry_envelope_invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta custódia referenciada ausente", () => {
  const root = fixture();
  try {
    const custody = custodySource(root, "8", "08");
    const indexed = append(root, custody.custodyFileName, null, "08");
    rmSync(join(root, "private/custody", custody.custodyFileName));
    const checked = verify(root, indexed.entryFileName);
    assert.equal(checked.reason, "proof_custody_index_custody_invalid");
    assert.equal(checked.cause, "proof_custody_read_failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta entrada órfã", () => {
  const root = fixture();
  try {
    const indexed = append(root, custodySource(root, "9", "09").custodyFileName, null, "09");
    const original = JSON.parse(readFileSync(join(root, "private/custody-index", indexed.entryFileName), "utf8"));
    const orphanName = `${"f".repeat(64)}.json`;
    original.entrySha256 = "f".repeat(64);
    writeFileSync(join(root, "private/custody-index", orphanName), `${JSON.stringify(original)}\n`, { mode: 0o600 });
    assert.equal(verify(root, indexed.entryFileName).reason, "proof_custody_index_orphan_entry_detected");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa permissões amplas, symlink e escape da raiz", () => {
  const root = fixture();
  try {
    const custody = custodySource(root, "a", "10");
    const indexed = append(root, custody.custodyFileName, null, "10");
    const path = join(root, "private/custody-index", indexed.entryFileName);
    chmodSync(path, 0o644);
    assert.equal(verify(root, indexed.entryFileName).reason, "proof_custody_index_entry_mode_invalid");
    chmodSync(path, 0o600);
    symlinkSync(path, join(root, "private/custody-index", `${"e".repeat(64)}.json`));
    assert.equal(verify(root, indexed.entryFileName).reason, "proof_custody_index_unexpected_directory_entry");
    assert.equal(appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
      root,
      custodyDirectory: "private/custody",
      custodyFileName: custody.custodyFileName,
      indexDirectory: "../escape",
    }).reason, "proof_custody_index_directory_outside_root");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("entrada ausente falha fechada e sem efeitos operacionais", () => {
  const appended = appendNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex();
  const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex();
  assert.equal(appended.ok, false);
  assert.equal(verified.reason, "proof_custody_index_head_file_name_invalid");
  for (const subject of [appended, verified]) {
    for (const key of ["remoteContacted", "remoteWriteExecuted", "databaseWriteExecuted", "migrationApplied", "buildExecuted", "zipGenerated", "deployExecuted"]) {
      assert.equal(subject[key], false);
    }
  }
});

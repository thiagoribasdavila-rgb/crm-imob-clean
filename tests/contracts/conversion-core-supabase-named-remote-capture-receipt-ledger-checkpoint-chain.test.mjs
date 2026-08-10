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
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA,
  appendNamedRemoteCaptureReceiptLedgerCheckpointChain,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChain,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-checkpoint-chain-"));
  mkdirSync(join(root, "private"), { mode: 0o700 });
  chmodSync(join(root, "private"), 0o700);
  return root;
}

function manifest(seed) {
  return {
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
}

function checkpoint(root, seed, minute) {
  persistNamedRemoteCaptureConsumptionReceipt({
    root,
    receiptDirectory: "private/receipts",
    manifest: manifest(seed),
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
  return createNamedRemoteCaptureReceiptLedgerCheckpoint({
    root,
    receiptDirectory: "private/receipts",
    checkpointDirectory: "private/checkpoints",
    generatedAt: `2026-08-09T00:${minute}:00.000Z`,
  });
}

function append(root, checkpointFileName, previousEntryFileName = null, minute = "00") {
  return appendNamedRemoteCaptureReceiptLedgerCheckpointChain({
    root,
    checkpointDirectory: "private/checkpoints",
    checkpointFileName,
    chainDirectory: "private/chain",
    previousEntryFileName,
    recordedAt: `2026-08-09T01:${minute}:00.000Z`,
  });
}

function verify(root, headEntryFileName) {
  return verifyNamedRemoteCaptureReceiptLedgerCheckpointChain({
    root,
    checkpointDirectory: "private/checkpoints",
    chainDirectory: "private/chain",
    headEntryFileName,
  });
}

test("cria gênese privada vinculada ao checkpoint", () => {
  const root = fixture();
  try {
    const cp = checkpoint(root, "1", "01");
    const entry = append(root, cp.checkpointFileName);
    assert.equal(entry.ok, true);
    assert.equal(entry.sequence, 0);
    assert.equal(entry.previousEntrySha256, null);
    assert.equal(entry.checkpointSha256, cp.checkpointSha256);
    assert.equal(entry.localChainEntryWritten, true);
    assert.equal(NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA, "atlas.named_remote_capture_receipt_ledger_checkpoint_chain.v1");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("encadeia e verifica histórico completo", () => {
  const root = fixture();
  try {
    const cp1 = checkpoint(root, "2", "02");
    const first = append(root, cp1.checkpointFileName, null, "02");
    const cp2 = checkpoint(root, "3", "03");
    const second = append(root, cp2.checkpointFileName, first.entryFileName, "03");
    const checked = verify(root, second.entryFileName);
    assert.equal(checked.ok, true);
    assert.equal(checked.reason, "checkpoint_chain_verified");
    assert.equal(checked.entryCount, 2);
    assert.equal(checked.sequence, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("repetição exata da gênese é idempotente", () => {
  const root = fixture();
  try {
    const cp = checkpoint(root, "4", "04");
    const first = append(root, cp.checkpointFileName, null, "04");
    const second = append(root, cp.checkpointFileName, null, "04");
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.reason, "checkpoint_chain_entry_already_exists");
    assert.equal(second.localChainEntryWritten, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta elo anterior removido", () => {
  const root = fixture();
  try {
    const first = append(root, checkpoint(root, "5", "05").checkpointFileName, null, "05");
    const second = append(root, checkpoint(root, "6", "06").checkpointFileName, first.entryFileName, "06");
    rmSync(join(root, "private/chain", first.entryFileName));
    assert.equal(verify(root, second.entryFileName).reason, "checkpoint_chain_entry_read_failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta adulteração ou reordenação da sequência", () => {
  const root = fixture();
  try {
    const first = append(root, checkpoint(root, "7", "07").checkpointFileName, null, "07");
    const second = append(root, checkpoint(root, "8", "08").checkpointFileName, first.entryFileName, "08");
    const path = join(root, "private/chain", second.entryFileName);
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.sequence = 4;
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
    assert.equal(verify(root, second.entryFileName).reason, "checkpoint_chain_entry_hash_mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta entrada órfã fora do head declarado", () => {
  const root = fixture();
  try {
    const first = append(root, checkpoint(root, "9", "09").checkpointFileName, null, "09");
    const original = join(root, "private/chain", first.entryFileName);
    const orphanName = `${"f".repeat(64)}.json`;
    const orphan = JSON.parse(readFileSync(original, "utf8"));
    orphan.entrySha256 = "f".repeat(64);
    writeFileSync(join(root, "private/chain", orphanName), `${JSON.stringify(orphan, null, 2)}\n`, { mode: 0o600 });
    chmodSync(join(root, "private/chain", orphanName), 0o600);
    assert.equal(verify(root, first.entryFileName).reason, "checkpoint_chain_orphan_entry_detected");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta checkpoint referenciado ausente", () => {
  const root = fixture();
  try {
    const cp = checkpoint(root, "a", "10");
    const first = append(root, cp.checkpointFileName, null, "10");
    rmSync(join(root, "private/checkpoints", cp.checkpointFileName));
    const checked = verify(root, first.entryFileName);
    assert.equal(checked.reason, "checkpoint_chain_checkpoint_invalid");
    assert.equal(checked.cause, "checkpoint_read_failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa permissões amplas, symlink e escape da raiz", () => {
  const root = fixture();
  const outside = fixture();
  try {
    const cp = checkpoint(root, "b", "11");
    const first = append(root, cp.checkpointFileName, null, "11");
    const path = join(root, "private/chain", first.entryFileName);
    chmodSync(path, 0o644);
    assert.equal(verify(root, first.entryFileName).reason, "checkpoint_chain_entry_mode_invalid");
    chmodSync(path, 0o600);
    const linked = `${"e".repeat(64)}.json`;
    symlinkSync(path, join(root, "private/chain", linked));
    assert.equal(verify(root, linked).reason, "checkpoint_chain_unexpected_directory_entry");
    const escaped = appendNamedRemoteCaptureReceiptLedgerCheckpointChain({
      root,
      checkpointDirectory: "private/checkpoints",
      checkpointFileName: cp.checkpointFileName,
      chainDirectory: outside,
    });
    assert.equal(escaped.reason, "checkpoint_chain_directory_outside_root");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("recusa colisão de arquivo sem sobrescrever", () => {
  const root = fixture();
  try {
    const cp = checkpoint(root, "c", "12");
    const first = append(root, cp.checkpointFileName, null, "12");
    const path = join(root, "private/chain", first.entryFileName);
    writeFileSync(path, "{}\n", { mode: 0o600 });
    chmodSync(path, 0o600);
    const collision = append(root, cp.checkpointFileName, null, "12");
    assert.equal(collision.reason, "checkpoint_chain_entry_collision_refused");
    assert.equal(readFileSync(path, "utf8"), "{}\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("entrada inválida falha fechada e sem efeitos operacionais", () => {
  const invalid = appendNamedRemoteCaptureReceiptLedgerCheckpointChain({ recordedAt: "invalid" });
  const missing = verifyNamedRemoteCaptureReceiptLedgerCheckpointChain();
  assert.equal(invalid.reason, "checkpoint_chain_recorded_at_invalid");
  assert.equal(missing.reason, "checkpoint_chain_head_file_name_invalid");
  for (const subject of [invalid, missing]) {
    for (const key of ["remoteContacted", "remoteWriteExecuted", "databaseWriteExecuted", "migrationApplied", "buildExecuted", "zipGenerated", "deployExecuted"]) {
      assert.equal(subject[key], false);
    }
  }
});

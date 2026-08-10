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
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA,
  createNamedRemoteCaptureReceiptLedgerCheckpoint,
  verifyNamedRemoteCaptureReceiptLedgerCheckpoint,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint.mjs";

const GENERATED_AT = "2026-08-08T23:30:00.000Z";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-ledger-checkpoint-"));
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
    issuedAt: "2026-08-08T22:00:00.000Z",
    expiresAt: "2026-08-08T23:45:00.000Z",
  };
}

function persist(root, seed, accepted = true) {
  return persistNamedRemoteCaptureConsumptionReceipt({
    root,
    receiptDirectory: "private/receipts",
    manifest: manifest(seed),
    consumption: {
      ok: accepted,
      reason: accepted ? "named_remote_capture_adapted" : "named_remote_capture_rejected",
      adapterReason: accepted ? null : "capture_contract_invalid",
      handoffConsumed: true,
      authorizationConsumed: true,
      consumedAt: "2026-08-08T22:30:00.000Z",
      remoteWriteExecuted: false,
      evidence: accepted ? {
        schemaVersion: "atlas.named_remote_capture.v1",
        mappings: [{ status: "aligned" }],
      } : undefined,
    },
    recordedAt: accepted
      ? "2026-08-08T23:00:00.000Z"
      : "2026-08-08T23:01:00.000Z",
  });
}

function create(root) {
  return createNamedRemoteCaptureReceiptLedgerCheckpoint({
    root,
    receiptDirectory: "private/receipts",
    checkpointDirectory: "private/checkpoints",
    generatedAt: GENERATED_AT,
  });
}

test("cria checkpoint privado imutável com resumo seguro", () => {
  const root = fixture();
  try {
    persist(root, "1", true);
    persist(root, "2", false);
    const created = create(root);
    assert.equal(created.ok, true);
    assert.equal(created.reason, "receipt_ledger_checkpoint_created");
    assert.equal(created.localCheckpointWritten, true);
    assert.deepEqual(created.summary, {
      receiptCount: 2,
      acceptedCount: 1,
      rejectedCount: 1,
      firstRecordedAt: "2026-08-08T23:00:00.000Z",
      lastRecordedAt: "2026-08-08T23:01:00.000Z",
    });
    assert.match(created.checkpointFileName, /^[a-f0-9]{64}\.json$/);
    const raw = readFileSync(join(root, "private/checkpoints", created.checkpointFileName), "utf8");
    assert.equal(JSON.stringify(created).includes("mappings"), false);
    assert.equal(raw.includes("mappings"), false);
    assert.equal(
      NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA,
      "atlas.named_remote_capture_receipt_ledger_checkpoint.v1",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repetição idêntica é idempotente e não sobrescreve", () => {
  const root = fixture();
  try {
    persist(root, "3");
    const first = create(root);
    const second = create(root);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.reason, "receipt_ledger_checkpoint_already_exists");
    assert.equal(second.localCheckpointWritten, false);
    assert.equal(second.checkpointSha256, first.checkpointSha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("verifica checkpoint contra o ledger atual", () => {
  const root = fixture();
  try {
    persist(root, "4");
    const created = create(root);
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpoint({
      root,
      receiptDirectory: "private/receipts",
      checkpointDirectory: "private/checkpoints",
      checkpointFileName: created.checkpointFileName,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.reason, "receipt_ledger_checkpoint_verified");
    assert.equal(verified.currentLedgerMatched, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detecta alteração posterior do ledger", () => {
  const root = fixture();
  try {
    persist(root, "5");
    const created = create(root);
    persist(root, "6");
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpoint({
      root,
      receiptDirectory: "private/receipts",
      checkpointDirectory: "private/checkpoints",
      checkpointFileName: created.checkpointFileName,
    });
    assert.equal(verified.ok, false);
    assert.equal(verified.reason, "checkpoint_current_ledger_mismatch");
    assert.match(verified.currentLedgerSha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detecta adulteração do checkpoint", () => {
  const root = fixture();
  try {
    persist(root, "7");
    const created = create(root);
    const path = join(root, "private/checkpoints", created.checkpointFileName);
    const checkpoint = JSON.parse(readFileSync(path, "utf8"));
    checkpoint.ledger.receiptCount = 9;
    writeFileSync(path, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
    const verified = verifyNamedRemoteCaptureReceiptLedgerCheckpoint({
      root,
      receiptDirectory: "private/receipts",
      checkpointDirectory: "private/checkpoints",
      checkpointFileName: created.checkpointFileName,
    });
    assert.equal(verified.ok, false);
    assert.ok([
      "checkpoint_ledger_summary_invalid",
      "checkpoint_hash_mismatch",
    ].includes(verified.reason));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recusa arquivo com permissão ampla e symlink", () => {
  const root = fixture();
  try {
    persist(root, "8");
    const created = create(root);
    const path = join(root, "private/checkpoints", created.checkpointFileName);
    chmodSync(path, 0o644);
    const broad = verifyNamedRemoteCaptureReceiptLedgerCheckpoint({
      root,
      receiptDirectory: "private/receipts",
      checkpointDirectory: "private/checkpoints",
      checkpointFileName: created.checkpointFileName,
    });
    assert.equal(broad.reason, "checkpoint_file_mode_invalid");
    chmodSync(path, 0o600);
    const linkedName = `${"f".repeat(64)}.json`;
    symlinkSync(path, join(root, "private/checkpoints", linkedName));
    const linked = verifyNamedRemoteCaptureReceiptLedgerCheckpoint({
      root,
      receiptDirectory: "private/receipts",
      checkpointDirectory: "private/checkpoints",
      checkpointFileName: linkedName,
    });
    assert.equal(linked.reason, "checkpoint_path_symlink_refused");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("recusa diretório inseguro ou fora da raiz", () => {
  const root = fixture();
  const outside = fixture();
  try {
    persist(root, "9");
    const external = createNamedRemoteCaptureReceiptLedgerCheckpoint({
      root,
      receiptDirectory: "private/receipts",
      checkpointDirectory: outside,
      generatedAt: GENERATED_AT,
    });
    assert.equal(external.reason, "checkpoint_directory_outside_root");
    symlinkSync(outside, join(root, "private/checkpoints"));
    const escaped = create(root);
    assert.equal(escaped.reason, "checkpoint_directory_invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("recusa colisão sem sobrescrever conteúdo existente", () => {
  const root = fixture();
  try {
    persist(root, "a");
    const created = create(root);
    const path = join(root, "private/checkpoints", created.checkpointFileName);
    writeFileSync(path, "{}\n", { mode: 0o600 });
    chmodSync(path, 0o600);
    const collision = create(root);
    assert.equal(collision.ok, false);
    assert.equal(collision.reason, "checkpoint_collision_refused");
    assert.equal(readFileSync(path, "utf8"), "{}\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entrada ausente ou inválida falha fechada sem efeitos operacionais", () => {
  const root = fixture();
  try {
    const invalid = createNamedRemoteCaptureReceiptLedgerCheckpoint({
      root,
      generatedAt: "invalid",
    });
    assert.equal(invalid.reason, "checkpoint_generated_at_invalid");
    const missing = verifyNamedRemoteCaptureReceiptLedgerCheckpoint();
    assert.equal(missing.reason, "checkpoint_file_name_invalid");
    for (const subject of [invalid, missing]) {
      for (const key of [
        "remoteContacted",
        "remoteWriteExecuted",
        "databaseWriteExecuted",
        "migrationApplied",
        "buildExecuted",
        "zipGenerated",
        "deployExecuted",
      ]) assert.equal(subject[key], false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

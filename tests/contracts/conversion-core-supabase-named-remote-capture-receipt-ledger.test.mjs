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
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_SCHEMA,
  verifyNamedRemoteCaptureReceiptLedger,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger.mjs";

const NOW = new Date("2026-08-08T23:00:00.000Z");

function fixture() {
  return mkdtempSync(join(tmpdir(), "atlas-receipt-ledger-"));
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
    expiresAt: "2026-08-08T23:30:00.000Z",
  };
}

function consumption(ok = true) {
  return {
    ok,
    reason: ok ? "named_remote_capture_adapted" : "named_remote_capture_rejected",
    adapterReason: ok ? null : "capture_contract_invalid",
    handoffConsumed: true,
    authorizationConsumed: true,
    consumedAt: "2026-08-08T22:30:00.000Z",
    remoteWriteExecuted: false,
    evidence: ok ? {
      schemaVersion: "atlas.named_remote_capture.v1",
      mappings: [{ status: "aligned" }],
    } : undefined,
  };
}

function persist(root, seed, ok = true, recordedAt = NOW) {
  return persistNamedRemoteCaptureConsumptionReceipt({
    root,
    receiptDirectory: "private/receipts",
    manifest: manifest(seed),
    consumption: consumption(ok),
    recordedAt,
  });
}

test("verifica conjunto íntegro e produz resumo sem evidência bruta", () => {
  const root = fixture();
  try {
    persist(root, "1", true, "2026-08-08T23:00:00.000Z");
    persist(root, "2", false, "2026-08-08T23:01:00.000Z");
    const verified = verifyNamedRemoteCaptureReceiptLedger({
      root,
      receiptDirectory: "private/receipts",
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.reason, "receipt_ledger_integrity_verified");
    assert.deepEqual(verified.summary, {
      receiptCount: 2,
      acceptedCount: 1,
      rejectedCount: 1,
      firstRecordedAt: "2026-08-08T23:00:00.000Z",
      lastRecordedAt: "2026-08-08T23:01:00.000Z",
    });
    assert.match(verified.ledgerSha256, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(verified).includes("mappings"), false);
    assert.equal(NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_SCHEMA, "atlas.named_remote_capture_receipt_ledger.v1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replay com hash esperado é determinístico", () => {
  const root = fixture();
  try {
    persist(root, "3");
    const first = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: "private/receipts" });
    const replay = verifyNamedRemoteCaptureReceiptLedger({
      root,
      receiptDirectory: "private/receipts",
      expectedLedgerSha256: first.ledgerSha256,
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.reason, "receipt_ledger_replay_verified");
    assert.equal(replay.deterministicReplayVerified, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replay detecta inclusão posterior sem revelar o registro", () => {
  const root = fixture();
  try {
    persist(root, "4");
    const first = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: "private/receipts" });
    persist(root, "5");
    const replay = verifyNamedRemoteCaptureReceiptLedger({
      root,
      receiptDirectory: "private/receipts",
      expectedLedgerSha256: first.ledgerSha256,
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.reason, "receipt_ledger_replay_mismatch");
    assert.match(replay.ledgerSha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("adulteração do conteúdo é bloqueada pelo hash interno", () => {
  const root = fixture();
  try {
    const persisted = persist(root, "6");
    const receipt = JSON.parse(readFileSync(persisted.receiptPath, "utf8"));
    receipt.outcome.reason = "altered";
    writeFileSync(persisted.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    chmodSync(persisted.receiptPath, 0o600);
    const verified = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: "private/receipts" });
    assert.equal(verified.ok, false);
    assert.equal(verified.reason, "receipt_hash_mismatch");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("arquivo com permissão ampla é recusado", () => {
  const root = fixture();
  try {
    const persisted = persist(root, "7");
    chmodSync(persisted.receiptPath, 0o644);
    const verified = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: "private/receipts" });
    assert.equal(verified.ok, false);
    assert.equal(verified.reason, "receipt_file_mode_invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("entrada inesperada e symlink de recibo são recusados", () => {
  const root = fixture();
  try {
    persist(root, "8");
    writeFileSync(join(root, "private/receipts", "notes.txt"), "unsafe");
    const unexpected = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: "private/receipts" });
    assert.equal(unexpected.reason, "receipt_ledger_unexpected_entry");
    rmSync(join(root, "private/receipts", "notes.txt"));
    symlinkSync(join(root, "private/receipts", `${"8".repeat(64)}.json`), join(root, "private/receipts", `${"9".repeat(64)}.json`));
    const symlink = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: "private/receipts" });
    assert.equal(symlink.reason, "receipt_ledger_unexpected_entry");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("diretório externo e escape físico são recusados", () => {
  const root = fixture();
  const outside = fixture();
  try {
    const external = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: outside });
    assert.equal(external.reason, "receipt_ledger_directory_outside_root");
    mkdirSync(join(root, "private"), { recursive: true });
    symlinkSync(outside, join(root, "private", "receipts"));
    const escaped = verifyNamedRemoteCaptureReceiptLedger({ root, receiptDirectory: "private/receipts" });
    assert.equal(escaped.reason, "receipt_ledger_directory_symlink_escape");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("limites e hash esperado inválido falham fechados sem efeitos remotos", () => {
  const root = fixture();
  try {
    persist(root, "a");
    const invalidHash = verifyNamedRemoteCaptureReceiptLedger({
      root,
      receiptDirectory: "private/receipts",
      expectedLedgerSha256: "invalid",
    });
    assert.equal(invalidHash.reason, "receipt_ledger_expected_hash_invalid");
    const exceeded = verifyNamedRemoteCaptureReceiptLedger({
      root,
      receiptDirectory: "private/receipts",
      maxReceipts: 0,
    });
    assert.equal(exceeded.reason, "receipt_ledger_limit_invalid");
    for (const key of ["remoteContacted", "remoteWriteExecuted", "migrationApplied", "buildExecuted", "zipGenerated", "deployExecuted"]) {
      assert.equal(invalidHash[key], false);
      assert.equal(exceeded[key], false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

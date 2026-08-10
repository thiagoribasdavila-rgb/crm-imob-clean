import assert from "node:assert/strict";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA } from "../../lib/testing/supabase-named-remote-capture-handoff.mjs";
import {
  NAMED_REMOTE_CAPTURE_CONSUMPTION_RECEIPT_SCHEMA,
  buildNamedRemoteCaptureConsumptionReceipt,
  persistNamedRemoteCaptureConsumptionReceipt,
} from "../../lib/testing/supabase-named-remote-capture-consumption-receipt.mjs";

const RECORDED_AT = new Date("2026-08-08T22:00:00.000Z");

function fixture() {
  return mkdtempSync(join(tmpdir(), "atlas-consumption-receipt-"));
}

function manifest(overrides = {}) {
  return {
    schemaVersion: NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA,
    handoffIdSha256: "1".repeat(64),
    authorizationReviewSha256: "2".repeat(64),
    operationFingerprintSha256: "3".repeat(64),
    targetProjectRefSha256: "4".repeat(64),
    querySha256: "5".repeat(64),
    localFingerprintSetSha256: "6".repeat(64),
    issuedAt: "2026-08-08T21:58:00.000Z",
    expiresAt: "2026-08-08T22:01:00.000Z",
    ...overrides,
  };
}

function consumption(overrides = {}) {
  return {
    ok: true,
    reason: "handoff_consumed_capture_adapted",
    handoffConsumed: true,
    authorizationConsumed: true,
    consumedAt: "2026-08-08T21:59:00.000Z",
    remoteWriteExecuted: false,
    evidence: {
      schemaVersion: "atlas.supabase_named_remote_evidence.v1",
      mappings: [{ logicalName: "first" }, { logicalName: "second" }],
      rawSecret: "must-never-be-persisted",
      sql: "select private_payload from remote_table",
    },
    ...overrides,
  };
}

test("recibo aceito persiste somente resumo seguro com modo privado", () => {
  const root = fixture();
  try {
    const result = persistNamedRemoteCaptureConsumptionReceipt({
      root,
      receiptDirectory: ".atlas/receipts",
      manifest: manifest(),
      consumption: consumption(),
      recordedAt: RECORDED_AT,
      randomBytesFn: () => Buffer.alloc(16, 7),
    });
    assert.equal(result.ok, true);
    assert.equal(result.receiptPersisted, true);
    assert.equal(result.idempotentReplay, false);
    assert.equal(result.receipt.schemaVersion, NAMED_REMOTE_CAPTURE_CONSUMPTION_RECEIPT_SCHEMA);
    assert.equal(result.receipt.outcome.evidenceSummary.mappingCount, 2);
    assert.equal(lstatSync(result.receiptPath).mode & 0o777, 0o600);
    const payload = readFileSync(result.receiptPath, "utf8");
    assert.doesNotMatch(payload, /must-never-be-persisted|private_payload|remote_table/);
    assert.equal(result.remoteContacted, false);
    assert.equal(result.remoteWriteExecuted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repetição byte a byte é idempotente e não cria novo efeito", () => {
  const root = fixture();
  try {
    const input = {
      root,
      receiptDirectory: ".atlas/receipts",
      manifest: manifest(),
      consumption: consumption(),
      recordedAt: RECORDED_AT,
    };
    const first = persistNamedRemoteCaptureConsumptionReceipt(input);
    const replay = persistNamedRemoteCaptureConsumptionReceipt(input);
    assert.equal(first.reason, "consumption_receipt_persisted");
    assert.equal(replay.reason, "consumption_receipt_already_persisted");
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.receiptPath, first.receiptPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mesmo handoff com conteúdo diferente falha por conflito imutável", () => {
  const root = fixture();
  try {
    const base = {
      root,
      receiptDirectory: ".atlas/receipts",
      manifest: manifest(),
      consumption: consumption(),
      recordedAt: RECORDED_AT,
    };
    assert.equal(persistNamedRemoteCaptureConsumptionReceipt(base).ok, true);
    const conflict = persistNamedRemoteCaptureConsumptionReceipt({
      ...base,
      recordedAt: new Date("2026-08-08T22:00:01.000Z"),
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.reason, "consumption_receipt_conflict");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("handoff ainda não consumido não produz recibo", () => {
  const result = buildNamedRemoteCaptureConsumptionReceipt({
    manifest: manifest(),
    consumption: consumption({ handoffConsumed: false }),
    recordedAt: RECORDED_AT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "consumption_receipt_requires_consumed_handoff");
  assert.equal(result.receiptPersisted, false);
});

test("captura rejeitada gera recibo de rejeição sem carregar evidência bruta", () => {
  const result = buildNamedRemoteCaptureConsumptionReceipt({
    manifest: manifest(),
    consumption: consumption({
      ok: false,
      reason: "handoff_consumed_capture_rejected",
      adapterReason: "named_remote_capture_invalid",
      evidence: { secret: "never" },
    }),
    recordedAt: RECORDED_AT,
  });
  assert.equal(result.ok, true);
  assert.equal(result.receipt.status, "consumed_capture_rejected");
  assert.equal(result.receipt.outcome.evidenceSummary, null);
  assert.doesNotMatch(JSON.stringify(result.receipt), /never/);
});

test("diretório fora da raiz é recusado", () => {
  const root = fixture();
  try {
    const result = persistNamedRemoteCaptureConsumptionReceipt({
      root,
      receiptDirectory: "../outside",
      manifest: manifest(),
      consumption: consumption(),
      recordedAt: RECORDED_AT,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "consumption_receipt_directory_outside_root");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("escape físico por symlink e arquivo final inseguro são recusados", () => {
  const root = fixture();
  const outside = fixture();
  try {
    symlinkSync(outside, join(root, "escape"));
    const escaped = persistNamedRemoteCaptureConsumptionReceipt({
      root,
      receiptDirectory: "escape",
      manifest: manifest(),
      consumption: consumption(),
      recordedAt: RECORDED_AT,
    });
    assert.equal(escaped.reason, "consumption_receipt_directory_symlink_escape");

    mkdirSync(join(root, "safe"));
    const finalPath = join(root, "safe", `${manifest().handoffIdSha256}.json`);
    mkdirSync(finalPath);
    chmodSync(finalPath, 0o700);
    const unsafe = persistNamedRemoteCaptureConsumptionReceipt({
      root,
      receiptDirectory: "safe",
      manifest: manifest(),
      consumption: consumption(),
      recordedAt: RECORDED_AT,
    });
    assert.equal(unsafe.reason, "consumption_receipt_existing_path_unsafe");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("manifesto adulterado e códigos livres não vazam para o recibo", () => {
  const invalid = buildNamedRemoteCaptureConsumptionReceipt({
    manifest: manifest({ querySha256: "invalid" }),
    consumption: consumption(),
    recordedAt: RECORDED_AT,
  });
  assert.equal(invalid.reason, "consumption_receipt_manifest_invalid");

  const sanitized = buildNamedRemoteCaptureConsumptionReceipt({
    manifest: manifest(),
    consumption: consumption({ reason: "token=super-secret", adapterReason: "raw secret" }),
    recordedAt: RECORDED_AT,
  });
  assert.equal(sanitized.receipt.outcome.reason, "unclassified");
  assert.equal(sanitized.receipt.outcome.adapterReason, "unclassified");
  assert.doesNotMatch(JSON.stringify(sanitized.receipt), /super-secret|raw secret/);
});

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
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA,
  createNamedRemoteCaptureReceiptLedgerCheckpointChainProof,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofAgainstSource,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-chain-proof-"));
  mkdirSync(join(root, "private"), { mode: 0o700 });
  chmodSync(join(root, "private"), 0o700);
  return root;
}

function source(root) {
  const manifest = {
    schemaVersion: NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA,
    handoffIdSha256: "1".repeat(64),
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
      consumedAt: "2026-08-08T22:00:00.000Z",
      remoteWriteExecuted: false,
      evidence: { schemaVersion: "atlas.named_remote_capture.v1", mappings: [{ status: "aligned" }] },
    },
    recordedAt: "2026-08-08T23:00:00.000Z",
  });
  const checkpoint = createNamedRemoteCaptureReceiptLedgerCheckpoint({
    root,
    receiptDirectory: "private/receipts",
    checkpointDirectory: "private/checkpoints",
    generatedAt: "2026-08-09T00:00:00.000Z",
  });
  const chain = appendNamedRemoteCaptureReceiptLedgerCheckpointChain({
    root,
    checkpointDirectory: "private/checkpoints",
    checkpointFileName: checkpoint.checkpointFileName,
    chainDirectory: "private/chain",
    recordedAt: "2026-08-09T01:00:00.000Z",
  });
  return { checkpoint, chain };
}

function create(root, chain) {
  return createNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
    root,
    checkpointDirectory: "private/checkpoints",
    chainDirectory: "private/chain",
    headEntryFileName: chain.entryFileName,
    proofDirectory: "private/proofs",
    generatedAt: "2026-08-09T02:00:00.000Z",
  });
}

test("cria prova portátil redigida e privada", () => {
  const root = fixture();
  try {
    const { chain } = source(root);
    const proof = create(root, chain);
    assert.equal(proof.ok, true);
    assert.equal(proof.localProofWritten, true);
    const raw = readFileSync(join(root, "private/proofs", proof.proofFileName), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schemaVersion, NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA);
    assert.equal(parsed.chain.entryCount, 1);
    for (const forbidden of ["named_remote_capture_adapted", "authorizationReviewSha256", "querySha256", "mappings"]) {
      assert.equal(raw.includes(forbidden), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("verifica prova isoladamente e contra a cadeia fonte", () => {
  const root = fixture();
  try {
    const { chain } = source(root);
    const proof = create(root, chain);
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
      root, proofDirectory: "private/proofs", proofFileName: proof.proofFileName,
    }).ok, true);
    const matched = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofAgainstSource({
      root,
      proofDirectory: "private/proofs",
      proofFileName: proof.proofFileName,
      checkpointDirectory: "private/checkpoints",
      chainDirectory: "private/chain",
      headEntryFileName: chain.entryFileName,
    });
    assert.equal(matched.ok, true);
    assert.equal(matched.sourceChainMatched, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("repetição idêntica é idempotente", () => {
  const root = fixture();
  try {
    const { chain } = source(root);
    assert.equal(create(root, chain).reason, "checkpoint_chain_proof_created");
    const repeated = create(root, chain);
    assert.equal(repeated.ok, true);
    assert.equal(repeated.reason, "checkpoint_chain_proof_already_exists");
    assert.equal(repeated.localProofWritten, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta adulteração do conteúdo", () => {
  const root = fixture();
  try {
    const { chain } = source(root);
    const proof = create(root, chain);
    const path = join(root, "private/proofs", proof.proofFileName);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.chain.entryCount = 2;
    writeFileSync(path, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
      root, proofDirectory: "private/proofs", proofFileName: proof.proofFileName,
    }).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta divergência da cadeia fonte", () => {
  const root = fixture();
  try {
    const { checkpoint, chain } = source(root);
    const proof = create(root, chain);
    const second = appendNamedRemoteCaptureReceiptLedgerCheckpointChain({
      root,
      checkpointDirectory: "private/checkpoints",
      checkpointFileName: checkpoint.checkpointFileName,
      chainDirectory: "private/chain",
      previousEntryFileName: chain.entryFileName,
      recordedAt: "2026-08-09T01:01:00.000Z",
    });
    const compared = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofAgainstSource({
      root,
      proofDirectory: "private/proofs",
      proofFileName: proof.proofFileName,
      checkpointDirectory: "private/checkpoints",
      chainDirectory: "private/chain",
      headEntryFileName: second.entryFileName,
    });
    assert.equal(compared.ok, false);
    assert.equal(compared.reason, "checkpoint_chain_proof_source_mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa permissão ampla e symlink", () => {
  const root = fixture();
  try {
    const { chain } = source(root);
    const proof = create(root, chain);
    const path = join(root, "private/proofs", proof.proofFileName);
    chmodSync(path, 0o644);
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
      root, proofDirectory: "private/proofs", proofFileName: proof.proofFileName,
    }).reason, "checkpoint_chain_proof_file_mode_invalid");
    chmodSync(path, 0o600);
    symlinkSync(path, join(root, "private/proofs", `${"f".repeat(64)}.json`));
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
      root, proofDirectory: "private/proofs", proofFileName: `${"f".repeat(64)}.json`,
    }).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa diretório fora da raiz", () => {
  const root = fixture();
  try {
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
      root, proofDirectory: "../escape", proofFileName: `${"a".repeat(64)}.json`,
    }).reason, "checkpoint_chain_proof_directory_outside_root");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("entrada ausente falha fechada sem efeitos operacionais", () => {
  const blocked = createNamedRemoteCaptureReceiptLedgerCheckpointChainProof();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.localProofWritten, false);
  assert.equal(blocked.remoteContacted, false);
  assert.equal(blocked.databaseWriteExecuted, false);
  assert.equal(blocked.buildExecuted, false);
  assert.equal(blocked.zipGenerated, false);
  assert.equal(blocked.deployExecuted, false);
});

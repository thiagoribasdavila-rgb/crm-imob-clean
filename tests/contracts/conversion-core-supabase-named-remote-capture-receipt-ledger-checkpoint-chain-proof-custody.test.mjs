import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
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
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA,
  createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyAgainstProof,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyClaim,
} from "../../lib/testing/supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody.mjs";

const KEY = "phase-192-local-pseudonymization-key-at-least-32-bytes";
const REVIEWER = "revisor-interno-17";
const PURPOSE = "homologar a integridade local da cadeia";

function fixture(prefix = "atlas-proof-custody-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, "private"), { mode: 0o700 });
  chmodSync(join(root, "private"), 0o700);
  return root;
}

function proofSource(root, seed = "1") {
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
  return createNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
    root,
    checkpointDirectory: "private/checkpoints",
    chainDirectory: "private/chain",
    headEntryFileName: chain.entryFileName,
    proofDirectory: "private/proofs",
    generatedAt: "2026-08-09T02:00:00.000Z",
  });
}

function custody(root, proof, overrides = {}) {
  return createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
    root,
    proofDirectory: "private/proofs",
    proofFileName: proof.proofFileName,
    custodyDirectory: "private/custody",
    reviewer: REVIEWER,
    purpose: PURPOSE,
    pseudonymizationKey: KEY,
    recordedAt: "2026-08-09T03:00:00.000Z",
    ...overrides,
  });
}

test("registra custódia privada sem revisor, finalidade ou chave em texto claro", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    const record = custody(root, proof);
    assert.equal(record.ok, true);
    assert.equal(record.localCustodyWritten, true);
    const raw = readFileSync(join(root, "private/custody", record.custodyFileName), "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.schemaVersion, NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA);
    assert.equal(parsed.sourceProof.proofSha256, proof.proofSha256);
    for (const forbidden of [REVIEWER, PURPOSE, KEY, "named_remote_capture_adapted", "authorizationReviewSha256"]) {
      assert.equal(raw.includes(forbidden), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("inspeciona custódia e confirma vínculo com a prova", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    const record = custody(root, proof);
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
      root, custodyDirectory: "private/custody", custodyFileName: record.custodyFileName,
    }).ok, true);
    const matched = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyAgainstProof({
      root,
      custodyDirectory: "private/custody",
      custodyFileName: record.custodyFileName,
      proofDirectory: "private/proofs",
      proofFileName: proof.proofFileName,
    });
    assert.equal(matched.ok, true);
    assert.equal(matched.sourceProofMatched, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("confirma alegação correta sem revelar os valores pseudonimizados", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    const record = custody(root, proof);
    const matched = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyClaim({
      root,
      custodyDirectory: "private/custody",
      custodyFileName: record.custodyFileName,
      reviewer: REVIEWER,
      purpose: PURPOSE,
      pseudonymizationKey: KEY,
    });
    assert.equal(matched.ok, true);
    assert.equal(matched.claimMatched, true);
    assert.equal("reviewer" in matched, false);
    assert.equal("purpose" in matched, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("alegação incorreta falha fechada", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    const record = custody(root, proof);
    for (const variation of [
      { reviewer: "outro-revisor", purpose: PURPOSE, pseudonymizationKey: KEY },
      { reviewer: REVIEWER, purpose: "outra finalidade", pseudonymizationKey: KEY },
      { reviewer: REVIEWER, purpose: PURPOSE, pseudonymizationKey: `${KEY}-diferente` },
    ]) {
      const checked = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyClaim({
        root, custodyDirectory: "private/custody", custodyFileName: record.custodyFileName, ...variation,
      });
      assert.equal(checked.ok, false);
      assert.equal(checked.reason, "proof_custody_claim_mismatch");
      assert.equal(checked.claimMatched, false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("repetição idêntica é idempotente", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    assert.equal(custody(root, proof).reason, "proof_custody_created");
    const repeated = custody(root, proof);
    assert.equal(repeated.ok, true);
    assert.equal(repeated.reason, "proof_custody_already_exists");
    assert.equal(repeated.localCustodyWritten, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta adulteração do registro", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    const record = custody(root, proof);
    const path = join(root, "private/custody", record.custodyFileName);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.sourceProof.entryCount += 1;
    writeFileSync(path, `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
      root, custodyDirectory: "private/custody", custodyFileName: record.custodyFileName,
    }).reason, "proof_custody_hash_mismatch");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detecta prova fonte divergente", () => {
  const root = fixture();
  const otherRoot = fixture("atlas-other-proof-");
  try {
    const proof = proofSource(root, "1");
    const record = custody(root, proof);
    const other = proofSource(otherRoot, "2");
    mkdirSync(join(root, "private/other-proofs"), { mode: 0o700 });
    copyFileSync(
      join(otherRoot, "private/proofs", other.proofFileName),
      join(root, "private/other-proofs", other.proofFileName),
    );
    chmodSync(join(root, "private/other-proofs", other.proofFileName), 0o600);
    const compared = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyAgainstProof({
      root,
      custodyDirectory: "private/custody",
      custodyFileName: record.custodyFileName,
      proofDirectory: "private/other-proofs",
      proofFileName: other.proofFileName,
    });
    assert.equal(compared.ok, false);
    assert.equal(compared.reason, "proof_custody_source_proof_mismatch");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(otherRoot, { recursive: true, force: true });
  }
});

test("recusa permissão ampla e symlink", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    const record = custody(root, proof);
    const path = join(root, "private/custody", record.custodyFileName);
    chmodSync(path, 0o644);
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
      root, custodyDirectory: "private/custody", custodyFileName: record.custodyFileName,
    }).reason, "proof_custody_file_mode_invalid");
    chmodSync(path, 0o600);
    symlinkSync(path, join(root, "private/custody", `${"f".repeat(64)}.json`));
    assert.equal(inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
      root, custodyDirectory: "private/custody", custodyFileName: `${"f".repeat(64)}.json`,
    }).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("recusa diretório externo, alegações vazias e chave fraca", () => {
  const root = fixture();
  try {
    const proof = proofSource(root);
    assert.equal(custody(root, proof, { custodyDirectory: "../escape" }).reason, "proof_custody_directory_outside_root");
    assert.equal(custody(root, proof, { reviewer: " " }).reason, "proof_custody_reviewer_invalid");
    assert.equal(custody(root, proof, { purpose: "" }).reason, "proof_custody_purpose_invalid");
    assert.equal(custody(root, proof, { pseudonymizationKey: "fraca" }).reason, "proof_custody_pseudonymization_key_invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("entrada ausente falha fechada sem efeitos operacionais", () => {
  const blocked = createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.localCustodyWritten, false);
  assert.equal(blocked.remoteContacted, false);
  assert.equal(blocked.databaseWriteExecuted, false);
  assert.equal(blocked.buildExecuted, false);
  assert.equal(blocked.zipGenerated, false);
  assert.equal(blocked.deployExecuted, false);
});

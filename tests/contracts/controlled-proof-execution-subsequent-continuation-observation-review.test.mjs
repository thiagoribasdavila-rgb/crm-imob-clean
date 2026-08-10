import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
  createControlledProofExecutionSubsequentContinuationObservationReviewMemory,
  createControlledProofExecutionSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt,
  reviewControlledProofExecutionSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation-review.mjs";
import {
  observeControlledProofExecutionSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation.mjs";
import {
  fixture as observationFixture,
  subsequentContinuationObservationArguments,
  subsequentContinuationObservationPolicyContext,
} from "./controlled-proof-execution-subsequent-continuation-observation.test.mjs";

function reviewerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-subsequent-continuation-observation-reviewer-key-one",
    actorId: "controlled-proof-execution-subsequent-continuation-observation-reviewer-one",
    role: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:39:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function subsequentContinuationObservationReviewPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationPolicy,
    controlledProofExecutionSubsequentContinuationObservationPolicyContext:
      subsequentContinuationObservationPolicyContext(subject),
    trustedSubsequentContinuationObservationReviewers: [
      subject.subsequentContinuationObservationReviewer.descriptor,
    ],
    maximumSubsequentContinuationObservationReviewDelaySeconds: 900,
    minimumSubsequentContinuationObservationReviewReasonLength: 12,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await observationFixture();
  const observed = observeControlledProofExecutionSubsequentContinuation(
    subsequentContinuationObservationArguments(subject),
  );
  const reviewerKeys = generateKeyPairSync("ed25519");
  const subsequentContinuationObservationReviewer = {
    privateKey: reviewerKeys.privateKey,
    descriptor: reviewerDescriptor(reviewerKeys),
  };
  const withObservation = {
    ...subject,
    subsequentContinuationObservationReviewer,
    controlledProofExecutionSubsequentContinuationObservationReceipt:
      observed.subsequentContinuationObservationReceipt,
    controlledProofExecutionSubsequentContinuationObservationMemory:
      observed.controlledProofExecutionSubsequentContinuationObservationMemory,
  };
  const controlledProofExecutionSubsequentContinuationObservationReviewPolicy =
    createControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
      subsequentContinuationObservationReviewPolicyContext(withObservation),
    );
  return {
    ...withObservation,
    controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewMemory:
      createControlledProofExecutionSubsequentContinuationObservationReviewMemory({
        policy: controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
      }),
  };
}

export function subsequentContinuationObservationReviewArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationPolicy,
    controlledProofExecutionSubsequentContinuationObservationPolicyContext:
      subsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionSubsequentContinuationObservationReceipt:
      subject.controlledProofExecutionSubsequentContinuationObservationReceipt,
    controlledProofExecutionSubsequentContinuationObservationReceiptContext:
      subsequentContinuationObservationArguments(subject),
    controlledProofExecutionSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationMemory,
    controlledProofExecutionSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
    reviewId: "controlled-proof-execution-subsequent-continuation-observation-review-one",
    reviewerKeyId: subject.subsequentContinuationObservationReviewer.descriptor.keyId,
    reviewerPrivateKey: subject.subsequentContinuationObservationReviewer.privateKey,
    outcome: "accepted",
    reasonCode: "subsequent-continuation-observation-confirmed",
    reason: "Independent review confirms the signed observation and its complete chain.",
    reviewedAt: "2026-08-09T10:40:00.000Z",
    reviewNonce: "controlled-proof-execution-subsequent-continuation-observation-review-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente revisão interna, assinada, independente e de uso único", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionSubsequentContinuationObservationReviewPolicy;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
      policy,
      subsequentContinuationObservationReviewPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedObservationRequired, true);
    assert.equal(policy.exactObservationReceiptBindingRequired, true);
    assert.equal(policy.reviewerIndependenceRequired, true);
    assert.equal(policy.singleReviewPerObservationRequired, true);
    assert.equal(policy.maximumReviewsPerObservation, 1);
    assert.equal(policy.subsequentContinuationObservationReviewAllowed, true);
    assert.equal(policy.subsequentContinuationObservationReviewAuthorizationAllowed, false);
    for (const field of [
      "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
      "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration",
      "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("observação registrada recebe revisão aceita assinada e memória append-only", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionSubsequentContinuationObservation(
      subsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionSubsequentContinuationObservationReviewMemory;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt(
      reviewed.subsequentContinuationObservationReviewReceipt,
      subsequentContinuationObservationReviewArguments(subject, {
        controlledProofExecutionSubsequentContinuationObservationReviewMemory: memory,
      }),
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.outcome, "accepted");
    assert.equal(inspection.subsequentContinuationObservationAccepted, true);
    assert.equal(inspection.subsequentContinuationObservationReviewAuthorizationAllowed, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedReviews, 1);
    assert.equal(memory.summary.acceptedObservations, 1);
    assert.equal(memory.summary.rejectedObservations, 0);
    assert.equal(memory.summary.subsequentContinuationObservationAccepted, true);
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory(memory, {
        policy: subject.controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão pode rejeitar a observação sem autorizar continuação ou efeito externo", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionSubsequentContinuationObservation(
      subsequentContinuationObservationReviewArguments(subject, {
        outcome: "rejected",
        reasonCode: "subsequent-continuation-observation-rejected",
        reason: "Independent review found an unacceptable observation-chain inconsistency.",
      }),
    );
    const receipt = reviewed.subsequentContinuationObservationReviewReceipt;
    const memory = reviewed.controlledProofExecutionSubsequentContinuationObservationReviewMemory;
    assert.equal(receipt.subsequentContinuationObservationAccepted, false);
    assert.equal(receipt.subsequentContinuationObservationReviewAuthorizationAllowed, false);
    assert.equal(memory.summary.rejectedObservations, 1);
    assert.equal(memory.summary.subsequentContinuationObservationAccepted, false);
    for (const field of [
      "publicationExecuted", "externalPublicationExecuted", "packageGenerated",
      "buildExecuted", "deployExecuted", "releasePromoted",
    ]) assert.equal(receipt[field], false, field);
  } finally { cleanup(subject); }
});

test("observação não registrada ou já revisada não pode ser revisada", async () => {
  const subject = await fixture();
  try {
    const emptyObservationMemory = {
      ...subject.controlledProofExecutionSubsequentContinuationObservationMemory,
      entries: [],
    };
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationMemory: emptyObservationMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = reviewControlledProofExecutionSubsequentContinuationObservation(
      subsequentContinuationObservationReviewArguments(subject),
    );
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewMemory:
            first.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
          reviewId: "controlled-proof-execution-subsequent-continuation-observation-review-two",
          reviewNonce: "controlled-proof-execution-subsequent-continuation-observation-review-nonce-two",
        }),
      ),
      /already_reviewed/,
    );
  } finally { cleanup(subject); }
});

test("revisor não confiável, inativo, não independente ou com chave divergente é recusado", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          reviewerKeyId: "controlled-proof-execution-subsequent-continuation-observation-reviewer-key-unknown",
        }),
      ),
      /reviewer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveReviewer = reviewerDescriptor(inactiveKeys, { status: "inactive" });
    const inactiveContext = subsequentContinuationObservationReviewPolicyContext(subject, {
      trustedSubsequentContinuationObservationReviewers: [inactiveReviewer],
    });
    const inactivePolicy = createControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
      inactiveContext,
    );
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewPolicy: inactivePolicy,
          controlledProofExecutionSubsequentContinuationObservationReviewMemory:
            createControlledProofExecutionSubsequentContinuationObservationReviewMemory({ policy: inactivePolicy }),
          reviewerKeyId: inactiveReviewer.keyId,
          reviewerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /reviewer_inactive/,
    );

    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingReviewer = reviewerDescriptor(collidingKeys, {
      actorId: subject.subsequentContinuationObserver.descriptor.actorId,
    });
    assert.throws(
      () => createControlledProofExecutionSubsequentContinuationObservationReviewPolicy(
        subsequentContinuationObservationReviewPolicyContext(subject, {
          trustedSubsequentContinuationObservationReviewers: [collidingReviewer],
        }),
      ),
      /reviewer_must_be_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          reviewerPrivateKey: unrelated.privateKey,
        }),
      ),
      /private_key_does_not_match/,
    );
  } finally { cleanup(subject); }
});

test("janela, resultado, código e justificativa da revisão são estritos", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T10:39:29.000Z",
        }),
      ),
      /review_before_observation/,
    );
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T10:54:31.000Z",
        }),
      ),
      /review_window_expired/,
    );
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, { outcome: "pending" }),
      ),
      /review_outcome_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          reasonCode: "subsequent-continuation-observation-rejected",
        }),
      ),
      /reason_code_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, { reason: "too short" }),
      ),
      /review_reason_invalid/,
    );
  } finally { cleanup(subject); }
});

test("recibo observado, assinatura da revisão, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionSubsequentContinuationObservation(
      subsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionSubsequentContinuationObservationReviewMemory;
    const inspectionContext = subsequentContinuationObservationReviewArguments(subject, {
      controlledProofExecutionSubsequentContinuationObservationReviewMemory: memory,
    });
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt({
        ...reviewed.subsequentContinuationObservationReviewReceipt,
        subsequentContinuationObservationAccepted: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt({
        ...reviewed.subsequentContinuationObservationReviewReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewReceipt(
        reviewed.subsequentContinuationObservationReviewReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
      }).ok,
      false,
    );
    assert.throws(
      () => reviewControlledProofExecutionSubsequentContinuationObservation(
        subsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewMemory: {
            ...subject.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
            memoryHash: "0".repeat(64),
          },
        }),
      ),
      /memory_invalid/,
    );
  } finally { cleanup(subject); }
});

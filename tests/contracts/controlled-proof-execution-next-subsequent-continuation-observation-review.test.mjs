import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
  createControlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
  createControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewReceipt,
  reviewControlledProofExecutionNextSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review.mjs";
import {
  observeControlledProofExecutionNextSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation.mjs";
import {
  fixture as observationFixture,
  nextSubsequentContinuationObservationArguments,
  nextSubsequentContinuationObservationPolicyContext,
} from "./controlled-proof-execution-next-subsequent-continuation-observation.test.mjs";

function reviewerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-next-subsequent-continuation-observation-reviewer-key-one",
    actorId: "controlled-proof-execution-next-subsequent-continuation-observation-reviewer-one",
    role: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:39:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function nextSubsequentContinuationObservationReviewPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionNextSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationPolicyContext:
      nextSubsequentContinuationObservationPolicyContext(subject),
    trustedNextSubsequentContinuationObservationReviewers: [
      subject.nextSubsequentContinuationObservationReviewer.descriptor,
    ],
    maximumNextSubsequentContinuationObservationReviewDelaySeconds: 900,
    minimumNextSubsequentContinuationObservationReviewReasonLength: 12,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await observationFixture();
  const observed = observeControlledProofExecutionNextSubsequentContinuation(
    nextSubsequentContinuationObservationArguments(subject),
  );
  const reviewerKeys = generateKeyPairSync("ed25519");
  const nextSubsequentContinuationObservationReviewer = {
    privateKey: reviewerKeys.privateKey,
    descriptor: reviewerDescriptor(reviewerKeys),
  };
  const withObservation = {
    ...subject,
    nextSubsequentContinuationObservationReviewer,
    controlledProofExecutionNextSubsequentContinuationObservationReceipt:
      observed.nextSubsequentContinuationObservationReceipt,
    controlledProofExecutionNextSubsequentContinuationObservationMemory:
      observed.controlledProofExecutionNextSubsequentContinuationObservationMemory,
  };
  const controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy =
    createControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy(
      nextSubsequentContinuationObservationReviewPolicyContext(withObservation),
    );
  return {
    ...withObservation,
    controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
      createControlledProofExecutionNextSubsequentContinuationObservationReviewMemory({
        policy: controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
      }),
  };
}

export function nextSubsequentContinuationObservationReviewArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionNextSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationPolicyContext:
      nextSubsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionNextSubsequentContinuationObservationReceipt:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReceipt,
    controlledProofExecutionNextSubsequentContinuationObservationReceiptContext:
      nextSubsequentContinuationObservationArguments(subject),
    controlledProofExecutionNextSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationMemory,
    controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
    reviewId: "controlled-proof-execution-next-subsequent-continuation-observation-review-one",
    reviewerKeyId: subject.nextSubsequentContinuationObservationReviewer.descriptor.keyId,
    reviewerPrivateKey: subject.nextSubsequentContinuationObservationReviewer.privateKey,
    outcome: "accepted",
    reasonCode: "next-subsequent-continuation-observation-confirmed",
    reason: "Independent review confirms the signed observation and its complete chain.",
    reviewedAt: "2026-08-09T10:44:00.000Z",
    reviewNonce: "controlled-proof-execution-next-subsequent-continuation-observation-review-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente revisão interna, assinada, independente e de uso único", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy(
      policy,
      nextSubsequentContinuationObservationReviewPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedObservationRequired, true);
    assert.equal(policy.exactObservationReceiptBindingRequired, true);
    assert.equal(policy.reviewerIndependenceRequired, true);
    assert.equal(policy.singleReviewPerObservationRequired, true);
    assert.equal(policy.maximumReviewsPerObservation, 1);
    assert.equal(policy.nextSubsequentContinuationObservationReviewAllowed, true);
    assert.equal(policy.nextSubsequentContinuationObservationReviewAuthorizationAllowed, false);
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
    const reviewed = reviewControlledProofExecutionNextSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewReceipt(
      reviewed.nextSubsequentContinuationObservationReviewReceipt,
      nextSubsequentContinuationObservationReviewArguments(subject, {
        controlledProofExecutionNextSubsequentContinuationObservationReviewMemory: memory,
      }),
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.outcome, "accepted");
    assert.equal(inspection.nextSubsequentContinuationObservationAccepted, true);
    assert.equal(inspection.nextSubsequentContinuationObservationReviewAuthorizationAllowed, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedReviews, 1);
    assert.equal(memory.summary.acceptedObservations, 1);
    assert.equal(memory.summary.rejectedObservations, 0);
    assert.equal(memory.summary.nextSubsequentContinuationObservationAccepted, true);
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewMemory(memory, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão pode rejeitar a observação sem autorizar continuação ou efeito externo", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionNextSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject, {
        outcome: "rejected",
        reasonCode: "next-subsequent-continuation-observation-rejected",
        reason: "Independent review found an unacceptable observation-chain inconsistency.",
      }),
    );
    const receipt = reviewed.nextSubsequentContinuationObservationReviewReceipt;
    const memory = reviewed.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory;
    assert.equal(receipt.nextSubsequentContinuationObservationAccepted, false);
    assert.equal(receipt.nextSubsequentContinuationObservationReviewAuthorizationAllowed, false);
    assert.equal(memory.summary.rejectedObservations, 1);
    assert.equal(memory.summary.nextSubsequentContinuationObservationAccepted, false);
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
      ...subject.controlledProofExecutionNextSubsequentContinuationObservationMemory,
      entries: [],
    };
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationMemory: emptyObservationMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = reviewControlledProofExecutionNextSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject),
    );
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
            first.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
          reviewId: "controlled-proof-execution-next-subsequent-continuation-observation-review-two",
          reviewNonce: "controlled-proof-execution-next-subsequent-continuation-observation-review-nonce-two",
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
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reviewerKeyId: "controlled-proof-execution-next-subsequent-continuation-observation-reviewer-key-unknown",
        }),
      ),
      /reviewer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveReviewer = reviewerDescriptor(inactiveKeys, { status: "inactive" });
    const inactiveContext = nextSubsequentContinuationObservationReviewPolicyContext(subject, {
      trustedNextSubsequentContinuationObservationReviewers: [inactiveReviewer],
    });
    const inactivePolicy = createControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy(
      inactiveContext,
    );
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy: inactivePolicy,
          controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
            createControlledProofExecutionNextSubsequentContinuationObservationReviewMemory({ policy: inactivePolicy }),
          reviewerKeyId: inactiveReviewer.keyId,
          reviewerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /reviewer_inactive/,
    );

    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingReviewer = reviewerDescriptor(collidingKeys, {
      actorId: subject.nextSubsequentContinuationObserver.descriptor.actorId,
    });
    assert.throws(
      () => createControlledProofExecutionNextSubsequentContinuationObservationReviewPolicy(
        nextSubsequentContinuationObservationReviewPolicyContext(subject, {
          trustedNextSubsequentContinuationObservationReviewers: [collidingReviewer],
        }),
      ),
      /reviewer_must_be_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
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
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T10:43:29.000Z",
        }),
      ),
      /review_before_observation/,
    );
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T10:58:31.000Z",
        }),
      ),
      /review_window_expired/,
    );
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, { outcome: "pending" }),
      ),
      /review_outcome_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reasonCode: "next-subsequent-continuation-observation-rejected",
        }),
      ),
      /reason_code_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, { reason: "too short" }),
      ),
      /review_reason_invalid/,
    );
  } finally { cleanup(subject); }
});

test("recibo observado, assinatura da revisão, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionNextSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory;
    const inspectionContext = nextSubsequentContinuationObservationReviewArguments(subject, {
      controlledProofExecutionNextSubsequentContinuationObservationReviewMemory: memory,
    });
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewReceipt({
        ...reviewed.nextSubsequentContinuationObservationReviewReceipt,
        nextSubsequentContinuationObservationAccepted: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewReceipt({
        ...reviewed.nextSubsequentContinuationObservationReviewReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewReceipt(
        reviewed.nextSubsequentContinuationObservationReviewReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
      }).ok,
      false,
    );
    assert.throws(
      () => reviewControlledProofExecutionNextSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewMemory: {
            ...subject.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
            memoryHash: "0".repeat(64),
          },
        }),
      ),
      /memory_invalid/,
    );
  } finally { cleanup(subject); }
});

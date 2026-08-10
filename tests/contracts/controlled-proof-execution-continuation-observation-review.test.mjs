import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
  createControlledProofExecutionContinuationObservationReviewMemory,
  createControlledProofExecutionContinuationObservationReviewPolicy,
  inspectControlledProofExecutionContinuationObservationReviewMemory,
  inspectControlledProofExecutionContinuationObservationReviewPolicy,
  inspectControlledProofExecutionContinuationObservationReviewReceipt,
  reviewControlledProofExecutionContinuationObservation,
} from "../../lib/release/controlled-proof-execution-continuation-observation-review.mjs";
import {
  fixture as observationFixture,
  observationArguments,
  policyContext as observationPolicyContext,
} from "./controlled-proof-execution-continuation-observation.test.mjs";
import {
  observeControlledProofExecutionContinuation,
} from "../../lib/release/controlled-proof-execution-continuation-observation.mjs";

function reviewerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "continuation-observation-reviewer-key-one",
    actorId: "continuation-observation-reviewer-one",
    role: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:00:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function reviewPolicyContext(subject, overrides = {}) {
  return {
    ...observationPolicyContext(subject),
    controlledProofExecutionContinuationObservationPolicy:
      subject.controlledProofExecutionContinuationObservationPolicy,
    trustedObservationReviewers: [subject.observationReviewer.descriptor],
    maximumReviewDelaySeconds: 900,
    minimumReasonLength: 12,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await observationFixture();
  const observed = observeControlledProofExecutionContinuation(
    observationArguments(subject),
  );
  const reviewerKeys = generateKeyPairSync("ed25519");
  const observationReviewer = {
    privateKey: reviewerKeys.privateKey,
    descriptor: reviewerDescriptor(reviewerKeys),
  };
  const withObservation = {
    ...subject,
    observationReviewer,
    controlledProofExecutionContinuationObservationReceipt:
      observed.observationReceipt,
    controlledProofExecutionContinuationObservationMemory:
      observed.controlledProofExecutionContinuationObservationMemory,
  };
  const controlledProofExecutionContinuationObservationReviewPolicy =
    createControlledProofExecutionContinuationObservationReviewPolicy(
      reviewPolicyContext(withObservation),
    );
  return {
    ...withObservation,
    controlledProofExecutionContinuationObservationReviewPolicy,
    controlledProofExecutionContinuationObservationReviewMemory:
      createControlledProofExecutionContinuationObservationReviewMemory({
        policy: controlledProofExecutionContinuationObservationReviewPolicy,
      }),
  };
}

export function reviewArguments(subject, overrides = {}) {
  return {
    ...observationArguments(subject),
    controlledProofExecutionContinuationObservationReceipt:
      subject.controlledProofExecutionContinuationObservationReceipt,
    controlledProofExecutionContinuationObservationMemory:
      subject.controlledProofExecutionContinuationObservationMemory,
    controlledProofExecutionContinuationObservationReviewPolicy:
      subject.controlledProofExecutionContinuationObservationReviewPolicy,
    controlledProofExecutionContinuationObservationReviewMemory:
      subject.controlledProofExecutionContinuationObservationReviewMemory,
    reviewId: "continuation-observation-review-one",
    reviewerKeyId: subject.observationReviewer.descriptor.keyId,
    reviewerPrivateKey: subject.observationReviewer.privateKey,
    outcome: "accepted",
    reasonCode: "continuation-observation-confirmed",
    reason: "A observação registrada confere integralmente com a continuação assinada.",
    reviewedAt: "2026-08-09T10:35:00.000Z",
    nonce: "continuation-observation-review-nonce-one",
    ...overrides,
  };
}

function inspectArguments(subject, reviewed) {
  return {
    ...reviewArguments(subject),
    controlledProofExecutionContinuationObservationReviewMemory:
      reviewed.controlledProofExecutionContinuationObservationReviewMemory,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política limita a revisão a ator independente e mantém efeitos externos bloqueados", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledProofExecutionContinuationObservationReviewPolicy(
      subject.controlledProofExecutionContinuationObservationReviewPolicy,
      reviewPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(
      subject.controlledProofExecutionContinuationObservationReviewPolicy.reviewerIndependenceRequired,
      true,
    );
    assert.equal(
      subject.controlledProofExecutionContinuationObservationReviewPolicy.maximumReviewsPerObservation,
      1,
    );
    for (const field of [
      "subsequentContinuationAuthorizationAllowed",
      "publicationExecutionAllowed",
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledProofExecutionContinuationObservationReviewPolicy[field], false);
  } finally {
    cleanup(subject);
  }
});

test("revisão aceita é assinada, registrada e não autoriza nova continuação", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionContinuationObservation(
      reviewArguments(subject),
    );
    const inspection = inspectControlledProofExecutionContinuationObservationReviewReceipt(
      reviewed.reviewReceipt,
      inspectArguments(subject, reviewed),
    );
    const memoryInspection = inspectControlledProofExecutionContinuationObservationReviewMemory(
      reviewed.controlledProofExecutionContinuationObservationReviewMemory,
      { policy: subject.controlledProofExecutionContinuationObservationReviewPolicy },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.outcome, "accepted");
    assert.equal(inspection.continuationObservationAccepted, true);
    assert.equal(inspection.subsequentContinuationAuthorized, false);
    assert.equal(memoryInspection.ok, true);
    assert.equal(memoryInspection.recordedReviews, 1);
    assert.equal(memoryInspection.acceptedObservations, 1);
    assert.equal(memoryInspection.rejectedObservations, 0);
  } finally {
    cleanup(subject);
  }
});

test("revisão rejeitada preserva evidência e também não autoriza continuação", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionContinuationObservation(
      reviewArguments(subject, {
        outcome: "rejected",
        reasonCode: "continuation-observation-rejected",
        reason: "A evidência temporal apresentada não é suficiente para aceitar a observação.",
      }),
    );
    const inspection = inspectControlledProofExecutionContinuationObservationReviewReceipt(
      reviewed.reviewReceipt,
      inspectArguments(subject, reviewed),
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.outcome, "rejected");
    assert.equal(inspection.continuationObservationAccepted, false);
    assert.equal(inspection.subsequentContinuationAuthorized, false);
    assert.equal(
      reviewed.controlledProofExecutionContinuationObservationReviewMemory.summary.rejectedObservations,
      1,
    );
  } finally {
    cleanup(subject);
  }
});

test("revisão recusa observação não registrada e revisor não confiável", async () => {
  const subject = await fixture();
  try {
    await assert.rejects(
      async () => reviewControlledProofExecutionContinuationObservation(
        reviewArguments(subject, {
          controlledProofExecutionContinuationObservationMemory: {
            ...subject.controlledProofExecutionContinuationObservationMemory,
            entries: [],
          },
        }),
      ),
      /observation_memory_invalid|observation_not_recorded/,
    );
    assert.throws(
      () => reviewControlledProofExecutionContinuationObservation(
        reviewArguments(subject, { reviewerKeyId: "unknown-reviewer-key" }),
      ),
      /reviewer_untrusted/,
    );
  } finally {
    cleanup(subject);
  }
});

test("política e execução recusam revisor que participou da cadeia anterior", async () => {
  const subject = await fixture();
  try {
    const conflictingKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => createControlledProofExecutionContinuationObservationReviewPolicy(
        reviewPolicyContext(subject, {
          trustedObservationReviewers: [reviewerDescriptor(conflictingKeys, {
            actorId: subject.controlledProofExecutionContinuationObservationReceipt.observerActorId,
          })],
        }),
      ),
      /reviewer_must_be_independent/,
    );
    const tamperedPolicy = {
      ...subject.controlledProofExecutionContinuationObservationReviewPolicy,
      trustedObservationReviewers: [{
        ...subject.observationReviewer.descriptor,
        actorId: subject.controlledProofExecutionContinuationObservationReceipt.observerActorId,
      }],
    };
    assert.throws(
      () => reviewControlledProofExecutionContinuationObservation(
        reviewArguments(subject, {
          controlledProofExecutionContinuationObservationReviewPolicy: tamperedPolicy,
        }),
      ),
      /review_policy_invalid/,
    );
  } finally {
    cleanup(subject);
  }
});

test("janela temporal, motivo e chave privada são validados", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => reviewControlledProofExecutionContinuationObservation(
        reviewArguments(subject, { reviewedAt: "2026-08-09T11:00:01.000Z" }),
      ),
      /review_window_expired|key_outside_validity/,
    );
    assert.throws(
      () => reviewControlledProofExecutionContinuationObservation(
        reviewArguments(subject, { reason: "curto" }),
      ),
      /review_reason_invalid/,
    );
    const otherKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => reviewControlledProofExecutionContinuationObservation(
        reviewArguments(subject, { reviewerPrivateKey: otherKeys.privateKey }),
      ),
      /private_key_does_not_match/,
    );
  } finally {
    cleanup(subject);
  }
});

test("mesma observação não pode ser revisada duas vezes", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionContinuationObservation(
      reviewArguments(subject),
    );
    assert.throws(
      () => reviewControlledProofExecutionContinuationObservation(
        reviewArguments(subject, {
          controlledProofExecutionContinuationObservationReviewMemory:
            reviewed.controlledProofExecutionContinuationObservationReviewMemory,
          reviewId: "continuation-observation-review-two",
          nonce: "continuation-observation-review-nonce-two",
        }),
      ),
      /already_reviewed/,
    );
  } finally {
    cleanup(subject);
  }
});

test("adulteração do recibo ou da memória é detectada", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionContinuationObservation(
      reviewArguments(subject),
    );
    const receiptInspection = inspectControlledProofExecutionContinuationObservationReviewReceipt(
      { ...reviewed.reviewReceipt, reason: "Motivo adulterado após a assinatura e registro." },
      inspectArguments(subject, reviewed),
    );
    assert.equal(receiptInspection.ok, false);
    const memoryInspection = inspectControlledProofExecutionContinuationObservationReviewMemory(
      {
        ...reviewed.controlledProofExecutionContinuationObservationReviewMemory,
        entries: reviewed.controlledProofExecutionContinuationObservationReviewMemory.entries.map((entry) => ({
          ...entry,
          outcome: "rejected",
        })),
      },
      { policy: subject.controlledProofExecutionContinuationObservationReviewPolicy },
    );
    assert.equal(memoryInspection.ok, false);
  } finally {
    cleanup(subject);
  }
});

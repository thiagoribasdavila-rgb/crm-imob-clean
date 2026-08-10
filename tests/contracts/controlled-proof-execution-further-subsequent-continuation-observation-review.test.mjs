import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
  createControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
  createControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt,
  reviewControlledProofExecutionFurtherSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-further-subsequent-continuation-observation-review.mjs";
import {
  observeControlledProofExecutionFurtherSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-further-subsequent-continuation-observation.mjs";
import {
  fixture as observationFixture,
  followingSubsequentContinuationObservationArguments,
  followingSubsequentContinuationObservationPolicyContext,
} from "./controlled-proof-execution-further-subsequent-continuation-observation.test.mjs";

function reviewerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-further-subsequent-continuation-observation-reviewer-key-one",
    actorId: "controlled-proof-execution-further-subsequent-continuation-observation-reviewer-one",
    role: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:39:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function followingSubsequentContinuationObservationReviewPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionFurtherSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationPolicyContext:
      followingSubsequentContinuationObservationPolicyContext(subject),
    trustedFurtherSubsequentContinuationObservationReviewers: [
      subject.furtherSubsequentContinuationObservationReviewer.descriptor,
    ],
    maximumFurtherSubsequentContinuationObservationReviewDelaySeconds: 900,
    minimumFurtherSubsequentContinuationObservationReviewReasonLength: 12,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await observationFixture();
  const observed = observeControlledProofExecutionFurtherSubsequentContinuation(
    followingSubsequentContinuationObservationArguments(subject),
  );
  const reviewerKeys = generateKeyPairSync("ed25519");
  const furtherSubsequentContinuationObservationReviewer = {
    privateKey: reviewerKeys.privateKey,
    descriptor: reviewerDescriptor(reviewerKeys),
  };
  const withObservation = {
    ...subject,
    furtherSubsequentContinuationObservationReviewer,
    controlledProofExecutionFurtherSubsequentContinuationObservationReceipt:
      observed.followingSubsequentContinuationObservationReceipt,
    controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
      observed.controlledProofExecutionFurtherSubsequentContinuationObservationMemory,
  };
  const controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy =
    createControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy(
      followingSubsequentContinuationObservationReviewPolicyContext(withObservation),
    );
  return {
    ...withObservation,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
      createControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory({
        policy: controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
      }),
  };
}

export function followingSubsequentContinuationObservationReviewArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionFurtherSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationPolicyContext:
      followingSubsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionFurtherSubsequentContinuationObservationReceipt:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReceipt,
    controlledProofExecutionFurtherSubsequentContinuationObservationReceiptContext:
      followingSubsequentContinuationObservationArguments(subject),
    controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationMemory,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
    reviewId: "controlled-proof-execution-further-subsequent-continuation-observation-review-one",
    reviewerKeyId: subject.furtherSubsequentContinuationObservationReviewer.descriptor.keyId,
    reviewerPrivateKey: subject.furtherSubsequentContinuationObservationReviewer.privateKey,
    outcome: "accepted",
    reasonCode: "further-subsequent-continuation-observation-confirmed",
    reason: "Independent review confirms the signed observation and its complete chain.",
    reviewedAt: "2026-08-09T10:54:00.000Z",
    reviewNonce: "controlled-proof-execution-further-subsequent-continuation-observation-review-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente revisão interna, assinada, independente e de uso único", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy(
      policy,
      followingSubsequentContinuationObservationReviewPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedObservationRequired, true);
    assert.equal(policy.exactObservationReceiptBindingRequired, true);
    assert.equal(policy.reviewerIndependenceRequired, true);
    assert.equal(policy.singleReviewPerObservationRequired, true);
    assert.equal(policy.maximumReviewsPerObservation, 1);
    assert.equal(policy.followingSubsequentContinuationObservationReviewAllowed, true);
    assert.equal(policy.followingSubsequentContinuationObservationReviewAuthorizationAllowed, false);
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
    const reviewed = reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
      followingSubsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt(
      reviewed.followingSubsequentContinuationObservationReviewReceipt,
      followingSubsequentContinuationObservationReviewArguments(subject, {
        controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: memory,
      }),
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.outcome, "accepted");
    assert.equal(inspection.followingSubsequentContinuationObservationAccepted, true);
    assert.equal(inspection.followingSubsequentContinuationObservationReviewAuthorizationAllowed, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedReviews, 1);
    assert.equal(memory.summary.acceptedObservations, 1);
    assert.equal(memory.summary.rejectedObservations, 0);
    assert.equal(memory.summary.followingSubsequentContinuationObservationAccepted, true);
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory(memory, {
        policy: subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão pode rejeitar a observação sem autorizar continuação ou efeito externo", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
      followingSubsequentContinuationObservationReviewArguments(subject, {
        outcome: "rejected",
        reasonCode: "further-subsequent-continuation-observation-rejected",
        reason: "Independent review found an unacceptable observation-chain inconsistency.",
      }),
    );
    const receipt = reviewed.followingSubsequentContinuationObservationReviewReceipt;
    const memory = reviewed.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory;
    assert.equal(receipt.followingSubsequentContinuationObservationAccepted, false);
    assert.equal(receipt.followingSubsequentContinuationObservationReviewAuthorizationAllowed, false);
    assert.equal(memory.summary.rejectedObservations, 1);
    assert.equal(memory.summary.followingSubsequentContinuationObservationAccepted, false);
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
      ...subject.controlledProofExecutionFurtherSubsequentContinuationObservationMemory,
      entries: [],
    };
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationMemory: emptyObservationMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
      followingSubsequentContinuationObservationReviewArguments(subject),
    );
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
            first.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
          reviewId: "controlled-proof-execution-further-subsequent-continuation-observation-review-two",
          reviewNonce: "controlled-proof-execution-further-subsequent-continuation-observation-review-nonce-two",
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
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          reviewerKeyId: "controlled-proof-execution-further-subsequent-continuation-observation-reviewer-key-unknown",
        }),
      ),
      /reviewer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveReviewer = reviewerDescriptor(inactiveKeys, { status: "inactive" });
    const inactiveContext = followingSubsequentContinuationObservationReviewPolicyContext(subject, {
      trustedFurtherSubsequentContinuationObservationReviewers: [inactiveReviewer],
    });
    const inactivePolicy = createControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy(
      inactiveContext,
    );
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy: inactivePolicy,
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
            createControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory({ policy: inactivePolicy }),
          reviewerKeyId: inactiveReviewer.keyId,
          reviewerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /reviewer_inactive/,
    );

    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingReviewer = reviewerDescriptor(collidingKeys, {
      actorId: subject.followingSubsequentContinuationObserver.descriptor.actorId,
    });
    assert.throws(
      () => createControlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy(
        followingSubsequentContinuationObservationReviewPolicyContext(subject, {
          trustedFurtherSubsequentContinuationObservationReviewers: [collidingReviewer],
        }),
      ),
      /reviewer_must_be_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
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
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T10:52:59.000Z",
        }),
      ),
      /review_before_observation/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T11:08:01.000Z",
        }),
      ),
      /review_window_expired/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, { outcome: "pending" }),
      ),
      /review_outcome_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          reasonCode: "further-subsequent-continuation-observation-rejected",
        }),
      ),
      /reason_code_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, { reason: "too short" }),
      ),
      /review_reason_invalid/,
    );
  } finally { cleanup(subject); }
});

test("recibo observado, assinatura da revisão, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
      followingSubsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory;
    const inspectionContext = followingSubsequentContinuationObservationReviewArguments(subject, {
      controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: memory,
    });
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt({
        ...reviewed.followingSubsequentContinuationObservationReviewReceipt,
        followingSubsequentContinuationObservationAccepted: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt({
        ...reviewed.followingSubsequentContinuationObservationReviewReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt(
        reviewed.followingSubsequentContinuationObservationReviewReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
      }).ok,
      false,
    );
    assert.throws(
      () => reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
        followingSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: {
            ...subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
            memoryHash: "0".repeat(64),
          },
        }),
      ),
      /memory_invalid/,
    );
  } finally { cleanup(subject); }
});

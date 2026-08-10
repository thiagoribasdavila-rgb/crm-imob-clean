import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
  createControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
  createControlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt,
  reviewControlledProofExecutionFollowingSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review.mjs";
import {
  observeControlledProofExecutionFollowingSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation.mjs";
import {
  fixture as observationFixture,
  nextSubsequentContinuationObservationArguments,
  nextSubsequentContinuationObservationPolicyContext,
} from "./controlled-proof-execution-following-subsequent-continuation-observation.test.mjs";

function reviewerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-following-subsequent-continuation-observation-reviewer-key-one",
    actorId: "controlled-proof-execution-following-subsequent-continuation-observation-reviewer-one",
    role: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEWER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:39:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function nextSubsequentContinuationObservationReviewPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext:
      nextSubsequentContinuationObservationPolicyContext(subject),
    trustedFollowingSubsequentContinuationObservationReviewers: [
      subject.followingSubsequentContinuationObservationReviewer.descriptor,
    ],
    maximumFollowingSubsequentContinuationObservationReviewDelaySeconds: 900,
    minimumFollowingSubsequentContinuationObservationReviewReasonLength: 12,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await observationFixture();
  const observed = observeControlledProofExecutionFollowingSubsequentContinuation(
    nextSubsequentContinuationObservationArguments(subject),
  );
  const reviewerKeys = generateKeyPairSync("ed25519");
  const followingSubsequentContinuationObservationReviewer = {
    privateKey: reviewerKeys.privateKey,
    descriptor: reviewerDescriptor(reviewerKeys),
  };
  const withObservation = {
    ...subject,
    followingSubsequentContinuationObservationReviewer,
    controlledProofExecutionFollowingSubsequentContinuationObservationReceipt:
      observed.nextSubsequentContinuationObservationReceipt,
    controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
      observed.controlledProofExecutionFollowingSubsequentContinuationObservationMemory,
  };
  const controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy =
    createControlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy(
      nextSubsequentContinuationObservationReviewPolicyContext(withObservation),
    );
  return {
    ...withObservation,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
      createControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory({
        policy: controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
      }),
  };
}

export function nextSubsequentContinuationObservationReviewArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext:
      nextSubsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationReceipt:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReceipt,
    controlledProofExecutionFollowingSubsequentContinuationObservationReceiptContext:
      nextSubsequentContinuationObservationArguments(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationMemory,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
    reviewId: "controlled-proof-execution-following-subsequent-continuation-observation-review-one",
    reviewerKeyId: subject.followingSubsequentContinuationObservationReviewer.descriptor.keyId,
    reviewerPrivateKey: subject.followingSubsequentContinuationObservationReviewer.privateKey,
    outcome: "accepted",
    reasonCode: "following-subsequent-continuation-observation-confirmed",
    reason: "Independent review confirms the signed observation and its complete chain.",
    reviewedAt: "2026-08-09T10:49:00.000Z",
    reviewNonce: "controlled-proof-execution-following-subsequent-continuation-observation-review-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente revisão interna, assinada, independente e de uso único", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy(
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
    const reviewed = reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt(
      reviewed.nextSubsequentContinuationObservationReviewReceipt,
      nextSubsequentContinuationObservationReviewArguments(subject, {
        controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory: memory,
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
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory(memory, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão pode rejeitar a observação sem autorizar continuação ou efeito externo", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject, {
        outcome: "rejected",
        reasonCode: "following-subsequent-continuation-observation-rejected",
        reason: "Independent review found an unacceptable observation-chain inconsistency.",
      }),
    );
    const receipt = reviewed.nextSubsequentContinuationObservationReviewReceipt;
    const memory = reviewed.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory;
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
      ...subject.controlledProofExecutionFollowingSubsequentContinuationObservationMemory,
      entries: [],
    };
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationMemory: emptyObservationMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject),
    );
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
            first.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
          reviewId: "controlled-proof-execution-following-subsequent-continuation-observation-review-two",
          reviewNonce: "controlled-proof-execution-following-subsequent-continuation-observation-review-nonce-two",
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
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reviewerKeyId: "controlled-proof-execution-following-subsequent-continuation-observation-reviewer-key-unknown",
        }),
      ),
      /reviewer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveReviewer = reviewerDescriptor(inactiveKeys, { status: "inactive" });
    const inactiveContext = nextSubsequentContinuationObservationReviewPolicyContext(subject, {
      trustedFollowingSubsequentContinuationObservationReviewers: [inactiveReviewer],
    });
    const inactivePolicy = createControlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy(
      inactiveContext,
    );
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy: inactivePolicy,
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
            createControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory({ policy: inactivePolicy }),
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
      () => createControlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy(
        nextSubsequentContinuationObservationReviewPolicyContext(subject, {
          trustedFollowingSubsequentContinuationObservationReviewers: [collidingReviewer],
        }),
      ),
      /reviewer_must_be_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
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
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T10:47:59.000Z",
        }),
      ),
      /review_before_observation/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reviewedAt: "2026-08-09T11:03:01.000Z",
        }),
      ),
      /review_window_expired/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, { outcome: "pending" }),
      ),
      /review_outcome_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          reasonCode: "following-subsequent-continuation-observation-rejected",
        }),
      ),
      /reason_code_invalid/,
    );
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, { reason: "too short" }),
      ),
      /review_reason_invalid/,
    );
  } finally { cleanup(subject); }
});

test("recibo observado, assinatura da revisão, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const reviewed = reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
      nextSubsequentContinuationObservationReviewArguments(subject),
    );
    const memory = reviewed.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory;
    const inspectionContext = nextSubsequentContinuationObservationReviewArguments(subject, {
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory: memory,
    });
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt({
        ...reviewed.nextSubsequentContinuationObservationReviewReceipt,
        nextSubsequentContinuationObservationAccepted: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt({
        ...reviewed.nextSubsequentContinuationObservationReviewReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt(
        reviewed.nextSubsequentContinuationObservationReviewReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
      }).ok,
      false,
    );
    assert.throws(
      () => reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
        nextSubsequentContinuationObservationReviewArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory: {
            ...subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
            memoryHash: "0".repeat(64),
          },
        }),
      ),
      /memory_invalid/,
    );
  } finally { cleanup(subject); }
});

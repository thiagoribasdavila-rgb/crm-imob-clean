import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
  authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview,
  createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
  createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.mjs";
import {
  createControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
  reviewControlledProofExecutionFollowingSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review.mjs";
import {
  fixture as reviewFixture,
  nextSubsequentContinuationObservationReviewArguments as reviewArguments,
  nextSubsequentContinuationObservationReviewPolicyContext as reviewPolicyContext,
} from "./controlled-proof-execution-following-subsequent-continuation-observation-review.test.mjs";

function authorizerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "phase-249-independent-review-authorizer-key-one",
    actorId: "phase-249-independent-review-authorizer-one",
    role: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:00:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function authorizationPolicyContext(subject, overrides = {}) {
  return {
    ...reviewPolicyContext(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
    trustedReviewAuthorizers: [subject.followingSubsequentContinuationObservationReviewAuthorizer.descriptor],
    maximumReviewAuthorizationDelaySeconds: 300,
    maximumReviewAuthorizationTtlSeconds: 300,
    ...overrides,
  };
}

export async function fixture(reviewOverrides = {}) {
  const subject = await reviewFixture();
  const reviewed = reviewControlledProofExecutionFollowingSubsequentContinuationObservation(
    reviewArguments(subject, reviewOverrides),
  );
  const authorizerKeys = generateKeyPairSync("ed25519");
  const followingSubsequentContinuationObservationReviewAuthorizer = {
    privateKey: authorizerKeys.privateKey,
    descriptor: authorizerDescriptor(authorizerKeys),
  };
  const withReview = {
    ...subject,
    followingSubsequentContinuationObservationReviewAuthorizer,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt:
      reviewed.nextSubsequentContinuationObservationReviewReceipt,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
      reviewed.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
  };
  const controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy =
    createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy(
      authorizationPolicyContext(withReview),
    );
  return {
    ...withReview,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory:
      createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory({
        policy: controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
      }),
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...reviewArguments(subject),
    ...authorizationPolicyContext(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
    reviewAuthorizationId: "following-subsequent-continuation-observation-review-authorization-one",
    reviewAuthorizerKeyId: subject.followingSubsequentContinuationObservationReviewAuthorizer.descriptor.keyId,
    reviewAuthorizerPrivateKey: subject.followingSubsequentContinuationObservationReviewAuthorizer.privateKey,
    reasonCode: "accepted-review-authorized",
    authorizedAt: "2026-08-09T10:50:00.000Z",
    expiresAt: "2026-08-09T10:54:00.000Z",
    nonce: "following-subsequent-continuation-observation-review-authorization-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política autoriza somente um passe futuro e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy(
      policy,
      authorizationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.acceptedSignedRecordedReviewRequired, true);
    assert.equal(policy.singleUseAuthorizationRequired, true);
    assert.equal(policy.maximumFollowingSubsequentContinuations, 1);
    assert.equal(policy.nextSubsequentContinuationAuthorizationAllowed, true);
    for (const field of [
      "nextSubsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
      "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("revisão aceita, assinada e registrada gera autorização independente append-only", async () => {
  const subject = await fixture();
  try {
    const authorized = authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
      authorized.reviewAuthorization,
      {
        ...authorizationArguments(subject),
        controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.nextSubsequentContinuationAuthorized, true);
    assert.equal(inspection.nextSubsequentContinuationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.entries[0].reviewReceiptHash,
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt
        .nextSubsequentContinuationObservationReviewReceiptHash);
    assert.equal(memory.entries[0].remainingFollowingSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory(memory, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão rejeitada ou não registrada jamais recebe autorização", async () => {
  const subject = await fixture({
    reviewId: "continuation-observation-review-rejected",
    outcome: "rejected",
    reasonCode: "following-subsequent-continuation-observation-rejected",
    reviewNonce: "continuation-observation-review-rejected-nonce",
  });
  try {
    assert.throws(
      () => authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt:
            subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewReceipt,
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory,
        }),
      ),
      /review_not_accepted/,
    );
    const emptyReviewMemory = createControlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory({
      policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewPolicy,
    });
    assert.throws(
      () => authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewMemory: emptyReviewMemory,
        }),
      ),
      /review_receipt_invalid|review_not_recorded/,
    );
  } finally { cleanup(subject); }
});

test("autor não confiável, não independente ou fora da janela é recusado", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
        authorizationArguments(subject, { reviewAuthorizerKeyId: "unknown-authorizer-key" }),
      ),
      /authorizer_untrusted/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy(
        authorizationPolicyContext(subject, {
          trustedReviewAuthorizers: [authorizerDescriptor(collidingKeys, {
            actorId: subject.nextSubsequentContinuationObservationReviewer.descriptor.actorId,
          })],
        }),
      ),
      /authorizer_must_be_independent/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          authorizedAt: "2026-08-09T10:54:01.000Z",
          expiresAt: "2026-08-09T10:57:00.000Z",
        }),
      ),
      /authorization_window_expired/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
        authorizationArguments(subject, { expiresAt: "2026-08-09T10:55:01.000Z" }),
      ),
      /authorization_ttl_invalid/,
    );
  } finally { cleanup(subject); }
});

test("uma revisão só pode ser autorizada uma vez", async () => {
  const subject = await fixture();
  try {
    const first = authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    assert.throws(
      () => authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory:
            first.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
          reviewAuthorizationId: "continuation-observation-review-authorization-two",
          nonce: "continuation-observation-review-authorization-nonce-two",
        }),
      ),
      /review_already_authorized/,
    );
  } finally { cleanup(subject); }
});

test("adulteração de conteúdo, assinatura ou memória é detectada", async () => {
  const subject = await fixture();
  try {
    const authorized = authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspect = (reviewAuthorization, authorizationMemory = memory) =>
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(reviewAuthorization, {
        ...authorizationArguments(subject),
        controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
      });
    assert.equal(inspect({ ...authorized.reviewAuthorization, reasonCode: "tampered-reason" }).ok, false);
    assert.equal(inspect({ ...authorized.reviewAuthorization, signature: "tampered" }).ok, false);
    assert.equal(inspect(authorized.reviewAuthorization, { ...memory, memoryHash: "0".repeat(64) }).ok, false);
  } finally { cleanup(subject); }
});

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
  authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview,
  createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory,
  createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorization,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy,
} from "../../lib/release/controlled-proof-execution-further-subsequent-continuation-observation-review-authorization.mjs";
import {
  createControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
  reviewControlledProofExecutionFurtherSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-further-subsequent-continuation-observation-review.mjs";
import {
  fixture as reviewFixture,
  followingSubsequentContinuationObservationReviewArguments as reviewArguments,
  followingSubsequentContinuationObservationReviewPolicyContext as reviewPolicyContext,
} from "./controlled-proof-execution-further-subsequent-continuation-observation-review.test.mjs";

function authorizerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "phase-254-independent-review-authorizer-key-one",
    actorId: "phase-254-independent-review-authorizer-one",
    role: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
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
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
    trustedReviewAuthorizers: [subject.furtherSubsequentContinuationObservationReviewAuthorizer.descriptor],
    maximumReviewAuthorizationDelaySeconds: 300,
    maximumReviewAuthorizationTtlSeconds: 300,
    ...overrides,
  };
}

export async function fixture(reviewOverrides = {}) {
  const subject = await reviewFixture();
  const reviewed = reviewControlledProofExecutionFurtherSubsequentContinuationObservation(
    reviewArguments(subject, reviewOverrides),
  );
  const authorizerKeys = generateKeyPairSync("ed25519");
  const furtherSubsequentContinuationObservationReviewAuthorizer = {
    privateKey: authorizerKeys.privateKey,
    descriptor: authorizerDescriptor(authorizerKeys),
  };
  const withReview = {
    ...subject,
    furtherSubsequentContinuationObservationReviewAuthorizer,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt:
      reviewed.followingSubsequentContinuationObservationReviewReceipt,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
      reviewed.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
  };
  const controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy =
    createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy(
      authorizationPolicyContext(withReview),
    );
  return {
    ...withReview,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory:
      createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory({
        policy: controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy,
      }),
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...reviewArguments(subject),
    ...authorizationPolicyContext(subject),
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory,
    reviewAuthorizationId: "further-subsequent-continuation-observation-review-authorization-one",
    reviewAuthorizerKeyId: subject.furtherSubsequentContinuationObservationReviewAuthorizer.descriptor.keyId,
    reviewAuthorizerPrivateKey: subject.furtherSubsequentContinuationObservationReviewAuthorizer.privateKey,
    reasonCode: "accepted-review-authorized",
    authorizedAt: "2026-08-09T10:55:00.000Z",
    expiresAt: "2026-08-09T10:59:00.000Z",
    nonce: "further-subsequent-continuation-observation-review-authorization-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política autoriza somente um passe futuro e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy(
      policy,
      authorizationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.acceptedSignedRecordedReviewRequired, true);
    assert.equal(policy.singleUseAuthorizationRequired, true);
    assert.equal(policy.maximumFurtherSubsequentContinuations, 1);
    assert.equal(policy.followingSubsequentContinuationAuthorizationAllowed, true);
    for (const field of [
      "followingSubsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
      "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("revisão aceita, assinada e registrada gera autorização independente append-only", async () => {
  const subject = await fixture();
  try {
    const authorized = authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorization(
      authorized.reviewAuthorization,
      {
        ...authorizationArguments(subject),
        controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.followingSubsequentContinuationAuthorized, true);
    assert.equal(inspection.followingSubsequentContinuationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.entries[0].reviewReceiptHash,
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt
        .followingSubsequentContinuationObservationReviewReceiptHash);
    assert.equal(memory.entries[0].remainingFurtherSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory(memory, {
        policy: subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão rejeitada ou não registrada jamais recebe autorização", async () => {
  const subject = await fixture({
    reviewId: "continuation-observation-review-rejected",
    outcome: "rejected",
    reasonCode: "further-subsequent-continuation-observation-rejected",
    reviewNonce: "continuation-observation-review-rejected-nonce",
  });
  try {
    assert.throws(
      () => authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt:
            subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewReceipt,
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory,
        }),
      ),
      /review_not_accepted/,
    );
    const emptyReviewMemory = createControlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory({
      policy: subject.controlledProofExecutionFurtherSubsequentContinuationObservationReviewPolicy,
    });
    assert.throws(
      () => authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewMemory: emptyReviewMemory,
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
      () => authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
        authorizationArguments(subject, { reviewAuthorizerKeyId: "unknown-authorizer-key" }),
      ),
      /authorizer_untrusted/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => createControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationPolicy(
        authorizationPolicyContext(subject, {
          trustedReviewAuthorizers: [authorizerDescriptor(collidingKeys, {
            actorId: subject.followingSubsequentContinuationObservationReviewer.descriptor.actorId,
          })],
        }),
      ),
      /authorizer_must_be_independent/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          authorizedAt: "2026-08-09T10:59:01.000Z",
          expiresAt: "2026-08-09T11:00:00.000Z",
        }),
      ),
      /authorization_window_expired/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
        authorizationArguments(subject, { expiresAt: "2026-08-09T11:00:01.000Z" }),
      ),
      /authorization_ttl_invalid/,
    );
  } finally { cleanup(subject); }
});

test("uma revisão só pode ser autorizada uma vez", async () => {
  const subject = await fixture();
  try {
    const first = authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    assert.throws(
      () => authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory:
            first.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory,
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
    const authorized = authorizeControlledProofExecutionFurtherSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspect = (reviewAuthorization, authorizationMemory = memory) =>
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorization(reviewAuthorization, {
        ...authorizationArguments(subject),
        controlledProofExecutionFurtherSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
      });
    assert.equal(inspect({ ...authorized.reviewAuthorization, reasonCode: "tampered-reason" }).ok, false);
    assert.equal(inspect({ ...authorized.reviewAuthorization, signature: "tampered" }).ok, false);
    assert.equal(inspect(authorized.reviewAuthorization, { ...memory, memoryHash: "0".repeat(64) }).ok, false);
  } finally { cleanup(subject); }
});

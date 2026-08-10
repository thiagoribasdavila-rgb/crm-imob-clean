import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
  authorizeControlledProofExecutionContinuationObservationReview,
  createControlledProofExecutionContinuationObservationReviewAuthorizationMemory,
  createControlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
  inspectControlledProofExecutionContinuationObservationReviewAuthorization,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
} from "../../lib/release/controlled-proof-execution-continuation-observation-review-authorization.mjs";
import {
  createControlledProofExecutionContinuationObservationReviewMemory,
  reviewControlledProofExecutionContinuationObservation,
} from "../../lib/release/controlled-proof-execution-continuation-observation-review.mjs";
import {
  fixture as reviewFixture,
  reviewArguments,
  reviewPolicyContext,
} from "./controlled-proof-execution-continuation-observation-review.test.mjs";

function authorizerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "continuation-observation-review-authorizer-key-one",
    actorId: "continuation-observation-review-authorizer-one",
    role: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
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
    controlledProofExecutionContinuationObservationReviewPolicy:
      subject.controlledProofExecutionContinuationObservationReviewPolicy,
    trustedReviewAuthorizers: [subject.reviewAuthorizer.descriptor],
    maximumReviewAuthorizationDelaySeconds: 300,
    maximumReviewAuthorizationTtlSeconds: 300,
    ...overrides,
  };
}

export async function fixture(reviewOverrides = {}) {
  const subject = await reviewFixture();
  const reviewed = reviewControlledProofExecutionContinuationObservation(
    reviewArguments(subject, reviewOverrides),
  );
  const authorizerKeys = generateKeyPairSync("ed25519");
  const reviewAuthorizer = {
    privateKey: authorizerKeys.privateKey,
    descriptor: authorizerDescriptor(authorizerKeys),
  };
  const withReview = {
    ...subject,
    reviewAuthorizer,
    controlledProofExecutionContinuationObservationReviewReceipt: reviewed.reviewReceipt,
    controlledProofExecutionContinuationObservationReviewMemory:
      reviewed.controlledProofExecutionContinuationObservationReviewMemory,
  };
  const controlledProofExecutionContinuationObservationReviewAuthorizationPolicy =
    createControlledProofExecutionContinuationObservationReviewAuthorizationPolicy(
      authorizationPolicyContext(withReview),
    );
  return {
    ...withReview,
    controlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionContinuationObservationReviewAuthorizationMemory:
      createControlledProofExecutionContinuationObservationReviewAuthorizationMemory({
        policy: controlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
      }),
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...reviewArguments(subject),
    ...authorizationPolicyContext(subject),
    controlledProofExecutionContinuationObservationReviewReceipt:
      subject.controlledProofExecutionContinuationObservationReviewReceipt,
    controlledProofExecutionContinuationObservationReviewMemory:
      subject.controlledProofExecutionContinuationObservationReviewMemory,
    controlledProofExecutionContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationMemory,
    reviewAuthorizationId: "continuation-observation-review-authorization-one",
    reviewAuthorizerKeyId: subject.reviewAuthorizer.descriptor.keyId,
    reviewAuthorizerPrivateKey: subject.reviewAuthorizer.privateKey,
    reasonCode: "accepted-review-authorized",
    authorizedAt: "2026-08-09T10:36:00.000Z",
    expiresAt: "2026-08-09T10:40:00.000Z",
    nonce: "continuation-observation-review-authorization-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política autoriza somente um passe futuro e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionContinuationObservationReviewAuthorizationPolicy;
    const inspection = inspectControlledProofExecutionContinuationObservationReviewAuthorizationPolicy(
      policy,
      authorizationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.acceptedSignedRecordedReviewRequired, true);
    assert.equal(policy.singleUseAuthorizationRequired, true);
    assert.equal(policy.maximumSubsequentContinuations, 1);
    assert.equal(policy.subsequentContinuationAuthorizationAllowed, true);
    for (const field of [
      "subsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
      "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("revisão aceita, assinada e registrada gera autorização independente append-only", async () => {
  const subject = await fixture();
  try {
    const authorized = authorizeControlledProofExecutionContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionContinuationObservationReviewAuthorizationMemory;
    const inspection = inspectControlledProofExecutionContinuationObservationReviewAuthorization(
      authorized.reviewAuthorization,
      {
        ...authorizationArguments(subject),
        controlledProofExecutionContinuationObservationReviewAuthorizationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.subsequentContinuationAuthorized, true);
    assert.equal(inspection.subsequentContinuationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.entries[0].reviewReceiptHash,
      subject.controlledProofExecutionContinuationObservationReviewReceipt.reviewReceiptHash);
    assert.equal(memory.entries[0].remainingSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionContinuationObservationReviewAuthorizationMemory(memory, {
        policy: subject.controlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão rejeitada ou não registrada jamais recebe autorização", async () => {
  const subject = await fixture({
    reviewId: "continuation-observation-review-rejected",
    outcome: "rejected",
    reasonCode: "continuation-observation-rejected",
    nonce: "continuation-observation-review-rejected-nonce",
  });
  try {
    assert.throws(
      () => authorizeControlledProofExecutionContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionContinuationObservationReviewReceipt:
            subject.controlledProofExecutionContinuationObservationReviewReceipt,
          controlledProofExecutionContinuationObservationReviewMemory:
            subject.controlledProofExecutionContinuationObservationReviewMemory,
        }),
      ),
      /review_not_accepted/,
    );
    const emptyReviewMemory = createControlledProofExecutionContinuationObservationReviewMemory({
      policy: subject.controlledProofExecutionContinuationObservationReviewPolicy,
    });
    assert.throws(
      () => authorizeControlledProofExecutionContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionContinuationObservationReviewMemory: emptyReviewMemory,
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
      () => authorizeControlledProofExecutionContinuationObservationReview(
        authorizationArguments(subject, { reviewAuthorizerKeyId: "unknown-authorizer-key" }),
      ),
      /authorizer_untrusted/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => createControlledProofExecutionContinuationObservationReviewAuthorizationPolicy(
        authorizationPolicyContext(subject, {
          trustedReviewAuthorizers: [authorizerDescriptor(collidingKeys, {
            actorId: subject.observationReviewer.descriptor.actorId,
          })],
        }),
      ),
      /authorizer_must_be_independent/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionContinuationObservationReview(
        authorizationArguments(subject, { authorizedAt: "2026-08-09T10:41:00.000Z" }),
      ),
      /authorization_window_expired/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionContinuationObservationReview(
        authorizationArguments(subject, { expiresAt: "2026-08-09T10:42:00.000Z" }),
      ),
      /authorization_ttl_invalid/,
    );
  } finally { cleanup(subject); }
});

test("uma revisão só pode ser autorizada uma vez", async () => {
  const subject = await fixture();
  try {
    const first = authorizeControlledProofExecutionContinuationObservationReview(
      authorizationArguments(subject),
    );
    assert.throws(
      () => authorizeControlledProofExecutionContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionContinuationObservationReviewAuthorizationMemory:
            first.controlledProofExecutionContinuationObservationReviewAuthorizationMemory,
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
    const authorized = authorizeControlledProofExecutionContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionContinuationObservationReviewAuthorizationMemory;
    const inspect = (reviewAuthorization, authorizationMemory = memory) =>
      inspectControlledProofExecutionContinuationObservationReviewAuthorization(reviewAuthorization, {
        ...authorizationArguments(subject),
        controlledProofExecutionContinuationObservationReviewAuthorizationMemory: authorizationMemory,
      });
    assert.equal(inspect({ ...authorized.reviewAuthorization, reasonCode: "tampered-reason" }).ok, false);
    assert.equal(inspect({ ...authorized.reviewAuthorization, signature: "tampered" }).ok, false);
    assert.equal(inspect(authorized.reviewAuthorization, { ...memory, memoryHash: "0".repeat(64) }).ok, false);
  } finally { cleanup(subject); }
});

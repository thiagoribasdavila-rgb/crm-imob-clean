import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
  authorizeControlledProofExecutionSubsequentContinuationObservationReview,
  createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
  createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization.mjs";
import {
  createControlledProofExecutionSubsequentContinuationObservationReviewMemory,
  reviewControlledProofExecutionSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation-review.mjs";
import {
  fixture as reviewFixture,
  subsequentContinuationObservationReviewArguments as reviewArguments,
  subsequentContinuationObservationReviewPolicyContext as reviewPolicyContext,
} from "./controlled-proof-execution-subsequent-continuation-observation-review.test.mjs";

function authorizerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "phase-239-independent-review-authorizer-key-one",
    actorId: "phase-239-independent-review-authorizer-one",
    role: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
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
    controlledProofExecutionSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
    trustedReviewAuthorizers: [subject.subsequentContinuationObservationReviewAuthorizer.descriptor],
    maximumReviewAuthorizationDelaySeconds: 300,
    maximumReviewAuthorizationTtlSeconds: 300,
    ...overrides,
  };
}

export async function fixture(reviewOverrides = {}) {
  const subject = await reviewFixture();
  const reviewed = reviewControlledProofExecutionSubsequentContinuationObservation(
    reviewArguments(subject, reviewOverrides),
  );
  const authorizerKeys = generateKeyPairSync("ed25519");
  const subsequentContinuationObservationReviewAuthorizer = {
    privateKey: authorizerKeys.privateKey,
    descriptor: authorizerDescriptor(authorizerKeys),
  };
  const withReview = {
    ...subject,
    subsequentContinuationObservationReviewAuthorizer,
    controlledProofExecutionSubsequentContinuationObservationReviewReceipt:
      reviewed.subsequentContinuationObservationReviewReceipt,
    controlledProofExecutionSubsequentContinuationObservationReviewMemory:
      reviewed.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
  };
  const controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy =
    createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
      authorizationPolicyContext(withReview),
    );
  return {
    ...withReview,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory:
      createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory({
        policy: controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
      }),
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...reviewArguments(subject),
    ...authorizationPolicyContext(subject),
    controlledProofExecutionSubsequentContinuationObservationReviewReceipt:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewReceipt,
    controlledProofExecutionSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
    reviewAuthorizationId: "subsequent-continuation-observation-review-authorization-one",
    reviewAuthorizerKeyId: subject.subsequentContinuationObservationReviewAuthorizer.descriptor.keyId,
    reviewAuthorizerPrivateKey: subject.subsequentContinuationObservationReviewAuthorizer.privateKey,
    reasonCode: "accepted-review-authorized",
    authorizedAt: "2026-08-09T10:41:00.000Z",
    expiresAt: "2026-08-09T10:45:00.000Z",
    nonce: "subsequent-continuation-observation-review-authorization-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política autoriza somente um passe futuro e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
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
    const authorized = authorizeControlledProofExecutionSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
      authorized.reviewAuthorization,
      {
        ...authorizationArguments(subject),
        controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.subsequentContinuationAuthorized, true);
    assert.equal(inspection.subsequentContinuationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.entries[0].reviewReceiptHash,
      subject.controlledProofExecutionSubsequentContinuationObservationReviewReceipt
        .subsequentContinuationObservationReviewReceiptHash);
    assert.equal(memory.entries[0].remainingSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory(memory, {
        policy: subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão rejeitada ou não registrada jamais recebe autorização", async () => {
  const subject = await fixture({
    reviewId: "continuation-observation-review-rejected",
    outcome: "rejected",
    reasonCode: "subsequent-continuation-observation-rejected",
    reviewNonce: "continuation-observation-review-rejected-nonce",
  });
  try {
    assert.throws(
      () => authorizeControlledProofExecutionSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewReceipt:
            subject.controlledProofExecutionSubsequentContinuationObservationReviewReceipt,
          controlledProofExecutionSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionSubsequentContinuationObservationReviewMemory,
        }),
      ),
      /review_not_accepted/,
    );
    const emptyReviewMemory = createControlledProofExecutionSubsequentContinuationObservationReviewMemory({
      policy: subject.controlledProofExecutionSubsequentContinuationObservationReviewPolicy,
    });
    assert.throws(
      () => authorizeControlledProofExecutionSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewMemory: emptyReviewMemory,
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
      () => authorizeControlledProofExecutionSubsequentContinuationObservationReview(
        authorizationArguments(subject, { reviewAuthorizerKeyId: "unknown-authorizer-key" }),
      ),
      /authorizer_untrusted/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy(
        authorizationPolicyContext(subject, {
          trustedReviewAuthorizers: [authorizerDescriptor(collidingKeys, {
            actorId: subject.observationReviewer.descriptor.actorId,
          })],
        }),
      ),
      /authorizer_must_be_independent/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          authorizedAt: "2026-08-09T10:46:00.000Z",
          expiresAt: "2026-08-09T10:49:00.000Z",
        }),
      ),
      /authorization_window_expired/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionSubsequentContinuationObservationReview(
        authorizationArguments(subject, { expiresAt: "2026-08-09T10:47:00.000Z" }),
      ),
      /authorization_ttl_invalid/,
    );
  } finally { cleanup(subject); }
});

test("uma revisão só pode ser autorizada uma vez", async () => {
  const subject = await fixture();
  try {
    const first = authorizeControlledProofExecutionSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    assert.throws(
      () => authorizeControlledProofExecutionSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory:
            first.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
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
    const authorized = authorizeControlledProofExecutionSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspect = (reviewAuthorization, authorizationMemory = memory) =>
      inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(reviewAuthorization, {
        ...authorizationArguments(subject),
        controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
      });
    assert.equal(inspect({ ...authorized.reviewAuthorization, reasonCode: "tampered-reason" }).ok, false);
    assert.equal(inspect({ ...authorized.reviewAuthorization, signature: "tampered" }).ok, false);
    assert.equal(inspect(authorized.reviewAuthorization, { ...memory, memoryHash: "0".repeat(64) }).ok, false);
  } finally { cleanup(subject); }
});

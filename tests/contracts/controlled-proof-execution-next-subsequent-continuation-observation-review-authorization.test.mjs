import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
  authorizeControlledProofExecutionNextSubsequentContinuationObservationReview,
  createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
  createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.mjs";
import {
  createControlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
  reviewControlledProofExecutionNextSubsequentContinuationObservation,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review.mjs";
import {
  fixture as reviewFixture,
  nextSubsequentContinuationObservationReviewArguments as reviewArguments,
  nextSubsequentContinuationObservationReviewPolicyContext as reviewPolicyContext,
} from "./controlled-proof-execution-next-subsequent-continuation-observation-review.test.mjs";

function authorizerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "phase-244-independent-review-authorizer-key-one",
    actorId: "phase-244-independent-review-authorizer-one",
    role: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZER_ROLE,
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
    controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
    trustedReviewAuthorizers: [subject.nextSubsequentContinuationObservationReviewAuthorizer.descriptor],
    maximumReviewAuthorizationDelaySeconds: 300,
    maximumReviewAuthorizationTtlSeconds: 300,
    ...overrides,
  };
}

export async function fixture(reviewOverrides = {}) {
  const subject = await reviewFixture();
  const reviewed = reviewControlledProofExecutionNextSubsequentContinuationObservation(
    reviewArguments(subject, reviewOverrides),
  );
  const authorizerKeys = generateKeyPairSync("ed25519");
  const nextSubsequentContinuationObservationReviewAuthorizer = {
    privateKey: authorizerKeys.privateKey,
    descriptor: authorizerDescriptor(authorizerKeys),
  };
  const withReview = {
    ...subject,
    nextSubsequentContinuationObservationReviewAuthorizer,
    controlledProofExecutionNextSubsequentContinuationObservationReviewReceipt:
      reviewed.nextSubsequentContinuationObservationReviewReceipt,
    controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
      reviewed.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
  };
  const controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy =
    createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy(
      authorizationPolicyContext(withReview),
    );
  return {
    ...withReview,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory:
      createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory({
        policy: controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
      }),
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...reviewArguments(subject),
    ...authorizationPolicyContext(subject),
    controlledProofExecutionNextSubsequentContinuationObservationReviewReceipt:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewReceipt,
    controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
    reviewAuthorizationId: "next-subsequent-continuation-observation-review-authorization-one",
    reviewAuthorizerKeyId: subject.nextSubsequentContinuationObservationReviewAuthorizer.descriptor.keyId,
    reviewAuthorizerPrivateKey: subject.nextSubsequentContinuationObservationReviewAuthorizer.privateKey,
    reasonCode: "accepted-review-authorized",
    authorizedAt: "2026-08-09T10:45:00.000Z",
    expiresAt: "2026-08-09T10:49:00.000Z",
    nonce: "next-subsequent-continuation-observation-review-authorization-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política autoriza somente um passe futuro e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy(
      policy,
      authorizationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.acceptedSignedRecordedReviewRequired, true);
    assert.equal(policy.singleUseAuthorizationRequired, true);
    assert.equal(policy.maximumNextSubsequentContinuations, 1);
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
    const authorized = authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
      authorized.reviewAuthorization,
      {
        ...authorizationArguments(subject),
        controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.nextSubsequentContinuationAuthorized, true);
    assert.equal(inspection.nextSubsequentContinuationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.entries[0].reviewReceiptHash,
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewReceipt
        .nextSubsequentContinuationObservationReviewReceiptHash);
    assert.equal(memory.entries[0].remainingNextSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory(memory, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("revisão rejeitada ou não registrada jamais recebe autorização", async () => {
  const subject = await fixture({
    reviewId: "continuation-observation-review-rejected",
    outcome: "rejected",
    reasonCode: "next-subsequent-continuation-observation-rejected",
    reviewNonce: "continuation-observation-review-rejected-nonce",
  });
  try {
    assert.throws(
      () => authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewReceipt:
            subject.controlledProofExecutionNextSubsequentContinuationObservationReviewReceipt,
          controlledProofExecutionNextSubsequentContinuationObservationReviewMemory:
            subject.controlledProofExecutionNextSubsequentContinuationObservationReviewMemory,
        }),
      ),
      /review_not_accepted/,
    );
    const emptyReviewMemory = createControlledProofExecutionNextSubsequentContinuationObservationReviewMemory({
      policy: subject.controlledProofExecutionNextSubsequentContinuationObservationReviewPolicy,
    });
    assert.throws(
      () => authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewMemory: emptyReviewMemory,
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
      () => authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
        authorizationArguments(subject, { reviewAuthorizerKeyId: "unknown-authorizer-key" }),
      ),
      /authorizer_untrusted/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy(
        authorizationPolicyContext(subject, {
          trustedReviewAuthorizers: [authorizerDescriptor(collidingKeys, {
            actorId: subject.nextSubsequentContinuationObservationReviewer.descriptor.actorId,
          })],
        }),
      ),
      /authorizer_must_be_independent/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          authorizedAt: "2026-08-09T10:50:00.000Z",
          expiresAt: "2026-08-09T10:53:00.000Z",
        }),
      ),
      /authorization_window_expired/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
        authorizationArguments(subject, { expiresAt: "2026-08-09T10:51:00.000Z" }),
      ),
      /authorization_ttl_invalid/,
    );
  } finally { cleanup(subject); }
});

test("uma revisão só pode ser autorizada uma vez", async () => {
  const subject = await fixture();
  try {
    const first = authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    assert.throws(
      () => authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
        authorizationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory:
            first.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
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
    const authorized = authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
      authorizationArguments(subject),
    );
    const memory = authorized.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory;
    const inspect = (reviewAuthorization, authorizationMemory = memory) =>
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(reviewAuthorization, {
        ...authorizationArguments(subject),
        controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory: authorizationMemory,
      });
    assert.equal(inspect({ ...authorized.reviewAuthorization, reasonCode: "tampered-reason" }).ok, false);
    assert.equal(inspect({ ...authorized.reviewAuthorization, signature: "tampered" }).ok, false);
    assert.equal(inspect(authorized.reviewAuthorization, { ...memory, memoryHash: "0".repeat(64) }).ok, false);
  } finally { cleanup(subject); }
});

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
  consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
  createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.mjs";
import {
  authorizationArguments,
  authorizationPolicyContext,
  fixture as authorizationFixture,
} from "./controlled-proof-execution-following-subsequent-continuation-observation-review-authorization.test.mjs";

function consumerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "phase-250-independent-review-authorization-consumer-key-one",
    actorId: "phase-250-independent-review-authorization-consumer-one",
    role: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:40:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function consumptionPolicyContext(subject, overrides = {}) {
  return {
    ...authorizationPolicyContext(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationPolicy,
    trustedReviewAuthorizationConsumers: [subject.reviewAuthorizationConsumer.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await authorizationFixture();
  const authorized = authorizeControlledProofExecutionFollowingSubsequentContinuationObservationReview(
    authorizationArguments(subject),
  );
  const consumerKeys = generateKeyPairSync("ed25519");
  const reviewAuthorizationConsumer = {
    privateKey: consumerKeys.privateKey,
    descriptor: consumerDescriptor(consumerKeys),
  };
  const withAuthorization = {
    ...subject,
    reviewAuthorizationConsumer,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization:
      authorized.reviewAuthorization,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory:
      authorized.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
  };
  const controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy =
    createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(withAuthorization),
    );
  return {
    ...withAuthorization,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({
        policy: controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }),
  };
}

export function consumptionArguments(subject, overrides = {}) {
  return {
    ...authorizationArguments(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    reviewAuthorizationConsumptionId: "following-subsequent-continuation-observation-review-authorization-consumption-one",
    reviewAuthorizationConsumerKeyId: subject.reviewAuthorizationConsumer.descriptor.keyId,
    reviewAuthorizationConsumerPrivateKey: subject.reviewAuthorizationConsumer.privateKey,
    consumedAt: "2026-08-09T10:51:00.000Z",
    consumptionNonce: "following-subsequent-continuation-observation-review-authorization-consumption-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente registrar um consumo e mantém continuação e efeitos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      policy,
      consumptionPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedUnexpiredSingleUseAuthorizationRequired, true);
    assert.equal(policy.singleUseConsumptionRequired, true);
    assert.equal(policy.maximumUses, 1);
    assert.equal(policy.authorizationConsumptionAllowed, true);
    for (const field of [
      "followingSubsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
      "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("autorização válida é consumida uma vez, assinada e registrada sem executar continuação", async () => {
  const subject = await fixture();
  try {
    const consumed = consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
      consumed.consumptionReceipt,
      {
        ...consumptionArguments(subject),
        controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.reviewAuthorizationConsumed, true);
    assert.equal(inspection.remainingUses, 0);
    assert.equal(inspection.followingSubsequentContinuationExecuted, false);
    assert.equal(consumed.consumptionReceipt.followingSubsequentContinuationAllowed, false);
    assert.equal(consumed.consumptionReceipt.publicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.consumedSingleUseAuthorizations, 1);
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(memory, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("autorização expirada, não registrada ou consumidor não confiável são recusados", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:54:00.000Z" }),
      ),
      /consumption_after_expiration/,
    );
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory: {
            ...subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationMemory,
            entries: [],
          },
        }),
      ),
      /authorization_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          reviewAuthorizationConsumerKeyId: "following-subsequent-continuation-observation-review-authorization-consumer-key-unknown",
        }),
      ),
      /consumer_untrusted/,
    );
  } finally { cleanup(subject); }
});

test("consumo repetido, id repetido, nonce repetido e chave divergente são recusados", async () => {
  const subject = await fixture();
  try {
    const first = consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const usedMemory = first.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: usedMemory,
          reviewAuthorizationConsumptionId: "following-subsequent-continuation-observation-review-authorization-consumption-two",
          consumptionNonce: "following-subsequent-continuation-observation-review-authorization-consumption-nonce-two",
        }),
      ),
      /already_consumed/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { reviewAuthorizationConsumerPrivateKey: unrelated.privateKey }),
      ),
      /private_key_does_not_match/,
    );
  } finally { cleanup(subject); }
});

test("consumidor inativo, fora da validade ou sem independência é recusado", async () => {
  const subject = await fixture();
  try {
    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactivePolicy = createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: inactivePolicy,
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy: inactivePolicy }),
          reviewAuthorizationConsumerKeyId: inactivePolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /consumer_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(collidingKeys, {
          actorId: subject.followingSubsequentContinuationObservationReviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: collidingPolicy,
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy: collidingPolicy }),
          reviewAuthorizationConsumerKeyId: collidingPolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /consumer_not_independent/,
    );
    assert.throws(
      () => consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:44:59.000Z" }),
      ),
      /consumption_before_authorization|consumer_key_outside_validity/,
    );
  } finally { cleanup(subject); }
});

test("recibo e memória adulterados ou separados do cabeçalho atômico são detectados", async () => {
  const subject = await fixture();
  try {
    const consumed = consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspectionContext = {
      ...consumptionArguments(subject),
      controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt({
        ...consumed.consumptionReceipt,
        remainingUses: 1,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
        consumed.consumptionReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({
        ...memory,
        summary: { ...memory.summary, followingSubsequentContinuationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

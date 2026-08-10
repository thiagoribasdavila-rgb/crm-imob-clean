import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
  consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization,
  createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  authorizeControlledProofExecutionNextSubsequentContinuationObservationReview,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.mjs";
import {
  authorizationArguments,
  authorizationPolicyContext,
  fixture as authorizationFixture,
} from "./controlled-proof-execution-next-subsequent-continuation-observation-review-authorization.test.mjs";

function consumerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "phase-245-independent-review-authorization-consumer-key-one",
    actorId: "phase-245-independent-review-authorization-consumer-one",
    role: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
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
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationPolicy,
    trustedReviewAuthorizationConsumers: [subject.reviewAuthorizationConsumer.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await authorizationFixture();
  const authorized = authorizeControlledProofExecutionNextSubsequentContinuationObservationReview(
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
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization:
      authorized.reviewAuthorization,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory:
      authorized.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
  };
  const controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy =
    createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(withAuthorization),
    );
  return {
    ...withAuthorization,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({
        policy: controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }),
  };
}

export function consumptionArguments(subject, overrides = {}) {
  return {
    ...authorizationArguments(subject),
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    reviewAuthorizationConsumptionId: "next-subsequent-continuation-observation-review-authorization-consumption-one",
    reviewAuthorizationConsumerKeyId: subject.reviewAuthorizationConsumer.descriptor.keyId,
    reviewAuthorizationConsumerPrivateKey: subject.reviewAuthorizationConsumer.privateKey,
    consumedAt: "2026-08-09T10:46:00.000Z",
    consumptionNonce: "next-subsequent-continuation-observation-review-authorization-consumption-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente registrar um consumo e mantém continuação e efeitos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      policy,
      consumptionPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedUnexpiredSingleUseAuthorizationRequired, true);
    assert.equal(policy.singleUseConsumptionRequired, true);
    assert.equal(policy.maximumUses, 1);
    assert.equal(policy.authorizationConsumptionAllowed, true);
    for (const field of [
      "nextSubsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
      "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("autorização válida é consumida uma vez, assinada e registrada sem executar continuação", async () => {
  const subject = await fixture();
  try {
    const consumed = consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
      consumed.consumptionReceipt,
      {
        ...consumptionArguments(subject),
        controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.reviewAuthorizationConsumed, true);
    assert.equal(inspection.remainingUses, 0);
    assert.equal(inspection.nextSubsequentContinuationExecuted, false);
    assert.equal(consumed.consumptionReceipt.nextSubsequentContinuationAllowed, false);
    assert.equal(consumed.consumptionReceipt.publicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.consumedSingleUseAuthorizations, 1);
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(memory, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("autorização expirada, não registrada ou consumidor não confiável são recusados", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:50:00.000Z" }),
      ),
      /consumption_after_expiration/,
    );
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory: {
            ...subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationMemory,
            entries: [],
          },
        }),
      ),
      /authorization_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          reviewAuthorizationConsumerKeyId: "next-subsequent-continuation-observation-review-authorization-consumer-key-unknown",
        }),
      ),
      /consumer_untrusted/,
    );
  } finally { cleanup(subject); }
});

test("consumo repetido, id repetido, nonce repetido e chave divergente são recusados", async () => {
  const subject = await fixture();
  try {
    const first = consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const usedMemory = first.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: usedMemory,
          reviewAuthorizationConsumptionId: "next-subsequent-continuation-observation-review-authorization-consumption-two",
          consumptionNonce: "next-subsequent-continuation-observation-review-authorization-consumption-nonce-two",
        }),
      ),
      /already_consumed/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
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
    const inactivePolicy = createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: inactivePolicy,
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy: inactivePolicy }),
          reviewAuthorizationConsumerKeyId: inactivePolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /consumer_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(collidingKeys, {
          actorId: subject.nextSubsequentContinuationObservationReviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: collidingPolicy,
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy: collidingPolicy }),
          reviewAuthorizationConsumerKeyId: collidingPolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /consumer_not_independent/,
    );
    assert.throws(
      () => consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:44:59.000Z" }),
      ),
      /consumption_before_authorization|consumer_key_outside_validity/,
    );
  } finally { cleanup(subject); }
});

test("recibo e memória adulterados ou separados do cabeçalho atômico são detectados", async () => {
  const subject = await fixture();
  try {
    const consumed = consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspectionContext = {
      ...consumptionArguments(subject),
      controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt({
        ...consumed.consumptionReceipt,
        remainingUses: 1,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
        consumed.consumptionReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({
        ...memory,
        summary: { ...memory.summary, nextSubsequentContinuationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

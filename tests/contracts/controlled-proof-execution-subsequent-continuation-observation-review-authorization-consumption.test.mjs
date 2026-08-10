import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
  consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
  createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  authorizeControlledProofExecutionSubsequentContinuationObservationReview,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization.mjs";
import {
  authorizationArguments,
  authorizationPolicyContext,
  fixture as authorizationFixture,
} from "./controlled-proof-execution-subsequent-continuation-observation-review-authorization.test.mjs";

function consumerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "phase-240-independent-review-authorization-consumer-key-one",
    actorId: "phase-240-independent-review-authorization-consumer-one",
    role: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
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
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationPolicy,
    trustedReviewAuthorizationConsumers: [subject.reviewAuthorizationConsumer.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await authorizationFixture();
  const authorized = authorizeControlledProofExecutionSubsequentContinuationObservationReview(
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
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorization:
      authorized.reviewAuthorization,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory:
      authorized.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
  };
  const controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy =
    createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(withAuthorization),
    );
  return {
    ...withAuthorization,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({
        policy: controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }),
  };
}

export function consumptionArguments(subject, overrides = {}) {
  return {
    ...authorizationArguments(subject),
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorization:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    reviewAuthorizationConsumptionId: "subsequent-continuation-observation-review-authorization-consumption-one",
    reviewAuthorizationConsumerKeyId: subject.reviewAuthorizationConsumer.descriptor.keyId,
    reviewAuthorizationConsumerPrivateKey: subject.reviewAuthorizationConsumer.privateKey,
    consumedAt: "2026-08-09T10:42:00.000Z",
    consumptionNonce: "subsequent-continuation-observation-review-authorization-consumption-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente registrar um consumo e mantém continuação e efeitos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      policy,
      consumptionPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedUnexpiredSingleUseAuthorizationRequired, true);
    assert.equal(policy.singleUseConsumptionRequired, true);
    assert.equal(policy.maximumUses, 1);
    assert.equal(policy.authorizationConsumptionAllowed, true);
    for (const field of [
      "subsequentContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
      "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("autorização válida é consumida uma vez, assinada e registrada sem executar continuação", async () => {
  const subject = await fixture();
  try {
    const consumed = consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
      consumed.consumptionReceipt,
      {
        ...consumptionArguments(subject),
        controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.reviewAuthorizationConsumed, true);
    assert.equal(inspection.remainingUses, 0);
    assert.equal(inspection.subsequentContinuationExecuted, false);
    assert.equal(consumed.consumptionReceipt.subsequentContinuationAllowed, false);
    assert.equal(consumed.consumptionReceipt.publicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.consumedSingleUseAuthorizations, 1);
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory(memory, {
        policy: subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("autorização expirada, não registrada ou consumidor não confiável são recusados", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:45:00.000Z" }),
      ),
      /consumption_after_expiration/,
    );
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory: {
            ...subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationMemory,
            entries: [],
          },
        }),
      ),
      /authorization_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          reviewAuthorizationConsumerKeyId: "subsequent-continuation-observation-review-authorization-consumer-key-unknown",
        }),
      ),
      /consumer_untrusted/,
    );
  } finally { cleanup(subject); }
});

test("consumo repetido, id repetido, nonce repetido e chave divergente são recusados", async () => {
  const subject = await fixture();
  try {
    const first = consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const usedMemory = first.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: usedMemory,
          reviewAuthorizationConsumptionId: "subsequent-continuation-observation-review-authorization-consumption-two",
          consumptionNonce: "subsequent-continuation-observation-review-authorization-consumption-nonce-two",
        }),
      ),
      /already_consumed/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
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
    const inactivePolicy = createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: inactivePolicy,
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy: inactivePolicy }),
          reviewAuthorizationConsumerKeyId: inactivePolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /consumer_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(collidingKeys, {
          actorId: subject.subsequentContinuationObservationReviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy: collidingPolicy,
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({ policy: collidingPolicy }),
          reviewAuthorizationConsumerKeyId: collidingPolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /consumer_not_independent/,
    );
    assert.throws(
      () => consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:40:59.000Z" }),
      ),
      /consumption_before_authorization|consumer_key_outside_validity/,
    );
  } finally { cleanup(subject); }
});

test("recibo e memória adulterados ou separados do cabeçalho atômico são detectados", async () => {
  const subject = await fixture();
  try {
    const consumed = consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspectionContext = {
      ...consumptionArguments(subject),
      controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt({
        ...consumed.consumptionReceipt,
        remainingUses: 1,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionReceipt(
        consumed.consumptionReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
            subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory({
        ...memory,
        summary: { ...memory.summary, subsequentContinuationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

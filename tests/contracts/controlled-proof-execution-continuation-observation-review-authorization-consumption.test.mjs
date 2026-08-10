import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
  consumeControlledProofExecutionContinuationObservationReviewAuthorization,
  createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
  createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
  inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionReceipt,
} from "../../lib/release/controlled-proof-execution-continuation-observation-review-authorization-consumption.mjs";
import {
  authorizeControlledProofExecutionContinuationObservationReview,
} from "../../lib/release/controlled-proof-execution-continuation-observation-review-authorization.mjs";
import {
  authorizationArguments,
  authorizationPolicyContext,
  fixture as authorizationFixture,
} from "./controlled-proof-execution-continuation-observation-review-authorization.test.mjs";

function consumerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "continuation-observation-review-authorization-consumer-key-one",
    actorId: "continuation-observation-review-authorization-consumer-one",
    role: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_REVIEW_AUTHORIZATION_CONSUMER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:30:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function consumptionPolicyContext(subject, overrides = {}) {
  return {
    ...authorizationPolicyContext(subject),
    controlledProofExecutionContinuationObservationReviewAuthorizationPolicy:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationPolicy,
    trustedReviewAuthorizationConsumers: [subject.reviewAuthorizationConsumer.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await authorizationFixture();
  const authorized = authorizeControlledProofExecutionContinuationObservationReview(
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
    controlledProofExecutionContinuationObservationReviewAuthorization:
      authorized.reviewAuthorization,
    controlledProofExecutionContinuationObservationReviewAuthorizationMemory:
      authorized.controlledProofExecutionContinuationObservationReviewAuthorizationMemory,
  };
  const controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy =
    createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(withAuthorization),
    );
  return {
    ...withAuthorization,
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory:
      createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory({
        policy: controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
      }),
  };
}

export function consumptionArguments(subject, overrides = {}) {
  return {
    ...authorizationArguments(subject),
    controlledProofExecutionContinuationObservationReviewAuthorization:
      subject.controlledProofExecutionContinuationObservationReviewAuthorization,
    controlledProofExecutionContinuationObservationReviewAuthorizationMemory:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationMemory,
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
    reviewAuthorizationConsumptionId: "continuation-observation-review-authorization-consumption-one",
    reviewAuthorizationConsumerKeyId: subject.reviewAuthorizationConsumer.descriptor.keyId,
    reviewAuthorizationConsumerPrivateKey: subject.reviewAuthorizationConsumer.privateKey,
    consumedAt: "2026-08-09T10:38:00.000Z",
    consumptionNonce: "continuation-observation-review-authorization-consumption-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente registrar um consumo e mantém continuação e efeitos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy;
    const inspection = inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy(
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
    const consumed = consumeControlledProofExecutionContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspection = inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionReceipt(
      consumed.consumptionReceipt,
      {
        ...consumptionArguments(subject),
        controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory: memory,
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
      inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory(memory, {
        policy: subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("autorização expirada, não registrada ou consumidor não confiável são recusados", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:40:00.000Z" }),
      ),
      /consumption_after_expiration/,
    );
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionContinuationObservationReviewAuthorizationMemory: {
            ...subject.controlledProofExecutionContinuationObservationReviewAuthorizationMemory,
            entries: [],
          },
        }),
      ),
      /authorization_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          reviewAuthorizationConsumerKeyId: "continuation-observation-review-authorization-consumer-key-unknown",
        }),
      ),
      /consumer_untrusted/,
    );
  } finally { cleanup(subject); }
});

test("consumo repetido, id repetido, nonce repetido e chave divergente são recusados", async () => {
  const subject = await fixture();
  try {
    const first = consumeControlledProofExecutionContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const usedMemory = first.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory;
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory: usedMemory,
          reviewAuthorizationConsumptionId: "continuation-observation-review-authorization-consumption-two",
          consumptionNonce: "continuation-observation-review-authorization-consumption-nonce-two",
        }),
      ),
      /already_consumed/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
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
    const inactivePolicy = createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy: inactivePolicy,
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory({ policy: inactivePolicy }),
          reviewAuthorizationConsumerKeyId: inactivePolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /consumer_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy(
      consumptionPolicyContext(subject, {
        trustedReviewAuthorizationConsumers: [consumerDescriptor(collidingKeys, {
          actorId: subject.reviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
        consumptionArguments(subject, {
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy: collidingPolicy,
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory:
            createControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory({ policy: collidingPolicy }),
          reviewAuthorizationConsumerKeyId: collidingPolicy.trustedReviewAuthorizationConsumers[0].keyId,
          reviewAuthorizationConsumerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /consumer_not_independent/,
    );
    assert.throws(
      () => consumeControlledProofExecutionContinuationObservationReviewAuthorization(
        consumptionArguments(subject, { consumedAt: "2026-08-09T10:29:59.000Z" }),
      ),
      /consumption_before_authorization|consumer_key_outside_validity/,
    );
  } finally { cleanup(subject); }
});

test("recibo e memória adulterados ou separados do cabeçalho atômico são detectados", async () => {
  const subject = await fixture();
  try {
    const consumed = consumeControlledProofExecutionContinuationObservationReviewAuthorization(
      consumptionArguments(subject),
    );
    const memory = consumed.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory;
    const inspectionContext = {
      ...consumptionArguments(subject),
      controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionReceipt({
        ...consumed.consumptionReceipt,
        remainingUses: 1,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionReceipt(
        consumed.consumptionReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory:
            subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory({
        ...memory,
        summary: { ...memory.summary, subsequentContinuationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

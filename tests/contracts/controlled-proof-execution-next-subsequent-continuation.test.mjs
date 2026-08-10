import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
  createControlledProofExecutionNextSubsequentContinuationMemory,
  createControlledProofExecutionNextSubsequentContinuationPolicy,
  executeControlledProofExecutionNextSubsequentContinuation,
  inspectControlledProofExecutionNextSubsequentContinuationMemory,
  inspectControlledProofExecutionNextSubsequentContinuationPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationReceipt,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation.mjs";
import {
  consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  consumptionArguments,
  consumptionPolicyContext,
  fixture as consumptionFixture,
} from "./controlled-proof-execution-subsequent-continuation-observation-review-authorization-consumption.test.mjs";

function executorDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-next-subsequent-continuation-executor-key-one",
    actorId: "controlled-proof-execution-next-subsequent-continuation-executor-one",
    role: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:42:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function nextSubsequentContinuationPolicyContext(subject, overrides = {}) {
  return {
    ...consumptionPolicyContext(subject),
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    trustedNextSubsequentContinuationExecutors: [subject.nextSubsequentContinuationExecutor.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await consumptionFixture();
  const consumed = consumeControlledProofExecutionSubsequentContinuationObservationReviewAuthorization(
    consumptionArguments(subject),
  );
  const executorKeys = generateKeyPairSync("ed25519");
  const nextSubsequentContinuationExecutor = {
    privateKey: executorKeys.privateKey,
    descriptor: executorDescriptor(executorKeys),
  };
  const withConsumption = {
    ...subject,
    nextSubsequentContinuationExecutor,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption:
      consumed.consumptionReceipt,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      consumed.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  };
  const controlledProofExecutionNextSubsequentContinuationPolicy =
    createControlledProofExecutionNextSubsequentContinuationPolicy(
      nextSubsequentContinuationPolicyContext(withConsumption),
    );
  return {
    ...withConsumption,
    controlledProofExecutionNextSubsequentContinuationPolicy,
    controlledProofExecutionNextSubsequentContinuationMemory:
      createControlledProofExecutionNextSubsequentContinuationMemory({
        policy: controlledProofExecutionNextSubsequentContinuationPolicy,
      }),
  };
}

export function nextSubsequentContinuationArguments(subject, overrides = {}) {
  return {
    ...consumptionArguments(subject),
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption,
    controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    controlledProofExecutionNextSubsequentContinuationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationPolicy,
    controlledProofExecutionNextSubsequentContinuationMemory:
      subject.controlledProofExecutionNextSubsequentContinuationMemory,
    nextSubsequentContinuationId: "controlled-proof-execution-next-subsequent-continuation-one",
    nextSubsequentContinuationExecutorKeyId: subject.nextSubsequentContinuationExecutor.descriptor.keyId,
    nextSubsequentContinuationExecutorPrivateKey: subject.nextSubsequentContinuationExecutor.privateKey,
    subsequentContinuedAt: "2026-08-09T10:43:00.000Z",
    nextSubsequentContinuationNonce: "controlled-proof-execution-next-subsequent-continuation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente uma continuação subsequente interna e mantém efeitos externos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionNextSubsequentContinuationPolicy;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationPolicy(
      policy,
      nextSubsequentContinuationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedSignedAuthorizationConsumptionRequired, true);
    assert.equal(policy.singleUseNextSubsequentContinuationRequired, true);
    assert.equal(policy.maximumNextSubsequentContinuations, 1);
    assert.equal(policy.nextSubsequentContinuationAllowed, true);
    assert.equal(policy.nextSubsequentContinuationObservationAllowed, false);
    for (const field of [
      "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
      "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration",
      "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("consumo assinado e registrado executa uma continuação subsequente única, assinada e interna", async () => {
  const subject = await fixture();
  try {
    const continued = executeControlledProofExecutionNextSubsequentContinuation(
      nextSubsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionNextSubsequentContinuationMemory;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationReceipt(
      continued.nextSubsequentContinuationReceipt,
      {
        ...nextSubsequentContinuationArguments(subject),
        controlledProofExecutionNextSubsequentContinuationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.nextSubsequentContinuationExecuted, true);
    assert.equal(inspection.nextSubsequentContinuationObserved, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(continued.nextSubsequentContinuationReceipt.authorizationConsumptionRecorded, true);
    assert.equal(continued.nextSubsequentContinuationReceipt.remainingNextSubsequentContinuations, 0);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedNextSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationMemory(memory, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("consumo não registrado, adulterado ou autorização expirada bloqueiam a continuação", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: {
            ...subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
            entries: [],
          },
        }),
      ),
      /consumption_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption: {
            ...subject.controlledProofExecutionSubsequentContinuationObservationReviewAuthorizationConsumption,
            remainingUses: 1,
          },
        }),
      ),
      /authorization_consumption_invalid|receipt_hash_mismatch|contract_invalid/,
    );
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, { subsequentContinuedAt: "2026-08-09T10:46:00.000Z" }),
      ),
      /after_authorization_expiration/,
    );
  } finally { cleanup(subject); }
});

test("o mesmo consumo não pode executar uma segunda continuação", async () => {
  const subject = await fixture();
  try {
    const first = executeControlledProofExecutionNextSubsequentContinuation(
      nextSubsequentContinuationArguments(subject),
    );
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationMemory:
            first.controlledProofExecutionNextSubsequentContinuationMemory,
          nextSubsequentContinuationId: "controlled-proof-execution-next-subsequent-continuation-two",
          nextSubsequentContinuationNonce: "controlled-proof-execution-next-subsequent-continuation-nonce-two",
        }),
      ),
      /authorization_consumption_already_continued/,
    );
  } finally { cleanup(subject); }
});

test("executor não confiável, inativo, não independente ou com chave divergente é recusado", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, {
          nextSubsequentContinuationExecutorKeyId: "controlled-proof-execution-next-subsequent-continuation-executor-key-unknown",
        }),
      ),
      /executor_untrusted/,
    );
    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactivePolicy = createControlledProofExecutionNextSubsequentContinuationPolicy(
      nextSubsequentContinuationPolicyContext(subject, {
        trustedNextSubsequentContinuationExecutors: [executorDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationPolicy: inactivePolicy,
          controlledProofExecutionNextSubsequentContinuationMemory:
            createControlledProofExecutionNextSubsequentContinuationMemory({ policy: inactivePolicy }),
          nextSubsequentContinuationExecutorKeyId: inactivePolicy.trustedNextSubsequentContinuationExecutors[0].keyId,
          nextSubsequentContinuationExecutorPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /executor_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionNextSubsequentContinuationPolicy(
      nextSubsequentContinuationPolicyContext(subject, {
        trustedNextSubsequentContinuationExecutors: [executorDescriptor(collidingKeys, {
          actorId: subject.reviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationPolicy: collidingPolicy,
          controlledProofExecutionNextSubsequentContinuationMemory:
            createControlledProofExecutionNextSubsequentContinuationMemory({ policy: collidingPolicy }),
          nextSubsequentContinuationExecutorKeyId: collidingPolicy.trustedNextSubsequentContinuationExecutors[0].keyId,
          nextSubsequentContinuationExecutorPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /executor_not_independent/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => executeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationArguments(subject, {
          nextSubsequentContinuationExecutorPrivateKey: unrelated.privateKey,
        }),
      ),
      /private_key_does_not_match/,
    );
  } finally { cleanup(subject); }
});

test("recibo, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const continued = executeControlledProofExecutionNextSubsequentContinuation(
      nextSubsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionNextSubsequentContinuationMemory;
    const inspectionContext = {
      ...nextSubsequentContinuationArguments(subject),
      controlledProofExecutionNextSubsequentContinuationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationReceipt({
        ...continued.nextSubsequentContinuationReceipt,
        nextSubsequentContinuationObserved: true,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationReceipt(
        continued.nextSubsequentContinuationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionNextSubsequentContinuationMemory:
            subject.controlledProofExecutionNextSubsequentContinuationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

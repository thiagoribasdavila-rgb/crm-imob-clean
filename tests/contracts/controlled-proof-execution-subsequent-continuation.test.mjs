import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
  createControlledProofExecutionSubsequentContinuationMemory,
  createControlledProofExecutionSubsequentContinuationPolicy,
  executeControlledProofExecutionSubsequentContinuation,
  inspectControlledProofExecutionSubsequentContinuationMemory,
  inspectControlledProofExecutionSubsequentContinuationPolicy,
  inspectControlledProofExecutionSubsequentContinuationReceipt,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation.mjs";
import {
  consumeControlledProofExecutionContinuationObservationReviewAuthorization,
} from "../../lib/release/controlled-proof-execution-continuation-observation-review-authorization-consumption.mjs";
import {
  consumptionArguments,
  consumptionPolicyContext,
  fixture as consumptionFixture,
} from "./controlled-proof-execution-continuation-observation-review-authorization-consumption.test.mjs";

function executorDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-subsequent-continuation-executor-key-one",
    actorId: "controlled-proof-execution-subsequent-continuation-executor-one",
    role: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:38:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function subsequentContinuationPolicyContext(subject, overrides = {}) {
  return {
    ...consumptionPolicyContext(subject),
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionPolicy,
    trustedSubsequentContinuationExecutors: [subject.subsequentContinuationExecutor.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await consumptionFixture();
  const consumed = consumeControlledProofExecutionContinuationObservationReviewAuthorization(
    consumptionArguments(subject),
  );
  const executorKeys = generateKeyPairSync("ed25519");
  const subsequentContinuationExecutor = {
    privateKey: executorKeys.privateKey,
    descriptor: executorDescriptor(executorKeys),
  };
  const withConsumption = {
    ...subject,
    subsequentContinuationExecutor,
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumption:
      consumed.consumptionReceipt,
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory:
      consumed.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
  };
  const controlledProofExecutionSubsequentContinuationPolicy =
    createControlledProofExecutionSubsequentContinuationPolicy(
      subsequentContinuationPolicyContext(withConsumption),
    );
  return {
    ...withConsumption,
    controlledProofExecutionSubsequentContinuationPolicy,
    controlledProofExecutionSubsequentContinuationMemory:
      createControlledProofExecutionSubsequentContinuationMemory({
        policy: controlledProofExecutionSubsequentContinuationPolicy,
      }),
  };
}

export function subsequentContinuationArguments(subject, overrides = {}) {
  return {
    ...consumptionArguments(subject),
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumption:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumption,
    controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
    controlledProofExecutionSubsequentContinuationPolicy:
      subject.controlledProofExecutionSubsequentContinuationPolicy,
    controlledProofExecutionSubsequentContinuationMemory:
      subject.controlledProofExecutionSubsequentContinuationMemory,
    subsequentContinuationId: "controlled-proof-execution-subsequent-continuation-one",
    subsequentContinuationExecutorKeyId: subject.subsequentContinuationExecutor.descriptor.keyId,
    subsequentContinuationExecutorPrivateKey: subject.subsequentContinuationExecutor.privateKey,
    subsequentContinuedAt: "2026-08-09T10:39:00.000Z",
    subsequentContinuationNonce: "controlled-proof-execution-subsequent-continuation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente uma continuação subsequente interna e mantém efeitos externos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionSubsequentContinuationPolicy;
    const inspection = inspectControlledProofExecutionSubsequentContinuationPolicy(
      policy,
      subsequentContinuationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedSignedAuthorizationConsumptionRequired, true);
    assert.equal(policy.singleUseSubsequentContinuationRequired, true);
    assert.equal(policy.maximumSubsequentContinuations, 1);
    assert.equal(policy.subsequentContinuationAllowed, true);
    assert.equal(policy.subsequentContinuationObservationAllowed, false);
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
    const continued = executeControlledProofExecutionSubsequentContinuation(
      subsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionSubsequentContinuationMemory;
    const inspection = inspectControlledProofExecutionSubsequentContinuationReceipt(
      continued.subsequentContinuationReceipt,
      {
        ...subsequentContinuationArguments(subject),
        controlledProofExecutionSubsequentContinuationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.subsequentContinuationExecuted, true);
    assert.equal(inspection.subsequentContinuationObserved, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(continued.subsequentContinuationReceipt.authorizationConsumptionRecorded, true);
    assert.equal(continued.subsequentContinuationReceipt.remainingSubsequentContinuations, 0);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationMemory(memory, {
        policy: subject.controlledProofExecutionSubsequentContinuationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("consumo não registrado, adulterado ou autorização expirada bloqueiam a continuação", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, {
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory: {
            ...subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumptionMemory,
            entries: [],
          },
        }),
      ),
      /consumption_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, {
          controlledProofExecutionContinuationObservationReviewAuthorizationConsumption: {
            ...subject.controlledProofExecutionContinuationObservationReviewAuthorizationConsumption,
            remainingUses: 1,
          },
        }),
      ),
      /authorization_consumption_invalid|receipt_hash_mismatch|contract_invalid/,
    );
    assert.throws(
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, { subsequentContinuedAt: "2026-08-09T10:40:00.000Z" }),
      ),
      /after_authorization_expiration/,
    );
  } finally { cleanup(subject); }
});

test("o mesmo consumo não pode executar uma segunda continuação", async () => {
  const subject = await fixture();
  try {
    const first = executeControlledProofExecutionSubsequentContinuation(
      subsequentContinuationArguments(subject),
    );
    assert.throws(
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, {
          controlledProofExecutionSubsequentContinuationMemory:
            first.controlledProofExecutionSubsequentContinuationMemory,
          subsequentContinuationId: "controlled-proof-execution-subsequent-continuation-two",
          subsequentContinuationNonce: "controlled-proof-execution-subsequent-continuation-nonce-two",
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
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, {
          subsequentContinuationExecutorKeyId: "controlled-proof-execution-subsequent-continuation-executor-key-unknown",
        }),
      ),
      /executor_untrusted/,
    );
    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactivePolicy = createControlledProofExecutionSubsequentContinuationPolicy(
      subsequentContinuationPolicyContext(subject, {
        trustedSubsequentContinuationExecutors: [executorDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, {
          controlledProofExecutionSubsequentContinuationPolicy: inactivePolicy,
          controlledProofExecutionSubsequentContinuationMemory:
            createControlledProofExecutionSubsequentContinuationMemory({ policy: inactivePolicy }),
          subsequentContinuationExecutorKeyId: inactivePolicy.trustedSubsequentContinuationExecutors[0].keyId,
          subsequentContinuationExecutorPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /executor_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionSubsequentContinuationPolicy(
      subsequentContinuationPolicyContext(subject, {
        trustedSubsequentContinuationExecutors: [executorDescriptor(collidingKeys, {
          actorId: subject.reviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, {
          controlledProofExecutionSubsequentContinuationPolicy: collidingPolicy,
          controlledProofExecutionSubsequentContinuationMemory:
            createControlledProofExecutionSubsequentContinuationMemory({ policy: collidingPolicy }),
          subsequentContinuationExecutorKeyId: collidingPolicy.trustedSubsequentContinuationExecutors[0].keyId,
          subsequentContinuationExecutorPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /executor_not_independent/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => executeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationArguments(subject, {
          subsequentContinuationExecutorPrivateKey: unrelated.privateKey,
        }),
      ),
      /private_key_does_not_match/,
    );
  } finally { cleanup(subject); }
});

test("recibo, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const continued = executeControlledProofExecutionSubsequentContinuation(
      subsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionSubsequentContinuationMemory;
    const inspectionContext = {
      ...subsequentContinuationArguments(subject),
      controlledProofExecutionSubsequentContinuationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationReceipt({
        ...continued.subsequentContinuationReceipt,
        subsequentContinuationObserved: true,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationReceipt(
        continued.subsequentContinuationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionSubsequentContinuationMemory:
            subject.controlledProofExecutionSubsequentContinuationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionSubsequentContinuationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

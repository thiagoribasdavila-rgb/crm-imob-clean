import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
  createControlledProofExecutionFollowingSubsequentContinuationMemory,
  createControlledProofExecutionFollowingSubsequentContinuationPolicy,
  executeControlledProofExecutionFollowingSubsequentContinuation,
  inspectControlledProofExecutionFollowingSubsequentContinuationMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationReceipt,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation.mjs";
import {
  consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  consumptionArguments,
  consumptionPolicyContext,
  fixture as consumptionFixture,
} from "./controlled-proof-execution-next-subsequent-continuation-observation-review-authorization-consumption.test.mjs";

function executorDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-following-subsequent-continuation-executor-key-one",
    actorId: "controlled-proof-execution-following-subsequent-continuation-executor-one",
    role: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
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
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    trustedFollowingSubsequentContinuationExecutors: [subject.followingSubsequentContinuationExecutor.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await consumptionFixture();
  const consumed = consumeControlledProofExecutionNextSubsequentContinuationObservationReviewAuthorization(
    consumptionArguments(subject),
  );
  const executorKeys = generateKeyPairSync("ed25519");
  const followingSubsequentContinuationExecutor = {
    privateKey: executorKeys.privateKey,
    descriptor: executorDescriptor(executorKeys),
  };
  const withConsumption = {
    ...subject,
    followingSubsequentContinuationExecutor,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumption:
      consumed.consumptionReceipt,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      consumed.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  };
  const controlledProofExecutionFollowingSubsequentContinuationPolicy =
    createControlledProofExecutionFollowingSubsequentContinuationPolicy(
      nextSubsequentContinuationPolicyContext(withConsumption),
    );
  return {
    ...withConsumption,
    controlledProofExecutionFollowingSubsequentContinuationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationMemory:
      createControlledProofExecutionFollowingSubsequentContinuationMemory({
        policy: controlledProofExecutionFollowingSubsequentContinuationPolicy,
      }),
  };
}

export function followingSubsequentContinuationArguments(subject, overrides = {}) {
  return {
    ...consumptionArguments(subject),
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumption:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumption,
    controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    controlledProofExecutionFollowingSubsequentContinuationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationMemory,
    followingSubsequentContinuationId: "controlled-proof-execution-following-subsequent-continuation-one",
    followingSubsequentContinuationExecutorKeyId: subject.followingSubsequentContinuationExecutor.descriptor.keyId,
    followingSubsequentContinuationExecutorPrivateKey: subject.followingSubsequentContinuationExecutor.privateKey,
    subsequentContinuedAt: "2026-08-09T10:47:00.000Z",
    followingSubsequentContinuationNonce: "controlled-proof-execution-following-subsequent-continuation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente uma continuação subsequente interna e mantém efeitos externos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFollowingSubsequentContinuationPolicy;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationPolicy(
      policy,
      nextSubsequentContinuationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedSignedAuthorizationConsumptionRequired, true);
    assert.equal(policy.singleUseFollowingSubsequentContinuationRequired, true);
    assert.equal(policy.maximumFollowingSubsequentContinuations, 1);
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
    const continued = executeControlledProofExecutionFollowingSubsequentContinuation(
      followingSubsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionFollowingSubsequentContinuationMemory;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationReceipt(
      continued.nextSubsequentContinuationReceipt,
      {
        ...followingSubsequentContinuationArguments(subject),
        controlledProofExecutionFollowingSubsequentContinuationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.nextSubsequentContinuationExecuted, true);
    assert.equal(inspection.nextSubsequentContinuationObserved, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(continued.nextSubsequentContinuationReceipt.authorizationConsumptionRecorded, true);
    assert.equal(continued.nextSubsequentContinuationReceipt.remainingFollowingSubsequentContinuations, 0);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedFollowingSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationMemory(memory, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("consumo não registrado, adulterado ou autorização expirada bloqueiam a continuação", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: {
            ...subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
            entries: [],
          },
        }),
      ),
      /consumption_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumption: {
            ...subject.controlledProofExecutionNextSubsequentContinuationObservationReviewAuthorizationConsumption,
            remainingUses: 1,
          },
        }),
      ),
      /authorization_consumption_invalid|receipt_hash_mismatch|contract_invalid/,
    );
    assert.throws(
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, { subsequentContinuedAt: "2026-08-09T10:50:00.000Z" }),
      ),
      /after_authorization_expiration/,
    );
  } finally { cleanup(subject); }
});

test("o mesmo consumo não pode executar uma segunda continuação", async () => {
  const subject = await fixture();
  try {
    const first = executeControlledProofExecutionFollowingSubsequentContinuation(
      followingSubsequentContinuationArguments(subject),
    );
    assert.throws(
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationMemory:
            first.controlledProofExecutionFollowingSubsequentContinuationMemory,
          followingSubsequentContinuationId: "controlled-proof-execution-following-subsequent-continuation-two",
          followingSubsequentContinuationNonce: "controlled-proof-execution-following-subsequent-continuation-nonce-two",
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
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, {
          followingSubsequentContinuationExecutorKeyId: "controlled-proof-execution-following-subsequent-continuation-executor-key-unknown",
        }),
      ),
      /executor_untrusted/,
    );
    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactivePolicy = createControlledProofExecutionFollowingSubsequentContinuationPolicy(
      nextSubsequentContinuationPolicyContext(subject, {
        trustedFollowingSubsequentContinuationExecutors: [executorDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationPolicy: inactivePolicy,
          controlledProofExecutionFollowingSubsequentContinuationMemory:
            createControlledProofExecutionFollowingSubsequentContinuationMemory({ policy: inactivePolicy }),
          followingSubsequentContinuationExecutorKeyId: inactivePolicy.trustedFollowingSubsequentContinuationExecutors[0].keyId,
          followingSubsequentContinuationExecutorPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /executor_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionFollowingSubsequentContinuationPolicy(
      nextSubsequentContinuationPolicyContext(subject, {
        trustedFollowingSubsequentContinuationExecutors: [executorDescriptor(collidingKeys, {
          actorId: subject.reviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationPolicy: collidingPolicy,
          controlledProofExecutionFollowingSubsequentContinuationMemory:
            createControlledProofExecutionFollowingSubsequentContinuationMemory({ policy: collidingPolicy }),
          followingSubsequentContinuationExecutorKeyId: collidingPolicy.trustedFollowingSubsequentContinuationExecutors[0].keyId,
          followingSubsequentContinuationExecutorPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /executor_not_independent/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => executeControlledProofExecutionFollowingSubsequentContinuation(
        followingSubsequentContinuationArguments(subject, {
          followingSubsequentContinuationExecutorPrivateKey: unrelated.privateKey,
        }),
      ),
      /private_key_does_not_match/,
    );
  } finally { cleanup(subject); }
});

test("recibo, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const continued = executeControlledProofExecutionFollowingSubsequentContinuation(
      followingSubsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionFollowingSubsequentContinuationMemory;
    const inspectionContext = {
      ...followingSubsequentContinuationArguments(subject),
      controlledProofExecutionFollowingSubsequentContinuationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationReceipt({
        ...continued.nextSubsequentContinuationReceipt,
        nextSubsequentContinuationObserved: true,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationReceipt(
        continued.nextSubsequentContinuationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionFollowingSubsequentContinuationMemory:
            subject.controlledProofExecutionFollowingSubsequentContinuationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

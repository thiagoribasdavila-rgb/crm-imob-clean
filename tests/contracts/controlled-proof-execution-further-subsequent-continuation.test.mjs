import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
  createControlledProofExecutionFurtherSubsequentContinuationMemory,
  createControlledProofExecutionFurtherSubsequentContinuationPolicy,
  executeControlledProofExecutionFurtherSubsequentContinuation,
  inspectControlledProofExecutionFurtherSubsequentContinuationMemory,
  inspectControlledProofExecutionFurtherSubsequentContinuationPolicy,
  inspectControlledProofExecutionFurtherSubsequentContinuationReceipt,
} from "../../lib/release/controlled-proof-execution-further-subsequent-continuation.mjs";
import {
  consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.mjs";
import {
  consumptionArguments,
  consumptionPolicyContext,
  fixture as consumptionFixture,
} from "./controlled-proof-execution-following-subsequent-continuation-observation-review-authorization-consumption.test.mjs";

function executorDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-further-subsequent-continuation-executor-key-one",
    actorId: "controlled-proof-execution-further-subsequent-continuation-executor-one",
    role: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_EXECUTOR_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:42:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function followingSubsequentContinuationPolicyContext(subject, overrides = {}) {
  return {
    ...consumptionPolicyContext(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionPolicy,
    trustedFurtherSubsequentContinuationExecutors: [subject.furtherSubsequentContinuationExecutor.descriptor],
    ...overrides,
  };
}

export async function fixture() {
  const subject = await consumptionFixture();
  const consumed = consumeControlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorization(
    consumptionArguments(subject),
  );
  const executorKeys = generateKeyPairSync("ed25519");
  const furtherSubsequentContinuationExecutor = {
    privateKey: executorKeys.privateKey,
    descriptor: executorDescriptor(executorKeys),
  };
  const withConsumption = {
    ...subject,
    furtherSubsequentContinuationExecutor,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption:
      consumed.consumptionReceipt,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      consumed.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
  };
  const controlledProofExecutionFurtherSubsequentContinuationPolicy =
    createControlledProofExecutionFurtherSubsequentContinuationPolicy(
      followingSubsequentContinuationPolicyContext(withConsumption),
    );
  return {
    ...withConsumption,
    controlledProofExecutionFurtherSubsequentContinuationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationMemory:
      createControlledProofExecutionFurtherSubsequentContinuationMemory({
        policy: controlledProofExecutionFurtherSubsequentContinuationPolicy,
      }),
  };
}

export function furtherSubsequentContinuationArguments(subject, overrides = {}) {
  return {
    ...consumptionArguments(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption,
    controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
    controlledProofExecutionFurtherSubsequentContinuationPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationMemory:
      subject.controlledProofExecutionFurtherSubsequentContinuationMemory,
    furtherSubsequentContinuationId: "controlled-proof-execution-further-subsequent-continuation-one",
    furtherSubsequentContinuationExecutorKeyId: subject.furtherSubsequentContinuationExecutor.descriptor.keyId,
    furtherSubsequentContinuationExecutorPrivateKey: subject.furtherSubsequentContinuationExecutor.privateKey,
    subsequentContinuedAt: "2026-08-09T10:52:00.000Z",
    furtherSubsequentContinuationNonce: "controlled-proof-execution-further-subsequent-continuation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente uma continuação subsequente interna e mantém efeitos externos bloqueados", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFurtherSubsequentContinuationPolicy;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationPolicy(
      policy,
      followingSubsequentContinuationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedSignedAuthorizationConsumptionRequired, true);
    assert.equal(policy.singleUseFurtherSubsequentContinuationRequired, true);
    assert.equal(policy.maximumFurtherSubsequentContinuations, 1);
    assert.equal(policy.followingSubsequentContinuationAllowed, true);
    assert.equal(policy.followingSubsequentContinuationObservationAllowed, false);
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
    const continued = executeControlledProofExecutionFurtherSubsequentContinuation(
      furtherSubsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionFurtherSubsequentContinuationMemory;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationReceipt(
      continued.followingSubsequentContinuationReceipt,
      {
        ...furtherSubsequentContinuationArguments(subject),
        controlledProofExecutionFurtherSubsequentContinuationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.followingSubsequentContinuationExecuted, true);
    assert.equal(inspection.followingSubsequentContinuationObserved, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(continued.followingSubsequentContinuationReceipt.authorizationConsumptionRecorded, true);
    assert.equal(continued.followingSubsequentContinuationReceipt.remainingFurtherSubsequentContinuations, 0);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedFurtherSubsequentContinuations, 1);
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationMemory(memory, {
        policy: subject.controlledProofExecutionFurtherSubsequentContinuationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("consumo não registrado, adulterado ou autorização expirada bloqueiam a continuação", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory: {
            ...subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumptionMemory,
            entries: [],
          },
        }),
      ),
      /consumption_memory_invalid|not_recorded/,
    );
    assert.throws(
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption: {
            ...subject.controlledProofExecutionFollowingSubsequentContinuationObservationReviewAuthorizationConsumption,
            remainingUses: 1,
          },
        }),
      ),
      /authorization_consumption_invalid|receipt_hash_mismatch|contract_invalid/,
    );
    assert.throws(
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, { subsequentContinuedAt: "2026-08-09T10:54:00.000Z" }),
      ),
      /after_authorization_expiration/,
    );
  } finally { cleanup(subject); }
});

test("o mesmo consumo não pode executar uma segunda continuação", async () => {
  const subject = await fixture();
  try {
    const first = executeControlledProofExecutionFurtherSubsequentContinuation(
      furtherSubsequentContinuationArguments(subject),
    );
    assert.throws(
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationMemory:
            first.controlledProofExecutionFurtherSubsequentContinuationMemory,
          furtherSubsequentContinuationId: "controlled-proof-execution-further-subsequent-continuation-two",
          furtherSubsequentContinuationNonce: "controlled-proof-execution-further-subsequent-continuation-nonce-two",
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
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, {
          furtherSubsequentContinuationExecutorKeyId: "controlled-proof-execution-further-subsequent-continuation-executor-key-unknown",
        }),
      ),
      /executor_untrusted/,
    );
    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactivePolicy = createControlledProofExecutionFurtherSubsequentContinuationPolicy(
      followingSubsequentContinuationPolicyContext(subject, {
        trustedFurtherSubsequentContinuationExecutors: [executorDescriptor(inactiveKeys, { status: "inactive" })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationPolicy: inactivePolicy,
          controlledProofExecutionFurtherSubsequentContinuationMemory:
            createControlledProofExecutionFurtherSubsequentContinuationMemory({ policy: inactivePolicy }),
          furtherSubsequentContinuationExecutorKeyId: inactivePolicy.trustedFurtherSubsequentContinuationExecutors[0].keyId,
          furtherSubsequentContinuationExecutorPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /executor_inactive/,
    );
    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingPolicy = createControlledProofExecutionFurtherSubsequentContinuationPolicy(
      followingSubsequentContinuationPolicyContext(subject, {
        trustedFurtherSubsequentContinuationExecutors: [executorDescriptor(collidingKeys, {
          actorId: subject.reviewAuthorizer.descriptor.actorId,
        })],
      }),
    );
    assert.throws(
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationPolicy: collidingPolicy,
          controlledProofExecutionFurtherSubsequentContinuationMemory:
            createControlledProofExecutionFurtherSubsequentContinuationMemory({ policy: collidingPolicy }),
          furtherSubsequentContinuationExecutorKeyId: collidingPolicy.trustedFurtherSubsequentContinuationExecutors[0].keyId,
          furtherSubsequentContinuationExecutorPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /executor_not_independent/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => executeControlledProofExecutionFurtherSubsequentContinuation(
        furtherSubsequentContinuationArguments(subject, {
          furtherSubsequentContinuationExecutorPrivateKey: unrelated.privateKey,
        }),
      ),
      /private_key_does_not_match/,
    );
  } finally { cleanup(subject); }
});

test("recibo, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const continued = executeControlledProofExecutionFurtherSubsequentContinuation(
      furtherSubsequentContinuationArguments(subject),
    );
    const memory = continued.controlledProofExecutionFurtherSubsequentContinuationMemory;
    const inspectionContext = {
      ...furtherSubsequentContinuationArguments(subject),
      controlledProofExecutionFurtherSubsequentContinuationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationReceipt({
        ...continued.followingSubsequentContinuationReceipt,
        followingSubsequentContinuationObserved: true,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationReceipt(
        continued.followingSubsequentContinuationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionFurtherSubsequentContinuationMemory:
            subject.controlledProofExecutionFurtherSubsequentContinuationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionFurtherSubsequentContinuationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

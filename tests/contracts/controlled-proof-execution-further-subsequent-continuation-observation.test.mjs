import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
  CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
  createControlledProofExecutionFurtherSubsequentContinuationObservationMemory,
  createControlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionFurtherSubsequentContinuationObservationReceipt,
  observeControlledProofExecutionFurtherSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-further-subsequent-continuation-observation.mjs";
import {
  executeControlledProofExecutionFurtherSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-further-subsequent-continuation.mjs";
import {
  fixture as followingSubsequentContinuationFixture,
  furtherSubsequentContinuationArguments,
  followingSubsequentContinuationPolicyContext,
} from "./controlled-proof-execution-further-subsequent-continuation.test.mjs";

function observerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-further-subsequent-continuation-observer-key-one",
    actorId: "controlled-proof-execution-further-subsequent-continuation-observer-one",
    role: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:42:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function followingSubsequentContinuationObservationPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionFurtherSubsequentContinuationPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationPolicyContext:
      followingSubsequentContinuationPolicyContext(subject),
    trustedFurtherSubsequentContinuationObservers: [subject.furtherSubsequentContinuationObserver.descriptor],
    maximumFurtherSubsequentContinuationObservationDelaySeconds: 300,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await followingSubsequentContinuationFixture();
  const continued = executeControlledProofExecutionFurtherSubsequentContinuation(
    furtherSubsequentContinuationArguments(subject),
  );
  const observerKeys = generateKeyPairSync("ed25519");
  const furtherSubsequentContinuationObserver = {
    privateKey: observerKeys.privateKey,
    descriptor: observerDescriptor(observerKeys),
  };
  const withContinuation = {
    ...subject,
    furtherSubsequentContinuationObserver,
    controlledProofExecutionFurtherSubsequentContinuationReceipt:
      continued.followingSubsequentContinuationReceipt,
    controlledProofExecutionFurtherSubsequentContinuationMemory:
      continued.controlledProofExecutionFurtherSubsequentContinuationMemory,
  };
  const controlledProofExecutionFurtherSubsequentContinuationObservationPolicy =
    createControlledProofExecutionFurtherSubsequentContinuationObservationPolicy(
      followingSubsequentContinuationObservationPolicyContext(withContinuation),
    );
  return {
    ...withContinuation,
    controlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
      createControlledProofExecutionFurtherSubsequentContinuationObservationMemory({
        policy: controlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
      }),
  };
}

export function followingSubsequentContinuationObservationArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionFurtherSubsequentContinuationPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationPolicyContext:
      followingSubsequentContinuationPolicyContext(subject),
    controlledProofExecutionFurtherSubsequentContinuationReceipt:
      subject.controlledProofExecutionFurtherSubsequentContinuationReceipt,
    controlledProofExecutionFurtherSubsequentContinuationReceiptContext:
      furtherSubsequentContinuationArguments(subject),
    controlledProofExecutionFurtherSubsequentContinuationMemory:
      subject.controlledProofExecutionFurtherSubsequentContinuationMemory,
    controlledProofExecutionFurtherSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
    controlledProofExecutionFurtherSubsequentContinuationObservationPolicyContext:
      followingSubsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionFurtherSubsequentContinuationObservationMemory,
    observationId: "controlled-proof-execution-further-subsequent-continuation-observation-one",
    observationKind: CONTROLLED_PROOF_EXECUTION_FURTHER_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerKeyId: subject.furtherSubsequentContinuationObserver.descriptor.keyId,
    observerPrivateKey: subject.furtherSubsequentContinuationObserver.privateKey,
    observedAt: "2026-08-09T10:53:00.000Z",
    observationNonce: "controlled-proof-execution-further-subsequent-continuation-observation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente observação interna, assinada e independente da continuação subsequente", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFurtherSubsequentContinuationObservationPolicy;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationPolicy(
      policy,
      followingSubsequentContinuationObservationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedSignedSubsequentContinuationRequired, true);
    assert.equal(policy.observerIndependenceRequired, true);
    assert.equal(policy.singleObservationPerSubsequentContinuationRequired, true);
    assert.equal(policy.maximumObservationsPerSubsequentContinuation, 1);
    assert.equal(policy.followingSubsequentContinuationObservationAllowed, true);
    assert.equal(policy.followingSubsequentContinuationObservationReviewAllowed, false);
    for (const field of [
      "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
      "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration",
      "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(policy[field], false, field);
  } finally { cleanup(subject); }
});

test("continuação subsequente gravada recebe observação assinada e memória append-only", async () => {
  const subject = await fixture();
  try {
    const observed = observeControlledProofExecutionFurtherSubsequentContinuation(
      followingSubsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionFurtherSubsequentContinuationObservationMemory;
    const inspection = inspectControlledProofExecutionFurtherSubsequentContinuationObservationReceipt(
      observed.followingSubsequentContinuationObservationReceipt,
      {
        ...followingSubsequentContinuationObservationArguments(subject),
        controlledProofExecutionFurtherSubsequentContinuationObservationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.followingSubsequentContinuationExecuted, true);
    assert.equal(inspection.followingSubsequentContinuationObserved, true);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedSubsequentContinuationObservations, 1);
    assert.equal(memory.summary.observedSubsequentContinuations, 1);
    assert.equal(memory.summary.followingSubsequentContinuationObserved, true);
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationMemory(memory, {
        policy: subject.controlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("continuação não gravada ou já observada não pode receber observação", async () => {
  const subject = await fixture();
  try {
    const emptySubsequentMemory = {
      ...subject.controlledProofExecutionFurtherSubsequentContinuationMemory,
      entries: [],
    };
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationMemory: emptySubsequentMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = observeControlledProofExecutionFurtherSubsequentContinuation(
      followingSubsequentContinuationObservationArguments(subject),
    );
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
            first.controlledProofExecutionFurtherSubsequentContinuationObservationMemory,
          observationId: "controlled-proof-execution-further-subsequent-continuation-observation-two",
          observationNonce: "controlled-proof-execution-further-subsequent-continuation-observation-nonce-two",
        }),
      ),
      /already_observed/,
    );
  } finally { cleanup(subject); }
});

test("observador não confiável, inativo, não independente ou com chave divergente é recusado", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          observerKeyId: "controlled-proof-execution-further-subsequent-continuation-observer-key-unknown",
        }),
      ),
      /observer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveObserver = observerDescriptor(inactiveKeys, { status: "inactive" });
    const inactivePolicy = createControlledProofExecutionFurtherSubsequentContinuationObservationPolicy(
      followingSubsequentContinuationObservationPolicyContext(subject, {
        trustedFurtherSubsequentContinuationObservers: [inactiveObserver],
      }),
    );
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationPolicy: inactivePolicy,
          controlledProofExecutionFurtherSubsequentContinuationObservationPolicyContext:
            followingSubsequentContinuationObservationPolicyContext(subject, {
              trustedFurtherSubsequentContinuationObservers: [inactiveObserver],
            }),
          controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
            createControlledProofExecutionFurtherSubsequentContinuationObservationMemory({ policy: inactivePolicy }),
          observerKeyId: inactiveObserver.keyId,
          observerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /observer_inactive/,
    );

    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingObserver = observerDescriptor(collidingKeys, {
      actorId: subject.followingSubsequentContinuationExecutor.descriptor.actorId,
    });
    const collidingPolicyContext = followingSubsequentContinuationObservationPolicyContext(subject, {
      trustedFurtherSubsequentContinuationObservers: [collidingObserver],
    });
    const collidingPolicy = createControlledProofExecutionFurtherSubsequentContinuationObservationPolicy(
      collidingPolicyContext,
    );
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationPolicy: collidingPolicy,
          controlledProofExecutionFurtherSubsequentContinuationObservationPolicyContext: collidingPolicyContext,
          controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
            createControlledProofExecutionFurtherSubsequentContinuationObservationMemory({ policy: collidingPolicy }),
          observerKeyId: collidingObserver.keyId,
          observerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /observer_not_independent/,
    );

    const deepCollidingKeys = generateKeyPairSync("ed25519");
    const deepCollidingObserver = observerDescriptor(deepCollidingKeys, {
      keyId: "controlled-proof-execution-further-subsequent-continuation-observer-key-deep-collision",
      actorId: subject.reviewAuthorizer.descriptor.actorId,
    });
    const deepCollidingPolicyContext = followingSubsequentContinuationObservationPolicyContext(subject, {
      trustedFurtherSubsequentContinuationObservers: [deepCollidingObserver],
    });
    const deepCollidingPolicy = createControlledProofExecutionFurtherSubsequentContinuationObservationPolicy(
      deepCollidingPolicyContext,
    );
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFurtherSubsequentContinuationObservationPolicy: deepCollidingPolicy,
          controlledProofExecutionFurtherSubsequentContinuationObservationPolicyContext: deepCollidingPolicyContext,
          controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
            createControlledProofExecutionFurtherSubsequentContinuationObservationMemory({ policy: deepCollidingPolicy }),
          observerKeyId: deepCollidingObserver.keyId,
          observerPrivateKey: deepCollidingKeys.privateKey,
        }),
      ),
      /observer_not_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          observerPrivateKey: unrelated.privateKey,
        }),
      ),
      /private_key_does_not_match/,
    );
  } finally { cleanup(subject); }
});

test("janela temporal impede observação anterior ou tardia", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:51:59.000Z",
        }),
      ),
      /before_continuation/,
    );
    assert.throws(
      () => observeControlledProofExecutionFurtherSubsequentContinuation(
        followingSubsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:57:01.000Z",
        }),
      ),
      /delay_exceeded/,
    );
  } finally { cleanup(subject); }
});

test("recibo, assinatura, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const observed = observeControlledProofExecutionFurtherSubsequentContinuation(
      followingSubsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionFurtherSubsequentContinuationObservationMemory;
    const inspectionContext = {
      ...followingSubsequentContinuationObservationArguments(subject),
      controlledProofExecutionFurtherSubsequentContinuationObservationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReceipt({
        ...observed.followingSubsequentContinuationObservationReceipt,
        followingSubsequentContinuationObserved: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReceipt({
        ...observed.followingSubsequentContinuationObservationReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationReceipt(
        observed.followingSubsequentContinuationObservationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionFurtherSubsequentContinuationObservationMemory:
            subject.controlledProofExecutionFurtherSubsequentContinuationObservationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFurtherSubsequentContinuationObservationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionFurtherSubsequentContinuationObservationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

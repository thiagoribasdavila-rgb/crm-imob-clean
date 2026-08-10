import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
  CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
  createControlledProofExecutionFollowingSubsequentContinuationObservationMemory,
  createControlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionFollowingSubsequentContinuationObservationReceipt,
  observeControlledProofExecutionFollowingSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation-observation.mjs";
import {
  executeControlledProofExecutionFollowingSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-following-subsequent-continuation.mjs";
import {
  fixture as nextSubsequentContinuationFixture,
  followingSubsequentContinuationArguments,
  nextSubsequentContinuationPolicyContext,
} from "./controlled-proof-execution-following-subsequent-continuation.test.mjs";

function observerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-following-subsequent-continuation-observer-key-one",
    actorId: "controlled-proof-execution-following-subsequent-continuation-observer-one",
    role: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:42:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function nextSubsequentContinuationObservationPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionFollowingSubsequentContinuationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationPolicyContext:
      nextSubsequentContinuationPolicyContext(subject),
    trustedFollowingSubsequentContinuationObservers: [subject.followingSubsequentContinuationObserver.descriptor],
    maximumFollowingSubsequentContinuationObservationDelaySeconds: 300,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await nextSubsequentContinuationFixture();
  const continued = executeControlledProofExecutionFollowingSubsequentContinuation(
    followingSubsequentContinuationArguments(subject),
  );
  const observerKeys = generateKeyPairSync("ed25519");
  const followingSubsequentContinuationObserver = {
    privateKey: observerKeys.privateKey,
    descriptor: observerDescriptor(observerKeys),
  };
  const withContinuation = {
    ...subject,
    followingSubsequentContinuationObserver,
    controlledProofExecutionFollowingSubsequentContinuationReceipt:
      continued.nextSubsequentContinuationReceipt,
    controlledProofExecutionFollowingSubsequentContinuationMemory:
      continued.controlledProofExecutionFollowingSubsequentContinuationMemory,
  };
  const controlledProofExecutionFollowingSubsequentContinuationObservationPolicy =
    createControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(
      nextSubsequentContinuationObservationPolicyContext(withContinuation),
    );
  return {
    ...withContinuation,
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
      createControlledProofExecutionFollowingSubsequentContinuationObservationMemory({
        policy: controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
      }),
  };
}

export function nextSubsequentContinuationObservationArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionFollowingSubsequentContinuationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationPolicyContext:
      nextSubsequentContinuationPolicyContext(subject),
    controlledProofExecutionFollowingSubsequentContinuationReceipt:
      subject.controlledProofExecutionFollowingSubsequentContinuationReceipt,
    controlledProofExecutionFollowingSubsequentContinuationReceiptContext:
      followingSubsequentContinuationArguments(subject),
    controlledProofExecutionFollowingSubsequentContinuationMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationMemory,
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
    controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext:
      nextSubsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionFollowingSubsequentContinuationObservationMemory,
    observationId: "controlled-proof-execution-following-subsequent-continuation-observation-one",
    observationKind: CONTROLLED_PROOF_EXECUTION_FOLLOWING_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerKeyId: subject.followingSubsequentContinuationObserver.descriptor.keyId,
    observerPrivateKey: subject.followingSubsequentContinuationObserver.privateKey,
    observedAt: "2026-08-09T10:48:00.000Z",
    observationNonce: "controlled-proof-execution-following-subsequent-continuation-observation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente observação interna, assinada e independente da continuação subsequente", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(
      policy,
      nextSubsequentContinuationObservationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedSignedSubsequentContinuationRequired, true);
    assert.equal(policy.observerIndependenceRequired, true);
    assert.equal(policy.singleObservationPerSubsequentContinuationRequired, true);
    assert.equal(policy.maximumObservationsPerSubsequentContinuation, 1);
    assert.equal(policy.nextSubsequentContinuationObservationAllowed, true);
    assert.equal(policy.nextSubsequentContinuationObservationReviewAllowed, false);
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
    const observed = observeControlledProofExecutionFollowingSubsequentContinuation(
      nextSubsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionFollowingSubsequentContinuationObservationMemory;
    const inspection = inspectControlledProofExecutionFollowingSubsequentContinuationObservationReceipt(
      observed.nextSubsequentContinuationObservationReceipt,
      {
        ...nextSubsequentContinuationObservationArguments(subject),
        controlledProofExecutionFollowingSubsequentContinuationObservationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.nextSubsequentContinuationExecuted, true);
    assert.equal(inspection.nextSubsequentContinuationObserved, true);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedSubsequentContinuationObservations, 1);
    assert.equal(memory.summary.observedSubsequentContinuations, 1);
    assert.equal(memory.summary.nextSubsequentContinuationObserved, true);
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationMemory(memory, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("continuação não gravada ou já observada não pode receber observação", async () => {
  const subject = await fixture();
  try {
    const emptySubsequentMemory = {
      ...subject.controlledProofExecutionFollowingSubsequentContinuationMemory,
      entries: [],
    };
    assert.throws(
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationMemory: emptySubsequentMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = observeControlledProofExecutionFollowingSubsequentContinuation(
      nextSubsequentContinuationObservationArguments(subject),
    );
    assert.throws(
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
            first.controlledProofExecutionFollowingSubsequentContinuationObservationMemory,
          observationId: "controlled-proof-execution-following-subsequent-continuation-observation-two",
          observationNonce: "controlled-proof-execution-following-subsequent-continuation-observation-nonce-two",
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
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          observerKeyId: "controlled-proof-execution-following-subsequent-continuation-observer-key-unknown",
        }),
      ),
      /observer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveObserver = observerDescriptor(inactiveKeys, { status: "inactive" });
    const inactivePolicy = createControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(
      nextSubsequentContinuationObservationPolicyContext(subject, {
        trustedFollowingSubsequentContinuationObservers: [inactiveObserver],
      }),
    );
    assert.throws(
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationPolicy: inactivePolicy,
          controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext:
            nextSubsequentContinuationObservationPolicyContext(subject, {
              trustedFollowingSubsequentContinuationObservers: [inactiveObserver],
            }),
          controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
            createControlledProofExecutionFollowingSubsequentContinuationObservationMemory({ policy: inactivePolicy }),
          observerKeyId: inactiveObserver.keyId,
          observerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /observer_inactive/,
    );

    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingObserver = observerDescriptor(collidingKeys, {
      actorId: subject.nextSubsequentContinuationExecutor.descriptor.actorId,
    });
    const collidingPolicyContext = nextSubsequentContinuationObservationPolicyContext(subject, {
      trustedFollowingSubsequentContinuationObservers: [collidingObserver],
    });
    const collidingPolicy = createControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(
      collidingPolicyContext,
    );
    assert.throws(
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationPolicy: collidingPolicy,
          controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext: collidingPolicyContext,
          controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
            createControlledProofExecutionFollowingSubsequentContinuationObservationMemory({ policy: collidingPolicy }),
          observerKeyId: collidingObserver.keyId,
          observerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /observer_not_independent/,
    );

    const deepCollidingKeys = generateKeyPairSync("ed25519");
    const deepCollidingObserver = observerDescriptor(deepCollidingKeys, {
      keyId: "controlled-proof-execution-following-subsequent-continuation-observer-key-deep-collision",
      actorId: subject.reviewAuthorizer.descriptor.actorId,
    });
    const deepCollidingPolicyContext = nextSubsequentContinuationObservationPolicyContext(subject, {
      trustedFollowingSubsequentContinuationObservers: [deepCollidingObserver],
    });
    const deepCollidingPolicy = createControlledProofExecutionFollowingSubsequentContinuationObservationPolicy(
      deepCollidingPolicyContext,
    );
    assert.throws(
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionFollowingSubsequentContinuationObservationPolicy: deepCollidingPolicy,
          controlledProofExecutionFollowingSubsequentContinuationObservationPolicyContext: deepCollidingPolicyContext,
          controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
            createControlledProofExecutionFollowingSubsequentContinuationObservationMemory({ policy: deepCollidingPolicy }),
          observerKeyId: deepCollidingObserver.keyId,
          observerPrivateKey: deepCollidingKeys.privateKey,
        }),
      ),
      /observer_not_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
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
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:46:59.000Z",
        }),
      ),
      /before_continuation/,
    );
    assert.throws(
      () => observeControlledProofExecutionFollowingSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:52:01.000Z",
        }),
      ),
      /delay_exceeded/,
    );
  } finally { cleanup(subject); }
});

test("recibo, assinatura, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const observed = observeControlledProofExecutionFollowingSubsequentContinuation(
      nextSubsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionFollowingSubsequentContinuationObservationMemory;
    const inspectionContext = {
      ...nextSubsequentContinuationObservationArguments(subject),
      controlledProofExecutionFollowingSubsequentContinuationObservationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReceipt({
        ...observed.nextSubsequentContinuationObservationReceipt,
        nextSubsequentContinuationObserved: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReceipt({
        ...observed.nextSubsequentContinuationObservationReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationReceipt(
        observed.nextSubsequentContinuationObservationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionFollowingSubsequentContinuationObservationMemory:
            subject.controlledProofExecutionFollowingSubsequentContinuationObservationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionFollowingSubsequentContinuationObservationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionFollowingSubsequentContinuationObservationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

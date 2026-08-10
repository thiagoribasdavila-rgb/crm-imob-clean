import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
  CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
  createControlledProofExecutionNextSubsequentContinuationObservationMemory,
  createControlledProofExecutionNextSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionNextSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionNextSubsequentContinuationObservationReceipt,
  observeControlledProofExecutionNextSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation-observation.mjs";
import {
  executeControlledProofExecutionNextSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-next-subsequent-continuation.mjs";
import {
  fixture as nextSubsequentContinuationFixture,
  nextSubsequentContinuationArguments,
  nextSubsequentContinuationPolicyContext,
} from "./controlled-proof-execution-next-subsequent-continuation.test.mjs";

function observerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-next-subsequent-continuation-observer-key-one",
    actorId: "controlled-proof-execution-next-subsequent-continuation-observer-one",
    role: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:42:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function nextSubsequentContinuationObservationPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionNextSubsequentContinuationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationPolicy,
    controlledProofExecutionNextSubsequentContinuationPolicyContext:
      nextSubsequentContinuationPolicyContext(subject),
    trustedNextSubsequentContinuationObservers: [subject.nextSubsequentContinuationObserver.descriptor],
    maximumNextSubsequentContinuationObservationDelaySeconds: 300,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await nextSubsequentContinuationFixture();
  const continued = executeControlledProofExecutionNextSubsequentContinuation(
    nextSubsequentContinuationArguments(subject),
  );
  const observerKeys = generateKeyPairSync("ed25519");
  const nextSubsequentContinuationObserver = {
    privateKey: observerKeys.privateKey,
    descriptor: observerDescriptor(observerKeys),
  };
  const withContinuation = {
    ...subject,
    nextSubsequentContinuationObserver,
    controlledProofExecutionNextSubsequentContinuationReceipt:
      continued.nextSubsequentContinuationReceipt,
    controlledProofExecutionNextSubsequentContinuationMemory:
      continued.controlledProofExecutionNextSubsequentContinuationMemory,
  };
  const controlledProofExecutionNextSubsequentContinuationObservationPolicy =
    createControlledProofExecutionNextSubsequentContinuationObservationPolicy(
      nextSubsequentContinuationObservationPolicyContext(withContinuation),
    );
  return {
    ...withContinuation,
    controlledProofExecutionNextSubsequentContinuationObservationPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationMemory:
      createControlledProofExecutionNextSubsequentContinuationObservationMemory({
        policy: controlledProofExecutionNextSubsequentContinuationObservationPolicy,
      }),
  };
}

export function nextSubsequentContinuationObservationArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionNextSubsequentContinuationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationPolicy,
    controlledProofExecutionNextSubsequentContinuationPolicyContext:
      nextSubsequentContinuationPolicyContext(subject),
    controlledProofExecutionNextSubsequentContinuationReceipt:
      subject.controlledProofExecutionNextSubsequentContinuationReceipt,
    controlledProofExecutionNextSubsequentContinuationReceiptContext:
      nextSubsequentContinuationArguments(subject),
    controlledProofExecutionNextSubsequentContinuationMemory:
      subject.controlledProofExecutionNextSubsequentContinuationMemory,
    controlledProofExecutionNextSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionNextSubsequentContinuationObservationPolicy,
    controlledProofExecutionNextSubsequentContinuationObservationPolicyContext:
      nextSubsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionNextSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionNextSubsequentContinuationObservationMemory,
    observationId: "controlled-proof-execution-next-subsequent-continuation-observation-one",
    observationKind: CONTROLLED_PROOF_EXECUTION_NEXT_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerKeyId: subject.nextSubsequentContinuationObserver.descriptor.keyId,
    observerPrivateKey: subject.nextSubsequentContinuationObserver.privateKey,
    observedAt: "2026-08-09T10:43:30.000Z",
    observationNonce: "controlled-proof-execution-next-subsequent-continuation-observation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente observação interna, assinada e independente da continuação subsequente", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionNextSubsequentContinuationObservationPolicy;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationPolicy(
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
    const observed = observeControlledProofExecutionNextSubsequentContinuation(
      nextSubsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionNextSubsequentContinuationObservationMemory;
    const inspection = inspectControlledProofExecutionNextSubsequentContinuationObservationReceipt(
      observed.nextSubsequentContinuationObservationReceipt,
      {
        ...nextSubsequentContinuationObservationArguments(subject),
        controlledProofExecutionNextSubsequentContinuationObservationMemory: memory,
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
      inspectControlledProofExecutionNextSubsequentContinuationObservationMemory(memory, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationObservationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("continuação não gravada ou já observada não pode receber observação", async () => {
  const subject = await fixture();
  try {
    const emptySubsequentMemory = {
      ...subject.controlledProofExecutionNextSubsequentContinuationMemory,
      entries: [],
    };
    assert.throws(
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationMemory: emptySubsequentMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = observeControlledProofExecutionNextSubsequentContinuation(
      nextSubsequentContinuationObservationArguments(subject),
    );
    assert.throws(
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationMemory:
            first.controlledProofExecutionNextSubsequentContinuationObservationMemory,
          observationId: "controlled-proof-execution-next-subsequent-continuation-observation-two",
          observationNonce: "controlled-proof-execution-next-subsequent-continuation-observation-nonce-two",
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
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          observerKeyId: "controlled-proof-execution-next-subsequent-continuation-observer-key-unknown",
        }),
      ),
      /observer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveObserver = observerDescriptor(inactiveKeys, { status: "inactive" });
    const inactivePolicy = createControlledProofExecutionNextSubsequentContinuationObservationPolicy(
      nextSubsequentContinuationObservationPolicyContext(subject, {
        trustedNextSubsequentContinuationObservers: [inactiveObserver],
      }),
    );
    assert.throws(
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationPolicy: inactivePolicy,
          controlledProofExecutionNextSubsequentContinuationObservationPolicyContext:
            nextSubsequentContinuationObservationPolicyContext(subject, {
              trustedNextSubsequentContinuationObservers: [inactiveObserver],
            }),
          controlledProofExecutionNextSubsequentContinuationObservationMemory:
            createControlledProofExecutionNextSubsequentContinuationObservationMemory({ policy: inactivePolicy }),
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
      trustedNextSubsequentContinuationObservers: [collidingObserver],
    });
    const collidingPolicy = createControlledProofExecutionNextSubsequentContinuationObservationPolicy(
      collidingPolicyContext,
    );
    assert.throws(
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationPolicy: collidingPolicy,
          controlledProofExecutionNextSubsequentContinuationObservationPolicyContext: collidingPolicyContext,
          controlledProofExecutionNextSubsequentContinuationObservationMemory:
            createControlledProofExecutionNextSubsequentContinuationObservationMemory({ policy: collidingPolicy }),
          observerKeyId: collidingObserver.keyId,
          observerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /observer_not_independent/,
    );

    const deepCollidingKeys = generateKeyPairSync("ed25519");
    const deepCollidingObserver = observerDescriptor(deepCollidingKeys, {
      keyId: "controlled-proof-execution-next-subsequent-continuation-observer-key-deep-collision",
      actorId: subject.reviewAuthorizer.descriptor.actorId,
    });
    const deepCollidingPolicyContext = nextSubsequentContinuationObservationPolicyContext(subject, {
      trustedNextSubsequentContinuationObservers: [deepCollidingObserver],
    });
    const deepCollidingPolicy = createControlledProofExecutionNextSubsequentContinuationObservationPolicy(
      deepCollidingPolicyContext,
    );
    assert.throws(
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          controlledProofExecutionNextSubsequentContinuationObservationPolicy: deepCollidingPolicy,
          controlledProofExecutionNextSubsequentContinuationObservationPolicyContext: deepCollidingPolicyContext,
          controlledProofExecutionNextSubsequentContinuationObservationMemory:
            createControlledProofExecutionNextSubsequentContinuationObservationMemory({ policy: deepCollidingPolicy }),
          observerKeyId: deepCollidingObserver.keyId,
          observerPrivateKey: deepCollidingKeys.privateKey,
        }),
      ),
      /observer_not_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => observeControlledProofExecutionNextSubsequentContinuation(
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
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:42:59.000Z",
        }),
      ),
      /before_continuation/,
    );
    assert.throws(
      () => observeControlledProofExecutionNextSubsequentContinuation(
        nextSubsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:48:01.000Z",
        }),
      ),
      /delay_exceeded/,
    );
  } finally { cleanup(subject); }
});

test("recibo, assinatura, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const observed = observeControlledProofExecutionNextSubsequentContinuation(
      nextSubsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionNextSubsequentContinuationObservationMemory;
    const inspectionContext = {
      ...nextSubsequentContinuationObservationArguments(subject),
      controlledProofExecutionNextSubsequentContinuationObservationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReceipt({
        ...observed.nextSubsequentContinuationObservationReceipt,
        nextSubsequentContinuationObserved: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReceipt({
        ...observed.nextSubsequentContinuationObservationReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationReceipt(
        observed.nextSubsequentContinuationObservationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionNextSubsequentContinuationObservationMemory:
            subject.controlledProofExecutionNextSubsequentContinuationObservationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionNextSubsequentContinuationObservationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionNextSubsequentContinuationObservationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

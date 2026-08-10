import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
  CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
  createControlledProofExecutionSubsequentContinuationObservationMemory,
  createControlledProofExecutionSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationMemory,
  inspectControlledProofExecutionSubsequentContinuationObservationPolicy,
  inspectControlledProofExecutionSubsequentContinuationObservationReceipt,
  observeControlledProofExecutionSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation-observation.mjs";
import {
  executeControlledProofExecutionSubsequentContinuation,
} from "../../lib/release/controlled-proof-execution-subsequent-continuation.mjs";
import {
  fixture as subsequentContinuationFixture,
  subsequentContinuationArguments,
  subsequentContinuationPolicyContext,
} from "./controlled-proof-execution-subsequent-continuation.test.mjs";

function observerDescriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-execution-subsequent-continuation-observer-key-one",
    actorId: "controlled-proof-execution-subsequent-continuation-observer-one",
    role: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:39:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function subsequentContinuationObservationPolicyContext(subject, overrides = {}) {
  return {
    controlledProofExecutionSubsequentContinuationPolicy:
      subject.controlledProofExecutionSubsequentContinuationPolicy,
    controlledProofExecutionSubsequentContinuationPolicyContext:
      subsequentContinuationPolicyContext(subject),
    trustedSubsequentContinuationObservers: [subject.subsequentContinuationObserver.descriptor],
    maximumSubsequentContinuationObservationDelaySeconds: 300,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await subsequentContinuationFixture();
  const continued = executeControlledProofExecutionSubsequentContinuation(
    subsequentContinuationArguments(subject),
  );
  const observerKeys = generateKeyPairSync("ed25519");
  const subsequentContinuationObserver = {
    privateKey: observerKeys.privateKey,
    descriptor: observerDescriptor(observerKeys),
  };
  const withContinuation = {
    ...subject,
    subsequentContinuationObserver,
    controlledProofExecutionSubsequentContinuationReceipt:
      continued.subsequentContinuationReceipt,
    controlledProofExecutionSubsequentContinuationMemory:
      continued.controlledProofExecutionSubsequentContinuationMemory,
  };
  const controlledProofExecutionSubsequentContinuationObservationPolicy =
    createControlledProofExecutionSubsequentContinuationObservationPolicy(
      subsequentContinuationObservationPolicyContext(withContinuation),
    );
  return {
    ...withContinuation,
    controlledProofExecutionSubsequentContinuationObservationPolicy,
    controlledProofExecutionSubsequentContinuationObservationMemory:
      createControlledProofExecutionSubsequentContinuationObservationMemory({
        policy: controlledProofExecutionSubsequentContinuationObservationPolicy,
      }),
  };
}

export function subsequentContinuationObservationArguments(subject, overrides = {}) {
  return {
    controlledProofExecutionSubsequentContinuationPolicy:
      subject.controlledProofExecutionSubsequentContinuationPolicy,
    controlledProofExecutionSubsequentContinuationPolicyContext:
      subsequentContinuationPolicyContext(subject),
    controlledProofExecutionSubsequentContinuationReceipt:
      subject.controlledProofExecutionSubsequentContinuationReceipt,
    controlledProofExecutionSubsequentContinuationReceiptContext:
      subsequentContinuationArguments(subject),
    controlledProofExecutionSubsequentContinuationMemory:
      subject.controlledProofExecutionSubsequentContinuationMemory,
    controlledProofExecutionSubsequentContinuationObservationPolicy:
      subject.controlledProofExecutionSubsequentContinuationObservationPolicy,
    controlledProofExecutionSubsequentContinuationObservationPolicyContext:
      subsequentContinuationObservationPolicyContext(subject),
    controlledProofExecutionSubsequentContinuationObservationMemory:
      subject.controlledProofExecutionSubsequentContinuationObservationMemory,
    observationId: "controlled-proof-execution-subsequent-continuation-observation-one",
    observationKind: CONTROLLED_PROOF_EXECUTION_SUBSEQUENT_CONTINUATION_OBSERVATION_KIND,
    observerKeyId: subject.subsequentContinuationObserver.descriptor.keyId,
    observerPrivateKey: subject.subsequentContinuationObserver.privateKey,
    observedAt: "2026-08-09T10:39:30.000Z",
    observationNonce: "controlled-proof-execution-subsequent-continuation-observation-nonce-one",
    ...overrides,
  };
}

function cleanup(subject) {
  if (subject?.workspaceDir) rmSync(subject.workspaceDir, { recursive: true, force: true });
}

test("política permite somente observação interna, assinada e independente da continuação subsequente", async () => {
  const subject = await fixture();
  try {
    const policy = subject.controlledProofExecutionSubsequentContinuationObservationPolicy;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationPolicy(
      policy,
      subsequentContinuationObservationPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(policy.recordedSignedSubsequentContinuationRequired, true);
    assert.equal(policy.observerIndependenceRequired, true);
    assert.equal(policy.singleObservationPerSubsequentContinuationRequired, true);
    assert.equal(policy.maximumObservationsPerSubsequentContinuation, 1);
    assert.equal(policy.subsequentContinuationObservationAllowed, true);
    assert.equal(policy.subsequentContinuationObservationReviewAllowed, false);
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
    const observed = observeControlledProofExecutionSubsequentContinuation(
      subsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionSubsequentContinuationObservationMemory;
    const inspection = inspectControlledProofExecutionSubsequentContinuationObservationReceipt(
      observed.subsequentContinuationObservationReceipt,
      {
        ...subsequentContinuationObservationArguments(subject),
        controlledProofExecutionSubsequentContinuationObservationMemory: memory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.subsequentContinuationExecuted, true);
    assert.equal(inspection.subsequentContinuationObserved, true);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    assert.equal(memory.entries.length, 1);
    assert.equal(memory.summary.recordedSubsequentContinuationObservations, 1);
    assert.equal(memory.summary.observedSubsequentContinuations, 1);
    assert.equal(memory.summary.subsequentContinuationObserved, true);
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationMemory(memory, {
        policy: subject.controlledProofExecutionSubsequentContinuationObservationPolicy,
      }).ok,
      true,
    );
  } finally { cleanup(subject); }
});

test("continuação não gravada ou já observada não pode receber observação", async () => {
  const subject = await fixture();
  try {
    const emptySubsequentMemory = {
      ...subject.controlledProofExecutionSubsequentContinuationMemory,
      entries: [],
    };
    assert.throws(
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
          controlledProofExecutionSubsequentContinuationMemory: emptySubsequentMemory,
        }),
      ),
      /memory_invalid|not_recorded|receipt_invalid/,
    );
    const first = observeControlledProofExecutionSubsequentContinuation(
      subsequentContinuationObservationArguments(subject),
    );
    assert.throws(
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationMemory:
            first.controlledProofExecutionSubsequentContinuationObservationMemory,
          observationId: "controlled-proof-execution-subsequent-continuation-observation-two",
          observationNonce: "controlled-proof-execution-subsequent-continuation-observation-nonce-two",
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
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
          observerKeyId: "controlled-proof-execution-subsequent-continuation-observer-key-unknown",
        }),
      ),
      /observer_untrusted/,
    );

    const inactiveKeys = generateKeyPairSync("ed25519");
    const inactiveObserver = observerDescriptor(inactiveKeys, { status: "inactive" });
    const inactivePolicy = createControlledProofExecutionSubsequentContinuationObservationPolicy(
      subsequentContinuationObservationPolicyContext(subject, {
        trustedSubsequentContinuationObservers: [inactiveObserver],
      }),
    );
    assert.throws(
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationPolicy: inactivePolicy,
          controlledProofExecutionSubsequentContinuationObservationPolicyContext:
            subsequentContinuationObservationPolicyContext(subject, {
              trustedSubsequentContinuationObservers: [inactiveObserver],
            }),
          controlledProofExecutionSubsequentContinuationObservationMemory:
            createControlledProofExecutionSubsequentContinuationObservationMemory({ policy: inactivePolicy }),
          observerKeyId: inactiveObserver.keyId,
          observerPrivateKey: inactiveKeys.privateKey,
        }),
      ),
      /observer_inactive/,
    );

    const collidingKeys = generateKeyPairSync("ed25519");
    const collidingObserver = observerDescriptor(collidingKeys, {
      actorId: subject.subsequentContinuationExecutor.descriptor.actorId,
    });
    const collidingPolicyContext = subsequentContinuationObservationPolicyContext(subject, {
      trustedSubsequentContinuationObservers: [collidingObserver],
    });
    const collidingPolicy = createControlledProofExecutionSubsequentContinuationObservationPolicy(
      collidingPolicyContext,
    );
    assert.throws(
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
          controlledProofExecutionSubsequentContinuationObservationPolicy: collidingPolicy,
          controlledProofExecutionSubsequentContinuationObservationPolicyContext: collidingPolicyContext,
          controlledProofExecutionSubsequentContinuationObservationMemory:
            createControlledProofExecutionSubsequentContinuationObservationMemory({ policy: collidingPolicy }),
          observerKeyId: collidingObserver.keyId,
          observerPrivateKey: collidingKeys.privateKey,
        }),
      ),
      /observer_not_independent/,
    );

    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
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
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:38:59.000Z",
        }),
      ),
      /before_continuation/,
    );
    assert.throws(
      () => observeControlledProofExecutionSubsequentContinuation(
        subsequentContinuationObservationArguments(subject, {
          observedAt: "2026-08-09T10:44:01.000Z",
        }),
      ),
      /delay_exceeded/,
    );
  } finally { cleanup(subject); }
});

test("recibo, assinatura, memória e cabeça atômica adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const observed = observeControlledProofExecutionSubsequentContinuation(
      subsequentContinuationObservationArguments(subject),
    );
    const memory = observed.controlledProofExecutionSubsequentContinuationObservationMemory;
    const inspectionContext = {
      ...subsequentContinuationObservationArguments(subject),
      controlledProofExecutionSubsequentContinuationObservationMemory: memory,
    };
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReceipt({
        ...observed.subsequentContinuationObservationReceipt,
        subsequentContinuationObserved: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReceipt({
        ...observed.subsequentContinuationObservationReceipt,
        signature: "invalid-signature",
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationReceipt(
        observed.subsequentContinuationObservationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionSubsequentContinuationObservationMemory:
            subject.controlledProofExecutionSubsequentContinuationObservationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionSubsequentContinuationObservationMemory({
        ...memory,
        summary: { ...memory.summary, externalPublicationExecuted: true },
      }, {
        policy: subject.controlledProofExecutionSubsequentContinuationObservationPolicy,
      }).ok,
      false,
    );
  } finally { cleanup(subject); }
});

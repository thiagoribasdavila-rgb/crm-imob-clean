import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_KIND,
  createControlledProofExecutionContinuationObservationMemory,
  createControlledProofExecutionContinuationObservationPolicy,
  inspectControlledProofExecutionContinuationObservationMemory,
  inspectControlledProofExecutionContinuationObservationPolicy,
  inspectControlledProofExecutionContinuationObservationReceipt,
  observeControlledProofExecutionContinuation,
} from "../../lib/release/controlled-proof-execution-continuation-observation.mjs";
import { continueControlledProofExecution } from "../../lib/release/controlled-proof-execution-continuation.mjs";
import {
  continuationArguments,
  fixture as continuationFixture,
  policyContext as continuationPolicyContext,
} from "./controlled-proof-execution-continuation.test.mjs";

function descriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-continuation-observer-key-one",
    actorId: "controlled-proof-continuation-observer-one",
    role: "continuation-observer",
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:00:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function policyContext(subject, overrides = {}) {
  return {
    ...continuationPolicyContext(subject),
    controlledProofExecutionContinuationPolicy:
      subject.controlledProofExecutionContinuationPolicy,
    trustedContinuationObservers: [subject.continuationObserver.descriptor],
    maximumContinuationObservationDelaySeconds: 300,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await continuationFixture();
  const continued = continueControlledProofExecution(continuationArguments(subject));
  const observerKeys = generateKeyPairSync("ed25519");
  const continuationObserver = {
    privateKey: observerKeys.privateKey,
    descriptor: descriptor(observerKeys),
  };
  const withContinuation = {
    ...subject,
    continuationObserver,
    controlledProofExecutionContinuationReceipt: continued.continuationReceipt,
    controlledProofExecutionContinuationMemory:
      continued.controlledProofExecutionContinuationMemory,
  };
  const controlledProofExecutionContinuationObservationPolicy =
    createControlledProofExecutionContinuationObservationPolicy(
      policyContext(withContinuation),
    );
  return {
    ...withContinuation,
    controlledProofExecutionContinuationObservationPolicy,
    controlledProofExecutionContinuationObservationMemory:
      createControlledProofExecutionContinuationObservationMemory({
        policy: controlledProofExecutionContinuationObservationPolicy,
      }),
  };
}

export function observationArguments(subject, overrides = {}) {
  return {
    ...continuationArguments(subject),
    controlledProofExecutionContinuationReceipt:
      subject.controlledProofExecutionContinuationReceipt,
    controlledProofExecutionContinuationMemory:
      subject.controlledProofExecutionContinuationMemory,
    controlledProofExecutionContinuationObservationPolicy:
      subject.controlledProofExecutionContinuationObservationPolicy,
    controlledProofExecutionContinuationObservationMemory:
      subject.controlledProofExecutionContinuationObservationMemory,
    trustedContinuationObservers:
      subject.controlledProofExecutionContinuationObservationPolicy.trustedContinuationObservers,
    maximumContinuationObservationDelaySeconds:
      subject.controlledProofExecutionContinuationObservationPolicy.maximumContinuationObservationDelaySeconds,
    observationId: "controlled-proof-execution-continuation-observation-one",
    observationKind: CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_KIND,
    observerKeyId: subject.continuationObserver.descriptor.keyId,
    observerPrivateKey: subject.continuationObserver.privateKey,
    observedAt: "2026-08-09T10:32:00.000Z",
    nonce: "controlled-proof-execution-continuation-observation-nonce-one",
    ...overrides,
  };
}

test("política permite somente observação independente da continuação registrada", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledProofExecutionContinuationObservationPolicy(
      subject.controlledProofExecutionContinuationObservationPolicy,
      policyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(
      subject.controlledProofExecutionContinuationObservationPolicy.controlledProofExecutionContinuationObservationAllowed,
      true,
    );
    assert.equal(
      subject.controlledProofExecutionContinuationObservationPolicy.maximumObservationsPerContinuation,
      1,
    );
    assert.equal(
      subject.controlledProofExecutionContinuationObservationPolicy.observerIndependenceRequired,
      true,
    );
    assert.deepEqual(
      subject.controlledProofExecutionContinuationObservationPolicy.allowedObservationKinds,
      [CONTROLLED_PROOF_EXECUTION_CONTINUATION_OBSERVATION_KIND],
    );
    for (const key of [
      "subsequentContinuationAuthorizationAllowed", "publicationExecutionAllowed",
      "networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed",
      "automaticPublicationExecution", "automaticPackageGeneration", "automaticBuild",
      "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(subject.controlledProofExecutionContinuationObservationPolicy[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("continuação registrada recebe observação assinada sem efeito externo", async () => {
  const subject = await fixture();
  try {
    const result = observeControlledProofExecutionContinuation(observationArguments(subject));
    const inspection = inspectControlledProofExecutionContinuationObservationReceipt(
      result.observationReceipt,
      {
        ...observationArguments(subject),
        controlledProofExecutionContinuationObservationMemory:
          result.controlledProofExecutionContinuationObservationMemory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.continuationVerified, true);
    assert.equal(inspection.controlledProofExecutionContinued, true);
    assert.equal(inspection.controlledProofExecutionContinuationObserved, true);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    assert.equal(
      result.controlledProofExecutionContinuationObservationMemory.summary.recordedContinuationObservations,
      1,
    );
    assert.equal(
      result.controlledProofExecutionContinuationObservationMemory.summary.observedContinuations,
      1,
    );
    for (const key of [
      "publicationExecuted", "externalPublicationExecuted", "packageGenerated",
      "buildExecuted", "deployExecuted", "releasePromoted",
    ]) assert.equal(result.observationReceipt[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("continuação ausente, observador desconhecido e chave divergente falham fechados", async () => {
  const subject = await fixture();
  try {
    const emptyContinuationMemory = {
      ...subject.controlledProofExecutionContinuationMemory,
      entries: [],
    };
    assert.throws(
      () => observeControlledProofExecutionContinuation(observationArguments(subject, {
        controlledProofExecutionContinuationMemory: emptyContinuationMemory,
      })),
      /continuation_memory_invalid|continuation_not_recorded|continuation_receipt_invalid/,
    );
    assert.throws(
      () => observeControlledProofExecutionContinuation(observationArguments(subject, {
        observerKeyId: "controlled-proof-continuation-observer-key-unknown",
      })),
      /observer_untrusted/,
    );
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => observeControlledProofExecutionContinuation(observationArguments(subject, {
        observerPrivateKey: unrelated.privateKey,
      })),
      /private_key_does_not_match/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("observador é independente de executor, autorizador e observador anterior", async () => {
  const subject = await fixture();
  try {
    for (const actorId of [
      subject.controlledProofExecutionContinuationReceipt.externalExecutorActorId,
      subject.controlledProofExecutionContinuationReceipt.continuationAuthorizerActorId,
      subject.controlledProofExecutionContinuationReceipt.observerActorId,
    ]) {
      const nonIndependentPolicy =
        createControlledProofExecutionContinuationObservationPolicy(policyContext(subject, {
          trustedContinuationObservers: [{
            ...subject.continuationObserver.descriptor,
            actorId,
          }],
        }));
      assert.throws(
        () => observeControlledProofExecutionContinuation(observationArguments(subject, {
          controlledProofExecutionContinuationObservationPolicy: nonIndependentPolicy,
          controlledProofExecutionContinuationObservationMemory:
            createControlledProofExecutionContinuationObservationMemory({
              policy: nonIndependentPolicy,
            }),
          trustedContinuationObservers: nonIndependentPolicy.trustedContinuationObservers,
        })),
        /observer_not_independent/,
      );
    }
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("observação respeita a ordem temporal e a janela delimitada", async () => {
  const subject = await fixture();
  try {
    assert.throws(
      () => observeControlledProofExecutionContinuation(observationArguments(subject, {
        observedAt: "2026-08-09T10:31:19.000Z",
      })),
      /observation_before_continuation/,
    );
    assert.throws(
      () => observeControlledProofExecutionContinuation(observationArguments(subject, {
        observedAt: "2026-08-09T10:36:21.000Z",
      })),
      /observation_window_expired/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("cada continuação só pode ser observada uma vez", async () => {
  const subject = await fixture();
  try {
    const first = observeControlledProofExecutionContinuation(observationArguments(subject));
    assert.throws(
      () => observeControlledProofExecutionContinuation(observationArguments(subject, {
        controlledProofExecutionContinuationObservationMemory:
          first.controlledProofExecutionContinuationObservationMemory,
        observationId: "controlled-proof-execution-continuation-observation-two",
        nonce: "controlled-proof-execution-continuation-observation-nonce-two",
      })),
      /continuation_already_observed/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("adulterações no recibo e na memória são detectadas", async () => {
  const subject = await fixture();
  try {
    const result = observeControlledProofExecutionContinuation(observationArguments(subject));
    const inspectionContext = {
      ...observationArguments(subject),
      controlledProofExecutionContinuationObservationMemory:
        result.controlledProofExecutionContinuationObservationMemory,
    };
    assert.equal(
      inspectControlledProofExecutionContinuationObservationReceipt({
        ...result.observationReceipt,
        controlledProofExecutionContinuationObserved: false,
      }, inspectionContext).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionContinuationObservationReceipt(
        result.observationReceipt,
        {
          ...inspectionContext,
          controlledProofExecutionContinuationObservationMemory:
            subject.controlledProofExecutionContinuationObservationMemory,
        },
      ).ok,
      false,
    );
    assert.equal(
      inspectControlledProofExecutionContinuationObservationMemory({
        ...result.controlledProofExecutionContinuationObservationMemory,
        summary: {
          ...result.controlledProofExecutionContinuationObservationMemory.summary,
          publicationExecuted: true,
        },
      }, {
        policy: subject.controlledProofExecutionContinuationObservationPolicy,
      }).ok,
      false,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

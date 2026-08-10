import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_OBSERVATION_KIND,
  createControlledProofExecutionObservationMemory,
  createControlledProofExecutionObservationPolicy,
  inspectControlledProofExecutionObservationMemory,
  inspectControlledProofExecutionObservationPolicy,
  inspectControlledProofExecutionObservationReceipt,
  observeControlledProofExecution,
} from "../../lib/release/controlled-proof-execution-observation.mjs";
import { startControlledProofExecution } from "../../lib/release/controlled-proof-execution-start.mjs";
import {
  fixture as startFixture,
  policyContext as startPolicyContext,
  startArguments,
} from "./controlled-proof-execution-start.test.mjs";

function descriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-observer-key-one",
    actorId: "controlled-proof-observer-one",
    role: "proof-observer",
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:00:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function policyContext(subject, overrides = {}) {
  return {
    ...startPolicyContext(subject),
    controlledProofExecutionStartPolicy: subject.controlledProofExecutionStartPolicy,
    trustedProofObservers: [subject.observer.descriptor],
    maximumObservationDelaySeconds: 300,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await startFixture();
  const started = startControlledProofExecution(startArguments(subject));
  const observerKeys = generateKeyPairSync("ed25519");
  const observer = { privateKey: observerKeys.privateKey, descriptor: descriptor(observerKeys) };
  const withStart = {
    ...subject,
    observer,
    controlledProofExecutionStartReceipt: started.executionStartReceipt,
    controlledProofExecutionStartMemory: started.controlledProofExecutionStartMemory,
  };
  const controlledProofExecutionObservationPolicy = createControlledProofExecutionObservationPolicy(policyContext(withStart));
  return {
    ...withStart,
    controlledProofExecutionObservationPolicy,
    controlledProofExecutionObservationMemory: createControlledProofExecutionObservationMemory({
      policy: controlledProofExecutionObservationPolicy,
    }),
  };
}

export function observationArguments(subject, overrides = {}) {
  return {
    ...startArguments(subject),
    controlledProofExecutionStartReceipt: subject.controlledProofExecutionStartReceipt,
    controlledProofExecutionStartMemory: subject.controlledProofExecutionStartMemory,
    trustedProofObservers: [subject.observer.descriptor],
    maximumObservationDelaySeconds: 300,
    controlledProofExecutionObservationPolicy: subject.controlledProofExecutionObservationPolicy,
    controlledProofExecutionObservationMemory: subject.controlledProofExecutionObservationMemory,
    observationId: "controlled-proof-execution-observation-one",
    observationKind: CONTROLLED_PROOF_EXECUTION_OBSERVATION_KIND,
    observerKeyId: subject.observer.descriptor.keyId,
    observerPrivateKey: subject.observer.privateKey,
    observedAt: "2026-08-09T10:31:00.000Z",
    nonce: "controlled-proof-execution-observation-nonce-one",
    ...overrides,
  };
}

test("política permite somente observação interna assinada e independente", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledProofExecutionObservationPolicy(
      subject.controlledProofExecutionObservationPolicy,
      policyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(subject.controlledProofExecutionObservationPolicy.controlledProofExecutionObservationAllowed, true);
    assert.equal(subject.controlledProofExecutionObservationPolicy.maximumObservationsPerExecutionStart, 1);
    assert.equal(subject.controlledProofExecutionObservationPolicy.observerIndependenceRequired, true);
    assert.deepEqual(subject.controlledProofExecutionObservationPolicy.allowedObservationKinds, [CONTROLLED_PROOF_EXECUTION_OBSERVATION_KIND]);
    for (const key of [
      "controlledProofExecutionContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPublicationExecution",
      "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(subject.controlledProofExecutionObservationPolicy[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("início registrado recebe uma observação determinística sem efeito externo", async () => {
  const subject = await fixture();
  try {
    const result = observeControlledProofExecution(observationArguments(subject));
    const inspection = inspectControlledProofExecutionObservationReceipt(result.observationReceipt, {
      ...observationArguments(subject),
      controlledProofExecutionObservationMemory: result.controlledProofExecutionObservationMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.controlledProofExecutionStarted, true);
    assert.equal(inspection.controlledProofExecutionObserved, true);
    assert.equal(inspection.controlledProofExecutionContinued, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    assert.equal(result.controlledProofExecutionObservationMemory.summary.recordedExecutionObservations, 1);
    assert.equal(result.controlledProofExecutionObservationMemory.summary.observedExecutionStarts, 1);
    assert.equal(result.observationReceipt.buildExecuted, false);
    assert.equal(result.observationReceipt.deployExecuted, false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("início não registrado, observador incorreto e chave divergente são rejeitados", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => observeControlledProofExecution(observationArguments(subject, {
      controlledProofExecutionStartMemory: subject.controlledProofExecutionStartMemory.entries.length
        ? { ...subject.controlledProofExecutionStartMemory, entries: [] }
        : subject.controlledProofExecutionStartMemory,
    })), /start_memory_invalid|start_receipt_invalid|start_not_recorded/);
    assert.throws(() => observeControlledProofExecution(observationArguments(subject, {
      observerKeyId: "controlled-proof-observer-key-wrong",
    })), /observer_untrusted/);
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(() => observeControlledProofExecution(observationArguments(subject, {
      observerPrivateKey: unrelated.privateKey,
    })), /private_key_does_not_match_controlled_proof_execution_observer/);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("observador deve ser independente e observar dentro da janela delimitada", async () => {
  const subject = await fixture();
  try {
    const nonIndependentPolicy = createControlledProofExecutionObservationPolicy(policyContext(subject, {
      trustedProofObservers: [{
        ...subject.observer.descriptor,
        actorId: subject.controlledProofExecutionStartReceipt.externalExecutorActorId,
      }],
    }));
    assert.throws(() => observeControlledProofExecution(observationArguments(subject, {
      controlledProofExecutionObservationPolicy: nonIndependentPolicy,
      controlledProofExecutionObservationMemory: createControlledProofExecutionObservationMemory({ policy: nonIndependentPolicy }),
      trustedProofObservers: nonIndependentPolicy.trustedProofObservers,
    })), /observer_not_independent/);
    assert.throws(() => observeControlledProofExecution(observationArguments(subject, {
      observedAt: "2026-08-09T10:30:51.000Z",
    })), /observation_before_start/);
    assert.throws(() => observeControlledProofExecution(observationArguments(subject, {
      observedAt: "2026-08-09T10:35:53.000Z",
    })), /observation_window_expired/);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("cada início só pode ser observado uma vez e IDs e nonces não repetem", async () => {
  const subject = await fixture();
  try {
    const first = observeControlledProofExecution(observationArguments(subject));
    assert.throws(() => observeControlledProofExecution(observationArguments(subject, {
      controlledProofExecutionObservationMemory: first.controlledProofExecutionObservationMemory,
      observationId: "controlled-proof-execution-observation-two",
      nonce: "controlled-proof-execution-observation-nonce-two",
    })), /start_already_observed/);
    assert.throws(() => createControlledProofExecutionObservationMemory({
      policy: subject.controlledProofExecutionObservationPolicy,
      entries: [
        first.controlledProofExecutionObservationMemory.entries[0],
        {
          ...first.controlledProofExecutionObservationMemory.entries[0],
          sequence: 2,
          previousEntryHash: first.controlledProofExecutionObservationMemory.entries[0].entryHash,
        },
      ],
    }), /already_observed|duplicate_id|duplicate_nonce|head_binding|hash_mismatch/);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("recibo e memória de observação adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const result = observeControlledProofExecution(observationArguments(subject));
    const inspectionContext = {
      ...observationArguments(subject),
      controlledProofExecutionObservationMemory: result.controlledProofExecutionObservationMemory,
    };
    assert.equal(inspectControlledProofExecutionObservationReceipt({
      ...result.observationReceipt,
      controlledProofExecutionContinued: true,
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledProofExecutionObservationReceipt(result.observationReceipt, {
      ...inspectionContext,
      controlledProofExecutionObservationMemory: subject.controlledProofExecutionObservationMemory,
    }).ok, false);
    assert.equal(inspectControlledProofExecutionObservationMemory({
      ...result.controlledProofExecutionObservationMemory,
      summary: {
        ...result.controlledProofExecutionObservationMemory.summary,
        externalPublicationExecuted: true,
      },
    }, { policy: subject.controlledProofExecutionObservationPolicy }).ok, false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

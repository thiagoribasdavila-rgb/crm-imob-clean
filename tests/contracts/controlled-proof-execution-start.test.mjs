import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  createControlledProofExecutionStartMemory,
  createControlledProofExecutionStartPolicy,
  inspectControlledProofExecutionStartMemory,
  inspectControlledProofExecutionStartPolicy,
  inspectControlledProofExecutionStartReceipt,
  startControlledProofExecution,
} from "../../lib/release/controlled-proof-execution-start.mjs";
import {
  authorizeControlledProofExecutionStart,
} from "../../lib/release/controlled-proof-execution-start-authorization.mjs";
import {
  authorizationArguments,
  fixture as authorizationFixture,
} from "./controlled-proof-execution-start-authorization.test.mjs";

export function policyContext(subject) {
  return {
    ...authorizationArguments(subject),
    controlledProofExecutionStartAuthorizationPolicy:
      subject.controlledProofExecutionStartAuthorizationPolicy,
  };
}

export async function fixture() {
  const subject = await authorizationFixture();
  const authorized = authorizeControlledProofExecutionStart(authorizationArguments(subject));
  const controlledProofExecutionStartPolicy =
    createControlledProofExecutionStartPolicy(policyContext(subject));
  const controlledProofExecutionStartMemory =
    createControlledProofExecutionStartMemory({ policy: controlledProofExecutionStartPolicy });
  return {
    ...subject,
    controlledProofExecutionStartAuthorization: authorized.startAuthorization,
    controlledProofExecutionStartAuthorizationMemory:
      authorized.controlledProofExecutionStartAuthorizationMemory,
    controlledProofExecutionStartPolicy,
    controlledProofExecutionStartMemory,
  };
}

export function startArguments(subject, overrides = {}) {
  return {
    ...authorizationArguments(subject),
    controlledProofExecutionStartAuthorization:
      subject.controlledProofExecutionStartAuthorization,
    controlledProofExecutionStartAuthorizationMemory:
      subject.controlledProofExecutionStartAuthorizationMemory,
    controlledProofExecutionStartPolicy: subject.controlledProofExecutionStartPolicy,
    controlledProofExecutionStartMemory: subject.controlledProofExecutionStartMemory,
    executionStartId: "controlled-proof-execution-start-one",
    externalExecutorKeyId: subject.executor.descriptor.keyId,
    externalExecutorPrivateKey: subject.executor.privateKey,
    startedAt: "2026-08-09T10:30:52.000Z",
    nonce: "controlled-proof-execution-start-nonce-one",
    ...overrides,
  };
}

test("política permite somente registrar o início controlado", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledProofExecutionStartPolicy(
      subject.controlledProofExecutionStartPolicy,
      policyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.deepEqual(
      subject.controlledProofExecutionStartPolicy.trustedStartExecutors,
      [subject.executor.descriptor],
    );
    assert.equal(subject.controlledProofExecutionStartPolicy.controlledProofExecutionStartAllowed, true);
    assert.equal(subject.controlledProofExecutionStartPolicy.maximumStarts, 1);
    for (const key of [
      "controlledProofExecutionObservationAllowed",
      "publicationExecutionAllowed",
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPublicationExecution",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledProofExecutionStartPolicy[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("autorização registrada e vigente inicia uma única prova sem efeito externo", async () => {
  const subject = await fixture();
  try {
    const result = startControlledProofExecution(startArguments(subject));
    const inspection = inspectControlledProofExecutionStartReceipt(
      result.executionStartReceipt,
      {
        ...startArguments(subject),
        controlledProofExecutionStartMemory: result.controlledProofExecutionStartMemory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.startAuthorizationConsumed, true);
    assert.equal(inspection.remainingStarts, 0);
    assert.equal(inspection.controlledProofExecutionStarted, true);
    assert.equal(inspection.controlledProofExecutionObserved, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    assert.equal(result.controlledProofExecutionStartMemory.summary.recordedExecutionStarts, 1);
    assert.equal(result.controlledProofExecutionStartMemory.summary.consumedStartAuthorizations, 1);
    assert.equal(result.executionStartReceipt.buildExecuted, false);
    assert.equal(result.executionStartReceipt.deployExecuted, false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("autorização expirada, executor incorreto e chave divergente são rejeitados", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => startControlledProofExecution(startArguments(subject, {
      startedAt: "2026-08-09T10:30:54.000Z",
    })), /authorization_expired/);
    assert.throws(() => startControlledProofExecution(startArguments(subject, {
      externalExecutorKeyId: "external-publication-executor-wrong-key",
    })), /wrong_target_executor/);
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(() => startControlledProofExecution(startArguments(subject, {
      externalExecutorPrivateKey: unrelated.privateKey,
    })), /private_key_does_not_match_controlled_proof_execution_start_executor/);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("autorização de início é consumida uma vez e IDs e nonces não podem repetir", async () => {
  const subject = await fixture();
  try {
    const first = startControlledProofExecution(startArguments(subject));
    assert.throws(() => startControlledProofExecution(startArguments(subject, {
      controlledProofExecutionStartMemory: first.controlledProofExecutionStartMemory,
      executionStartId: "controlled-proof-execution-start-two",
      nonce: "controlled-proof-execution-start-nonce-two",
    })), /authorization_already_consumed/);
    assert.throws(() => createControlledProofExecutionStartMemory({
      policy: subject.controlledProofExecutionStartPolicy,
      entries: [
        first.controlledProofExecutionStartMemory.entries[0],
        {
          ...first.controlledProofExecutionStartMemory.entries[0],
          sequence: 2,
          previousEntryHash: first.controlledProofExecutionStartMemory.entries[0].entryHash,
        },
      ],
    }), /already_consumed|duplicate_id|duplicate_nonce|head_binding|hash_mismatch/);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("recibo e memória adulterados são detectados", async () => {
  const subject = await fixture();
  try {
    const result = startControlledProofExecution(startArguments(subject));
    const inspectionContext = {
      ...startArguments(subject),
      controlledProofExecutionStartMemory: result.controlledProofExecutionStartMemory,
    };
    assert.equal(inspectControlledProofExecutionStartReceipt({
      ...result.executionStartReceipt,
      controlledProofExecutionObserved: true,
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledProofExecutionStartReceipt(result.executionStartReceipt, {
      ...inspectionContext,
      controlledProofExecutionStartMemory: subject.controlledProofExecutionStartMemory,
    }).ok, false);
    assert.equal(inspectControlledProofExecutionStartMemory({
      ...result.controlledProofExecutionStartMemory,
      summary: {
        ...result.controlledProofExecutionStartMemory.summary,
        externalPublicationExecuted: true,
      },
    }, { policy: subject.controlledProofExecutionStartPolicy }).ok, false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

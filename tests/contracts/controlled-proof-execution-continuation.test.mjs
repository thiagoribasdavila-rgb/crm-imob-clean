import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  continueControlledProofExecution,
  createControlledProofExecutionContinuationMemory,
  createControlledProofExecutionContinuationPolicy,
  inspectControlledProofExecutionContinuationMemory,
  inspectControlledProofExecutionContinuationPolicy,
  inspectControlledProofExecutionContinuationReceipt,
} from "../../lib/release/controlled-proof-execution-continuation.mjs";
import {
  authorizeControlledProofExecutionContinuation,
  createControlledProofExecutionContinuationAuthorizationMemory,
} from "../../lib/release/controlled-proof-execution-continuation-authorization.mjs";
import {
  authorizationArguments,
  fixture as authorizationFixture,
  policyContext as authorizationPolicyContext,
} from "./controlled-proof-execution-continuation-authorization.test.mjs";

export function policyContext(subject, overrides = {}) {
  return {
    ...authorizationPolicyContext(subject),
    controlledProofExecutionContinuationAuthorizationPolicy:
      subject.controlledProofExecutionContinuationAuthorizationPolicy,
    controlledProofExecutionStartPolicy: subject.controlledProofExecutionStartPolicy,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await authorizationFixture();
  const authorized = authorizeControlledProofExecutionContinuation(
    authorizationArguments(subject),
  );
  const withAuthorization = {
    ...subject,
    controlledProofExecutionContinuationAuthorization:
      authorized.continuationAuthorization,
    controlledProofExecutionContinuationAuthorizationMemory:
      authorized.controlledProofExecutionContinuationAuthorizationMemory,
  };
  const controlledProofExecutionContinuationPolicy =
    createControlledProofExecutionContinuationPolicy(policyContext(withAuthorization));
  return {
    ...withAuthorization,
    controlledProofExecutionContinuationPolicy,
    controlledProofExecutionContinuationMemory:
      createControlledProofExecutionContinuationMemory({
        policy: controlledProofExecutionContinuationPolicy,
      }),
  };
}

export function continuationArguments(subject, overrides = {}) {
  return {
    ...authorizationArguments(subject),
    controlledProofExecutionContinuationAuthorization:
      subject.controlledProofExecutionContinuationAuthorization,
    controlledProofExecutionContinuationAuthorizationMemory:
      subject.controlledProofExecutionContinuationAuthorizationMemory,
    controlledProofExecutionContinuationPolicy:
      subject.controlledProofExecutionContinuationPolicy,
    controlledProofExecutionContinuationMemory:
      subject.controlledProofExecutionContinuationMemory,
    continuationId: "controlled-proof-execution-continuation-one",
    externalExecutorKeyId: subject.executor.descriptor.keyId,
    externalExecutorPrivateKey: subject.executor.privateKey,
    continuedAt: "2026-08-09T10:31:20.000Z",
    nonce: "controlled-proof-execution-continuation-nonce-one",
    ...overrides,
  };
}

test("política permite somente uma continuação interna autorizada", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledProofExecutionContinuationPolicy(
      subject.controlledProofExecutionContinuationPolicy,
      policyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.deepEqual(
      subject.controlledProofExecutionContinuationPolicy.trustedContinuationExecutors,
      [subject.executor.descriptor],
    );
    assert.equal(
      subject.controlledProofExecutionContinuationPolicy.controlledProofExecutionContinuationAllowed,
      true,
    );
    assert.equal(subject.controlledProofExecutionContinuationPolicy.maximumContinuations, 1);
    for (const key of [
      "publicationExecutionAllowed", "networkAccessAllowed", "databaseMutationAllowed",
      "externalPublicationAllowed", "automaticPublicationExecution", "automaticPackageGeneration",
      "automaticBuild", "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(subject.controlledProofExecutionContinuationPolicy[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("autorização registrada é consumida uma vez e gera recibo verificável", async () => {
  const subject = await fixture();
  try {
    const result = continueControlledProofExecution(continuationArguments(subject));
    const inspection = inspectControlledProofExecutionContinuationReceipt(
      result.continuationReceipt,
      {
        ...continuationArguments(subject),
        controlledProofExecutionContinuationMemory:
          result.controlledProofExecutionContinuationMemory,
      },
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspection.controlledProofExecutionContinued, true);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    const memoryInspection = inspectControlledProofExecutionContinuationMemory(
      result.controlledProofExecutionContinuationMemory,
      { policy: subject.controlledProofExecutionContinuationPolicy },
    );
    assert.equal(memoryInspection.ok, true);
    assert.equal(memoryInspection.recordedContinuations, 1);
    assert.equal(memoryInspection.consumedContinuationAuthorizations, 1);
    assert.equal(result.continuationReceipt.remainingContinuations, 0);
    for (const key of [
      "publicationExecuted", "externalPublicationExecuted", "packageGenerated",
      "buildExecuted", "deployExecuted", "releasePromoted",
    ]) assert.equal(result.continuationReceipt[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("autorização ausente da memória bloqueia a continuação", async () => {
  const subject = await fixture();
  try {
    const emptyAuthorizationMemory =
      createControlledProofExecutionContinuationAuthorizationMemory({
        policy: subject.controlledProofExecutionContinuationAuthorizationPolicy,
      });
    assert.throws(
      () => continueControlledProofExecution(continuationArguments(subject, {
        controlledProofExecutionContinuationAuthorizationMemory: emptyAuthorizationMemory,
      })),
      /continuation_authorization_(invalid:.*not_recorded|not_recorded)/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("executor divergente, chave errada e autorização expirada falham fechados", async () => {
  const subject = await fixture();
  try {
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(
      () => continueControlledProofExecution(continuationArguments(subject, {
        externalExecutorKeyId: "external-publication-executor-wrong-key",
      })),
      /executor_binding_mismatch/,
    );
    assert.throws(
      () => continueControlledProofExecution(continuationArguments(subject, {
        externalExecutorPrivateKey: unrelated.privateKey,
      })),
      /private_key_does_not_match/,
    );
    assert.throws(
      () => continueControlledProofExecution(continuationArguments(subject, {
        continuedAt: "2026-08-09T10:31:41.000Z",
      })),
      /authorization_expired/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("replay da autorização é rejeitado", async () => {
  const subject = await fixture();
  try {
    const first = continueControlledProofExecution(continuationArguments(subject));
    const withMemory = {
      ...subject,
      controlledProofExecutionContinuationMemory:
        first.controlledProofExecutionContinuationMemory,
    };
    assert.throws(
      () => continueControlledProofExecution(continuationArguments(withMemory, {
        continuationId: "controlled-proof-execution-continuation-two",
        nonce: "controlled-proof-execution-continuation-nonce-two",
      })),
      /authorization_already_consumed/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("adulterações no recibo e na memória são detectadas", async () => {
  const subject = await fixture();
  try {
    const result = continueControlledProofExecution(continuationArguments(subject));
    const tamperedReceipt = {
      ...result.continuationReceipt,
      controlledProofExecutionContinued: false,
    };
    assert.equal(
      inspectControlledProofExecutionContinuationReceipt(tamperedReceipt, {
        ...continuationArguments(subject),
        controlledProofExecutionContinuationMemory:
          result.controlledProofExecutionContinuationMemory,
      }).ok,
      false,
    );
    const tamperedMemory = {
      ...result.controlledProofExecutionContinuationMemory,
      entries: result.controlledProofExecutionContinuationMemory.entries.map((entry) => ({
        ...entry,
        remainingContinuations: 1,
      })),
    };
    assert.equal(
      inspectControlledProofExecutionContinuationMemory(tamperedMemory, {
        policy: subject.controlledProofExecutionContinuationPolicy,
      }).ok,
      false,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

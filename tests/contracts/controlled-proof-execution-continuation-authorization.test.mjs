import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZER_ROLE,
  authorizeControlledProofExecutionContinuation,
  createControlledProofExecutionContinuationAuthorizationMemory,
  createControlledProofExecutionContinuationAuthorizationPolicy,
  inspectControlledProofExecutionContinuationAuthorization,
  inspectControlledProofExecutionContinuationAuthorizationMemory,
  inspectControlledProofExecutionContinuationAuthorizationPolicy,
} from "../../lib/release/controlled-proof-execution-continuation-authorization.mjs";
import { observeControlledProofExecution } from "../../lib/release/controlled-proof-execution-observation.mjs";
import {
  fixture as observationFixture,
  observationArguments,
  policyContext as observationPolicyContext,
} from "./controlled-proof-execution-observation.test.mjs";

function descriptor(keyPair, overrides = {}) {
  return {
    keyId: "controlled-proof-continuation-authorizer-key-one",
    actorId: "controlled-proof-continuation-authorizer-one",
    role: CONTROLLED_PROOF_EXECUTION_CONTINUATION_AUTHORIZER_ROLE,
    publicKeyPem: keyPair.publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
    validFrom: "2026-08-09T10:00:00.000Z",
    validUntil: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

export function policyContext(subject, overrides = {}) {
  return {
    ...observationPolicyContext(subject),
    controlledProofExecutionObservationPolicy: subject.controlledProofExecutionObservationPolicy,
    trustedContinuationAuthorizers: [subject.continuationAuthorizer.descriptor],
    maximumAuthorizationDelaySeconds: 300,
    maximumAuthorizationTtlSeconds: 300,
    ...overrides,
  };
}

export async function fixture() {
  const subject = await observationFixture();
  const observed = observeControlledProofExecution(observationArguments(subject));
  const authorizerKeys = generateKeyPairSync("ed25519");
  const continuationAuthorizer = {
    privateKey: authorizerKeys.privateKey,
    descriptor: descriptor(authorizerKeys),
  };
  const withObservation = {
    ...subject,
    continuationAuthorizer,
    controlledProofExecutionObservationReceipt: observed.observationReceipt,
    controlledProofExecutionObservationMemory: observed.controlledProofExecutionObservationMemory,
  };
  const controlledProofExecutionContinuationAuthorizationPolicy = createControlledProofExecutionContinuationAuthorizationPolicy(
    policyContext(withObservation),
  );
  return {
    ...withObservation,
    controlledProofExecutionContinuationAuthorizationPolicy,
    controlledProofExecutionContinuationAuthorizationMemory: createControlledProofExecutionContinuationAuthorizationMemory({
      policy: controlledProofExecutionContinuationAuthorizationPolicy,
    }),
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...observationArguments(subject),
    controlledProofExecutionObservationReceipt: subject.controlledProofExecutionObservationReceipt,
    controlledProofExecutionObservationMemory: subject.controlledProofExecutionObservationMemory,
    trustedContinuationAuthorizers: [subject.continuationAuthorizer.descriptor],
    maximumAuthorizationDelaySeconds: 300,
    maximumAuthorizationTtlSeconds: 300,
    controlledProofExecutionContinuationAuthorizationPolicy: subject.controlledProofExecutionContinuationAuthorizationPolicy,
    controlledProofExecutionContinuationAuthorizationMemory: subject.controlledProofExecutionContinuationAuthorizationMemory,
    continuationAuthorizationId: "controlled-proof-execution-continuation-authorization-one",
    continuationAuthorizerKeyId: subject.continuationAuthorizer.descriptor.keyId,
    continuationAuthorizerPrivateKey: subject.continuationAuthorizer.privateKey,
    reasonCode: "proof-observation-confirmed",
    authorizedAt: "2026-08-09T10:31:10.000Z",
    expiresAt: "2026-08-09T10:31:40.000Z",
    nonce: "controlled-proof-execution-continuation-authorization-nonce-one",
    ...overrides,
  };
}

test("política permite somente autorização interna, curta e de uso único", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledProofExecutionContinuationAuthorizationPolicy(
      subject.controlledProofExecutionContinuationAuthorizationPolicy,
      policyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(subject.controlledProofExecutionContinuationAuthorizationPolicy.controlledProofExecutionContinuationAuthorizationAllowed, true);
    assert.equal(subject.controlledProofExecutionContinuationAuthorizationPolicy.maximumContinuations, 1);
    assert.equal(subject.controlledProofExecutionContinuationAuthorizationPolicy.authorizerIndependenceRequired, true);
    assert.equal(subject.controlledProofExecutionContinuationAuthorizationPolicy.maximumAuthorizationTtlSeconds, 300);
    for (const key of [
      "controlledProofExecutionContinuationAllowed", "publicationExecutionAllowed", "networkAccessAllowed",
      "databaseMutationAllowed", "externalPublicationAllowed", "automaticPackageGeneration", "automaticBuild",
      "automaticDeploy", "automaticReleasePromotion",
    ]) assert.equal(subject.controlledProofExecutionContinuationAuthorizationPolicy[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("observação registrada recebe autorização determinística sem executar continuidade", async () => {
  const subject = await fixture();
  try {
    const result = authorizeControlledProofExecutionContinuation(authorizationArguments(subject));
    const inspection = inspectControlledProofExecutionContinuationAuthorization(result.continuationAuthorization, {
      ...authorizationArguments(subject),
      controlledProofExecutionContinuationAuthorizationMemory: result.controlledProofExecutionContinuationAuthorizationMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.controlledProofExecutionContinuationAuthorized, true);
    assert.equal(inspection.controlledProofExecutionContinued, false);
    assert.equal(inspection.publicationExecuted, false);
    assert.equal(inspection.externalPublicationExecuted, false);
    assert.equal(result.controlledProofExecutionContinuationAuthorizationMemory.summary.recordedContinuationAuthorizations, 1);
    assert.equal(result.controlledProofExecutionContinuationAuthorizationMemory.summary.authorizedObservations, 1);
    assert.equal(result.continuationAuthorization.remainingContinuations, 1);
    assert.equal(result.continuationAuthorization.buildExecuted, false);
    assert.equal(result.continuationAuthorization.deployExecuted, false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("observação não registrada, autorizador desconhecido e chave divergente são rejeitados", async () => {
  const subject = await fixture();
  try {
    const emptyObservationMemory = {
      ...subject.controlledProofExecutionObservationMemory,
      entries: [],
      summary: {
        ...subject.controlledProofExecutionObservationMemory.summary,
        recordedExecutionObservations: 0,
        observedExecutionStarts: 0,
        distinctObservations: 0,
        latestEntryHash: null,
        controlledProofExecutionStarted: false,
        controlledProofExecutionObserved: false,
      },
    };
    assert.throws(
      () => authorizeControlledProofExecutionContinuation(authorizationArguments(subject, {
        controlledProofExecutionObservationMemory: emptyObservationMemory,
      })),
      /controlled_proof_execution_observation_memory_invalid|controlled_proof_execution_observation_not_recorded/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionContinuation(authorizationArguments(subject, {
        continuationAuthorizerKeyId: "unknown-continuation-authorizer-key",
      })),
      /controlled_proof_execution_continuation_authorizer_untrusted/,
    );
    const wrongKeys = generateKeyPairSync("ed25519");
    assert.throws(
      () => authorizeControlledProofExecutionContinuation(authorizationArguments(subject, {
        continuationAuthorizerPrivateKey: wrongKeys.privateKey,
      })),
      /private_key_does_not_match_controlled_proof_execution_continuation_authorizer/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("independência, janela curta e validade da autorização são obrigatórias", async () => {
  const subject = await fixture();
  try {
    const notIndependent = {
      ...subject.continuationAuthorizer.descriptor,
      actorId: subject.controlledProofExecutionObservationReceipt.observerActorId,
    };
    const notIndependentPolicy = createControlledProofExecutionContinuationAuthorizationPolicy(policyContext(subject, {
      trustedContinuationAuthorizers: [notIndependent],
    }));
    assert.throws(
      () => authorizeControlledProofExecutionContinuation(authorizationArguments(subject, {
        trustedContinuationAuthorizers: [notIndependent],
        controlledProofExecutionContinuationAuthorizationPolicy: notIndependentPolicy,
        controlledProofExecutionContinuationAuthorizationMemory: createControlledProofExecutionContinuationAuthorizationMemory({ policy: notIndependentPolicy }),
      })),
      /controlled_proof_execution_continuation_authorizer_not_independent/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionContinuation(authorizationArguments(subject, {
        authorizedAt: "2026-08-09T10:40:00.000Z",
        expiresAt: "2026-08-09T10:40:30.000Z",
      })),
      /controlled_proof_execution_continuation_authorization_window_expired/,
    );
    assert.throws(
      () => authorizeControlledProofExecutionContinuation(authorizationArguments(subject, {
        expiresAt: "2026-08-09T10:37:00.000Z",
      })),
      /controlled_proof_execution_continuation_authorization_ttl_invalid/,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("uma observação, um id e um nonce não podem autorizar novamente", async () => {
  const subject = await fixture();
  try {
    const first = authorizeControlledProofExecutionContinuation(authorizationArguments(subject));
    const withMemory = {
      ...subject,
      controlledProofExecutionContinuationAuthorizationMemory: first.controlledProofExecutionContinuationAuthorizationMemory,
    };
    assert.throws(
      () => authorizeControlledProofExecutionContinuation(authorizationArguments(withMemory, {
        continuationAuthorizationId: "controlled-proof-execution-continuation-authorization-two",
        nonce: "controlled-proof-execution-continuation-authorization-nonce-two",
      })),
      /controlled_proof_execution_observation_already_authorized_for_continuation/,
    );
    const memoryInspection = inspectControlledProofExecutionContinuationAuthorizationMemory(
      first.controlledProofExecutionContinuationAuthorizationMemory,
      { policy: subject.controlledProofExecutionContinuationAuthorizationPolicy },
    );
    assert.equal(memoryInspection.ok, true);
    assert.equal(memoryInspection.distinctAuthorizations, 1);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("adulteração da autorização e da memória é detectada", async () => {
  const subject = await fixture();
  try {
    const result = authorizeControlledProofExecutionContinuation(authorizationArguments(subject));
    const inspectionContext = {
      ...authorizationArguments(subject),
      controlledProofExecutionContinuationAuthorizationMemory: result.controlledProofExecutionContinuationAuthorizationMemory,
    };
    assert.equal(inspectControlledProofExecutionContinuationAuthorization({
      ...result.continuationAuthorization,
      reasonCode: "tampered-reason",
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledProofExecutionContinuationAuthorizationMemory({
      ...result.controlledProofExecutionContinuationAuthorizationMemory,
      entries: result.controlledProofExecutionContinuationAuthorizationMemory.entries.map((entry) => ({
        ...entry,
        controlledProofExecutionContinued: true,
      })),
    }, { policy: subject.controlledProofExecutionContinuationAuthorizationPolicy }).ok, false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

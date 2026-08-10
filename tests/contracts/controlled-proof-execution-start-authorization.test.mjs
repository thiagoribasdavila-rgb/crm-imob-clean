import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  authorizeControlledProofExecutionStart,
  createControlledProofExecutionStartAuthorizationMemory,
  createControlledProofExecutionStartAuthorizationPolicy,
  inspectControlledProofExecutionStartAuthorization,
  inspectControlledProofExecutionStartAuthorizationMemory,
  inspectControlledProofExecutionStartAuthorizationPolicy,
} from "../../lib/release/controlled-proof-execution-start-authorization.mjs";
import {
  consumeControlledExternalPublicationExecutionPermit,
  createControlledExternalPublicationExecutionPermitConsumptionMemory,
} from "../../lib/release/controlled-external-publication-execution-permit-consumption.mjs";
import {
  consumptionArguments,
  fixture as consumptionFixture,
} from "./controlled-external-publication-execution-permit-consumption.test.mjs";

function startPolicyContext(subject) {
  return {
    ...consumptionArguments(subject),
    controlledExternalPublicationExecutionPermitConsumptionPolicy:
      subject.controlledExternalPublicationExecutionPermitConsumptionPolicy,
  };
}

export async function fixture() {
  const subject = await consumptionFixture();
  const consumed = consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject));
  const controlledProofExecutionStartAuthorizationPolicy =
    createControlledProofExecutionStartAuthorizationPolicy(startPolicyContext(subject));
  const controlledProofExecutionStartAuthorizationMemory =
    createControlledProofExecutionStartAuthorizationMemory({
      policy: controlledProofExecutionStartAuthorizationPolicy,
    });
  return {
    ...subject,
    controlledExternalPublicationExecutionPermitConsumptionReceipt: consumed.consumptionReceipt,
    controlledExternalPublicationExecutionPermitConsumptionMemory:
      consumed.controlledExternalPublicationExecutionPermitConsumptionMemory,
    controlledProofExecutionStartAuthorizationPolicy,
    controlledProofExecutionStartAuthorizationMemory,
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...consumptionArguments(subject),
    controlledExternalPublicationExecutionPermitConsumptionReceipt:
      subject.controlledExternalPublicationExecutionPermitConsumptionReceipt,
    controlledExternalPublicationExecutionPermitConsumptionMemory:
      subject.controlledExternalPublicationExecutionPermitConsumptionMemory,
    controlledProofExecutionStartAuthorizationPolicy:
      subject.controlledProofExecutionStartAuthorizationPolicy,
    controlledProofExecutionStartAuthorizationMemory:
      subject.controlledProofExecutionStartAuthorizationMemory,
    startAuthorizationId: "controlled-proof-execution-start-authorization-one",
    startAuthorizerKeyId: subject.executor.descriptor.keyId,
    startAuthorizerPrivateKey: subject.executor.privateKey,
    reasonCode: "controlled-proof-execution-start-approved",
    authorizedAt: "2026-08-09T10:30:51.000Z",
    expiresAt: "2026-08-09T10:30:54.000Z",
    nonce: "controlled-proof-execution-start-authorization-nonce-one",
    ...overrides,
  };
}

test("política autoriza somente o registro do início e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledProofExecutionStartAuthorizationPolicy(
      subject.controlledProofExecutionStartAuthorizationPolicy,
      startPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.deepEqual(
      subject.controlledProofExecutionStartAuthorizationPolicy.trustedStartAuthorizers,
      [subject.executor.descriptor],
    );
    assert.equal(
      subject.controlledProofExecutionStartAuthorizationPolicy.controlledProofExecutionStartAuthorizationAllowed,
      true,
    );
    assert.equal(subject.controlledProofExecutionStartAuthorizationPolicy.maximumStarts, 1);
    for (const key of [
      "controlledProofExecutionStartAllowed",
      "publicationExecutionAllowed",
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPublicationExecution",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledProofExecutionStartAuthorizationPolicy[key], false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("executor aceito autoriza uma partida única sem iniciar a prova", async () => {
  const subject = await fixture();
  try {
    const result = authorizeControlledProofExecutionStart(authorizationArguments(subject));
    const inspection = inspectControlledProofExecutionStartAuthorization(result.startAuthorization, {
      ...authorizationArguments(subject),
      controlledProofExecutionStartAuthorizationMemory:
        result.controlledProofExecutionStartAuthorizationMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.controlledProofExecutionStartAuthorized, true);
    assert.equal(inspection.remainingStarts, 1);
    assert.equal(inspection.controlledProofExecutionStarted, false);
    assert.equal(result.startAuthorization.publicationExecuted, false);
    assert.equal(result.startAuthorization.externalPublicationExecuted, false);
    assert.equal(result.startAuthorization.buildExecuted, false);
    assert.equal(result.startAuthorization.deployExecuted, false);
    assert.equal(
      result.controlledProofExecutionStartAuthorizationMemory.summary.recordedStartAuthorizations,
      1,
    );
    assert.equal(
      result.controlledProofExecutionStartAuthorizationMemory.summary.authorizedConsumptions,
      1,
    );
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("consumo não registrado, janela inválida e executor incorreto são rejeitados", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => authorizeControlledProofExecutionStart(authorizationArguments(subject, {
      controlledExternalPublicationExecutionPermitConsumptionMemory:
        createControlledExternalPublicationExecutionPermitConsumptionMemory({
          policy: subject.controlledExternalPublicationExecutionPermitConsumptionPolicy,
        }),
    })), /consumption_not_recorded|consumption_receipt_invalid/);
    assert.throws(() => authorizeControlledProofExecutionStart(authorizationArguments(subject, {
      expiresAt: "2026-08-09T10:30:56.000Z",
    })), /authorization_window_invalid/);
    assert.throws(() => authorizeControlledProofExecutionStart(authorizationArguments(subject, {
      startAuthorizerKeyId: "external-publication-executor-wrong-key",
    })), /wrong_target_executor/);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("autorização duplicada e chave privada divergente são rejeitadas", async () => {
  const subject = await fixture();
  try {
    const first = authorizeControlledProofExecutionStart(authorizationArguments(subject));
    assert.throws(() => authorizeControlledProofExecutionStart(authorizationArguments(subject, {
      controlledProofExecutionStartAuthorizationMemory:
        first.controlledProofExecutionStartAuthorizationMemory,
      startAuthorizationId: "controlled-proof-execution-start-authorization-two",
      nonce: "controlled-proof-execution-start-authorization-nonce-two",
    })), /consumption_already_authorized/);
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(() => authorizeControlledProofExecutionStart(authorizationArguments(subject, {
      startAuthorizerPrivateKey: unrelated.privateKey,
    })), /private_key_does_not_match_controlled_proof_execution_start_authorizer/);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

test("autorização adulterada e memória divergente são detectadas", async () => {
  const subject = await fixture();
  try {
    const result = authorizeControlledProofExecutionStart(authorizationArguments(subject));
    const inspectionContext = {
      ...authorizationArguments(subject),
      controlledProofExecutionStartAuthorizationMemory:
        result.controlledProofExecutionStartAuthorizationMemory,
    };
    assert.equal(inspectControlledProofExecutionStartAuthorization({
      ...result.startAuthorization,
      controlledProofExecutionStarted: true,
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledProofExecutionStartAuthorization(result.startAuthorization, {
      ...inspectionContext,
      controlledProofExecutionStartAuthorizationMemory:
        subject.controlledProofExecutionStartAuthorizationMemory,
    }).ok, false);
    assert.equal(inspectControlledProofExecutionStartAuthorizationMemory({
      ...result.controlledProofExecutionStartAuthorizationMemory,
      summary: {
        ...result.controlledProofExecutionStartAuthorizationMemory.summary,
        controlledProofExecutionStarted: true,
      },
    }, { policy: subject.controlledProofExecutionStartAuthorizationPolicy }).ok, false);
  } finally {
    rmSync(subject.artifact.directory, { recursive: true, force: true });
  }
});

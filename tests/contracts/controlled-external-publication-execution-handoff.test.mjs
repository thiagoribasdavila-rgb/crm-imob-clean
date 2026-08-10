import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  createControlledExternalPublicationExecutionHandoff,
  createControlledExternalPublicationExecutionHandoffMemory,
  createControlledExternalPublicationExecutionHandoffPolicy,
  inspectControlledExternalPublicationExecutionHandoffMemory,
  inspectControlledExternalPublicationExecutionHandoffPolicy,
  inspectControlledExternalPublicationExecutionHandoffReceipt,
} from "../../lib/release/controlled-external-publication-execution-handoff.mjs";
import {
  consumeControlledExternalPublicationAuthorization,
} from "../../lib/release/controlled-external-publication-authorization-consumption.mjs";
import {
  consumptionArguments,
  fixture as consumptionFixture,
} from "./controlled-external-publication-authorization-consumption.test.mjs";
import { policyContext } from "./controlled-external-publication-authorization-review.test.mjs";

function actor({ kind, role, overrides = {} }) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: `external-publication-${kind}-key`,
      actorId: `external-publication-${kind}`,
      role,
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

export function handoffIssuer(overrides = {}) {
  return actor({
    kind: "execution-handoff-issuer",
    role: "release-external-publication-execution-handoff-issuer",
    overrides,
  });
}

export function externalExecutor(overrides = {}) {
  return actor({
    kind: "executor",
    role: "release-external-publication-executor",
    overrides,
  });
}

function handoffPolicyContext(subject) {
  return {
    controlledExternalPublicationAuthorizationConsumptionPolicy: subject.controlledExternalPublicationAuthorizationConsumptionPolicy,
    controlledExternalPublicationAuthorizationGrantPolicy: subject.controlledExternalPublicationAuthorizationGrantPolicy,
    controlledExternalPublicationReviewPolicy: subject.controlledExternalPublicationReviewPolicy,
    ...policyContext(subject),
  };
}

export async function fixture() {
  const subject = await consumptionFixture();
  const consumption = consumeControlledExternalPublicationAuthorization(consumptionArguments(subject));
  const issuer = handoffIssuer();
  const executor = externalExecutor();
  const controlledExternalPublicationExecutionHandoffPolicy = createControlledExternalPublicationExecutionHandoffPolicy({
    ...handoffPolicyContext(subject),
    trustedHandoffIssuers: [issuer.descriptor],
    trustedExternalExecutors: [executor.descriptor],
  });
  const controlledExternalPublicationExecutionHandoffMemory = createControlledExternalPublicationExecutionHandoffMemory({
    policy: controlledExternalPublicationExecutionHandoffPolicy,
  });
  return {
    ...subject,
    consumptionReceipt: consumption.consumptionReceipt,
    controlledExternalPublicationAuthorizationConsumptionMemory: consumption.controlledExternalPublicationAuthorizationConsumptionMemory,
    issuer,
    executor,
    controlledExternalPublicationExecutionHandoffPolicy,
    controlledExternalPublicationExecutionHandoffMemory,
  };
}

export function handoffArguments(subject, overrides = {}) {
  return {
    ...consumptionArguments(subject),
    controlledExternalPublicationAuthorizationConsumptionReceipt: subject.consumptionReceipt,
    controlledExternalPublicationAuthorizationConsumptionMemory: subject.controlledExternalPublicationAuthorizationConsumptionMemory,
    controlledExternalPublicationExecutionHandoffPolicy: subject.controlledExternalPublicationExecutionHandoffPolicy,
    controlledExternalPublicationExecutionHandoffMemory: subject.controlledExternalPublicationExecutionHandoffMemory,
    handoffId: "external-publication-execution-handoff-one",
    handoffIssuerKeyId: subject.issuer.descriptor.keyId,
    handoffIssuerPrivateKey: subject.issuer.privateKey,
    externalExecutorKeyId: subject.executor.descriptor.keyId,
    issuedAt: "2026-08-09T10:30:00.000Z",
    expiresAt: "2026-08-09T10:31:30.000Z",
    nonce: "external-publication-execution-handoff-nonce-one",
    ...overrides,
  };
}

test("política exige emissor e executor independentes e mantém efeitos externos bloqueados", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectControlledExternalPublicationExecutionHandoffPolicy(
      subject.controlledExternalPublicationExecutionHandoffPolicy,
      handoffPolicyContext(subject),
    ).ok, true);
    assert.equal(inspectControlledExternalPublicationExecutionHandoffMemory(
      subject.controlledExternalPublicationExecutionHandoffMemory,
      { policy: subject.controlledExternalPublicationExecutionHandoffPolicy },
    ).ok, true);
    assert.equal(subject.controlledExternalPublicationExecutionHandoffPolicy.executionHandoffPreparationAllowed, true);
    assert.equal(subject.controlledExternalPublicationExecutionHandoffPolicy.executionAcceptanceAllowed, false);
    for (const key of [
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPublicationExecution",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledExternalPublicationExecutionHandoffPolicy[key], false);

    assert.throws(() => createControlledExternalPublicationExecutionHandoffPolicy({
      ...handoffPolicyContext(subject),
      trustedHandoffIssuers: [{ ...subject.issuer.descriptor, actorId: subject.consumer.descriptor.actorId }],
      trustedExternalExecutors: [subject.executor.descriptor],
    }), /external_publication_execution_handoff_actors_must_be_independent/);
    assert.throws(() => createControlledExternalPublicationExecutionHandoffPolicy({
      ...handoffPolicyContext(subject),
      trustedHandoffIssuers: [subject.issuer.descriptor],
      trustedExternalExecutors: [{ ...subject.executor.descriptor, actorId: subject.issuer.descriptor.actorId }],
    }), /handoff_issuer_and_external_executor_must_be_independent/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("consumo registrado gera handoff assinado e direcionado sem executar publicação", async () => {
  const subject = await fixture();
  try {
    const result = createControlledExternalPublicationExecutionHandoff(handoffArguments(subject));
    const inspection = inspectControlledExternalPublicationExecutionHandoffReceipt(result.handoffReceipt, {
      ...handoffArguments(subject),
      controlledExternalPublicationExecutionHandoffMemory: result.controlledExternalPublicationExecutionHandoffMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.handoffReceipt.authorizationConsumed, true);
    assert.equal(result.handoffReceipt.handoffPrepared, true);
    assert.equal(result.handoffReceipt.handoffRecorded, true);
    assert.equal(result.handoffReceipt.executionAccepted, false);
    assert.equal(result.handoffReceipt.externalExecutorActorId, subject.executor.descriptor.actorId);
    assert.equal(result.handoffReceipt.externalPublicationExecuted, false);
    assert.equal(result.handoffReceipt.buildExecuted, false);
    assert.equal(result.handoffReceipt.deployExecuted, false);
    assert.equal(result.controlledExternalPublicationExecutionHandoffMemory.summary.recordedHandoffs, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("consumo não registrado ou adulterado não pode originar handoff", async () => {
  const subject = await fixture();
  try {
    const emptyMemory = createControlledExternalPublicationExecutionHandoffMemory({ policy: subject.controlledExternalPublicationExecutionHandoffPolicy });
    assert.throws(() => createControlledExternalPublicationExecutionHandoff(handoffArguments(subject, {
      controlledExternalPublicationAuthorizationConsumptionMemory: subject.controlledExternalPublicationAuthorizationConsumptionMemory.entries.length === 0
        ? subject.controlledExternalPublicationAuthorizationConsumptionMemory
        : { ...subject.controlledExternalPublicationAuthorizationConsumptionMemory, entries: [] },
    })), /consumption_memory_invalid|consumption_not_recorded|receipt_invalid/);
    assert.throws(() => createControlledExternalPublicationExecutionHandoff(handoffArguments(subject, {
      controlledExternalPublicationAuthorizationConsumptionReceipt: {
        ...subject.consumptionReceipt,
        externalPublicationExecuted: true,
      },
      controlledExternalPublicationExecutionHandoffMemory: emptyMemory,
    })), /consumption_receipt_invalid/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("emissor ou executor não confiável, inativo, vencido ou colidido é rejeitado", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => createControlledExternalPublicationExecutionHandoff(handoffArguments(subject, {
      handoffIssuerKeyId: "untrusted-external-publication-execution-handoff-issuer",
    })), /external_publication_execution_handoff_issuer_untrusted/);
    assert.throws(() => createControlledExternalPublicationExecutionHandoff(handoffArguments(subject, {
      externalExecutorKeyId: "untrusted-external-publication-executor",
    })), /external_publication_execution_executor_untrusted/);

    for (const [trustedHandoffIssuers, trustedExternalExecutors, pattern] of [
      [[{ ...subject.issuer.descriptor, status: "inactive" }], [subject.executor.descriptor], /handoff_issuer_inactive/],
      [[subject.issuer.descriptor], [{ ...subject.executor.descriptor, validUntil: "2026-08-09T10:30:30.000Z" }], /executor_key_outside_validity/],
    ]) {
      const policy = createControlledExternalPublicationExecutionHandoffPolicy({
        ...handoffPolicyContext(subject), trustedHandoffIssuers, trustedExternalExecutors,
      });
      const memory = createControlledExternalPublicationExecutionHandoffMemory({ policy });
      assert.throws(() => createControlledExternalPublicationExecutionHandoff(handoffArguments(subject, {
        controlledExternalPublicationExecutionHandoffPolicy: policy,
        controlledExternalPublicationExecutionHandoffMemory: memory,
      })), pattern);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("duplicidade, recibo adulterado e memória divergente são detectados", async () => {
  const subject = await fixture();
  try {
    const first = createControlledExternalPublicationExecutionHandoff(handoffArguments(subject));
    assert.throws(() => createControlledExternalPublicationExecutionHandoff(handoffArguments(subject, {
      controlledExternalPublicationExecutionHandoffMemory: first.controlledExternalPublicationExecutionHandoffMemory,
      handoffId: "external-publication-execution-handoff-two",
      nonce: "external-publication-execution-handoff-nonce-two",
    })), /external_publication_execution_consumption_handoff_already_recorded/);
    const inspectionContext = {
      ...handoffArguments(subject),
      controlledExternalPublicationExecutionHandoffMemory: first.controlledExternalPublicationExecutionHandoffMemory,
    };
    assert.equal(inspectControlledExternalPublicationExecutionHandoffReceipt({
      ...first.handoffReceipt,
      executionAccepted: true,
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledExternalPublicationExecutionHandoffMemory({
      ...first.controlledExternalPublicationExecutionHandoffMemory,
      summary: { ...first.controlledExternalPublicationExecutionHandoffMemory.summary, buildExecuted: true },
    }, { policy: subject.controlledExternalPublicationExecutionHandoffPolicy }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

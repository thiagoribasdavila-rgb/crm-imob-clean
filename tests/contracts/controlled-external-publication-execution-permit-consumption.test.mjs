import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  consumeControlledExternalPublicationExecutionPermit,
  createControlledExternalPublicationExecutionPermitConsumptionMemory,
  createControlledExternalPublicationExecutionPermitConsumptionPolicy,
  inspectControlledExternalPublicationExecutionPermitConsumptionMemory,
  inspectControlledExternalPublicationExecutionPermitConsumptionPolicy,
  inspectControlledExternalPublicationExecutionPermitConsumptionReceipt,
} from "../../lib/release/controlled-external-publication-execution-permit-consumption.mjs";
import {
  grantControlledExternalPublicationExecutionPermit,
} from "../../lib/release/controlled-external-publication-execution-permit-grant.mjs";
import {
  fixture as permitFixture,
  permitArguments,
} from "./controlled-external-publication-execution-permit-grant.test.mjs";

function consumptionPolicyContext(subject) {
  return {
    ...permitArguments(subject),
    controlledExternalPublicationExecutionPermitGrantPolicy: subject.controlledExternalPublicationExecutionPermitGrantPolicy,
    controlledExternalPublicationExecutionAcceptancePolicy: subject.controlledExternalPublicationExecutionAcceptancePolicy,
  };
}

export async function fixture() {
  const subject = await permitFixture();
  const granted = grantControlledExternalPublicationExecutionPermit(permitArguments(subject));
  const controlledExternalPublicationExecutionPermitConsumptionPolicy = createControlledExternalPublicationExecutionPermitConsumptionPolicy(
    consumptionPolicyContext(subject),
  );
  const controlledExternalPublicationExecutionPermitConsumptionMemory = createControlledExternalPublicationExecutionPermitConsumptionMemory({
    policy: controlledExternalPublicationExecutionPermitConsumptionPolicy,
  });
  return {
    ...subject,
    permit: granted.permit,
    controlledExternalPublicationExecutionPermitMemory: granted.controlledExternalPublicationExecutionPermitMemory,
    controlledExternalPublicationExecutionPermitConsumptionPolicy,
    controlledExternalPublicationExecutionPermitConsumptionMemory,
  };
}

export function consumptionArguments(subject, overrides = {}) {
  return {
    ...permitArguments(subject),
    controlledExternalPublicationExecutionPermit: subject.permit,
    controlledExternalPublicationExecutionPermitGrantPolicy: subject.controlledExternalPublicationExecutionPermitGrantPolicy,
    controlledExternalPublicationExecutionPermitMemory: subject.controlledExternalPublicationExecutionPermitMemory,
    controlledExternalPublicationExecutionAcceptanceReceipt: subject.acceptanceReceipt,
    controlledExternalPublicationExecutionAcceptanceMemory: subject.controlledExternalPublicationExecutionAcceptanceMemory,
    controlledExternalPublicationExecutionHandoffReceipt: subject.handoffReceipt,
    controlledExternalPublicationExecutionPermitConsumptionPolicy: subject.controlledExternalPublicationExecutionPermitConsumptionPolicy,
    controlledExternalPublicationExecutionPermitConsumptionMemory: subject.controlledExternalPublicationExecutionPermitConsumptionMemory,
    consumptionId: "external-publication-execution-permit-consumption-one",
    externalExecutorKeyId: subject.executor.descriptor.keyId,
    externalExecutorPrivateKey: subject.executor.privateKey,
    consumedAt: "2026-08-09T10:30:50.000Z",
    nonce: "external-publication-execution-permit-consumption-nonce-one",
    ...overrides,
  };
}

test("política restringe o consumo ao executor já aceito e mantém toda execução bloqueada", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledExternalPublicationExecutionPermitConsumptionPolicy(
      subject.controlledExternalPublicationExecutionPermitConsumptionPolicy,
      consumptionPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.deepEqual(
      subject.controlledExternalPublicationExecutionPermitConsumptionPolicy.trustedPermitConsumers,
      [subject.executor.descriptor],
    );
    assert.equal(subject.controlledExternalPublicationExecutionPermitConsumptionPolicy.permitConsumptionAllowed, true);
    assert.equal(subject.controlledExternalPublicationExecutionPermitConsumptionPolicy.maximumUses, 1);
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
    ]) assert.equal(subject.controlledExternalPublicationExecutionPermitConsumptionPolicy[key], false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("executor alvo consome uma permissão uma única vez e gera recibo assinado sem iniciar execução", async () => {
  const subject = await fixture();
  try {
    const result = consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject));
    const inspection = inspectControlledExternalPublicationExecutionPermitConsumptionReceipt(result.consumptionReceipt, {
      ...consumptionArguments(subject),
      controlledExternalPublicationExecutionPermitConsumptionMemory: result.controlledExternalPublicationExecutionPermitConsumptionMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.permitConsumed, true);
    assert.equal(inspection.remainingUses, 0);
    assert.equal(inspection.controlledProofExecutionStarted, false);
    assert.equal(result.consumptionReceipt.publicationExecutionPermitted, false);
    assert.equal(result.consumptionReceipt.externalPublicationExecuted, false);
    assert.equal(result.consumptionReceipt.buildExecuted, false);
    assert.equal(result.consumptionReceipt.deployExecuted, false);
    assert.equal(result.controlledExternalPublicationExecutionPermitConsumptionMemory.summary.recordedConsumptions, 1);
    assert.equal(result.controlledExternalPublicationExecutionPermitConsumptionMemory.summary.consumedSingleUsePermits, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("permissão expirada, não registrada e executor incorreto são rejeitados", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject, {
      consumedAt: "2026-08-09T10:30:55.000Z",
    })), /consumption_after_expiration/);
    assert.throws(() => consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject, {
      controlledExternalPublicationExecutionPermitMemory: {
        ...subject.controlledExternalPublicationExecutionPermitMemory,
        entries: [],
      },
    })), /permit_memory_invalid|not_recorded/);
    assert.throws(() => consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject, {
      externalExecutorKeyId: "external-publication-executor-wrong-key",
    })), /wrong_target_executor/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("consumo duplicado e chave privada divergente são rejeitados", async () => {
  const subject = await fixture();
  try {
    const first = consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject));
    assert.throws(() => consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject, {
      controlledExternalPublicationExecutionPermitConsumptionMemory: first.controlledExternalPublicationExecutionPermitConsumptionMemory,
      consumptionId: "external-publication-execution-permit-consumption-two",
      nonce: "external-publication-execution-permit-consumption-nonce-two",
    })), /permit_already_consumed/);
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(() => consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject, {
      externalExecutorPrivateKey: unrelated.privateKey,
    })), /private_key_does_not_match_external_publication_execution_permit_consumer/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("recibo adulterado e memória divergente são detectados", async () => {
  const subject = await fixture();
  try {
    const result = consumeControlledExternalPublicationExecutionPermit(consumptionArguments(subject));
    const inspectionContext = {
      ...consumptionArguments(subject),
      controlledExternalPublicationExecutionPermitConsumptionMemory: result.controlledExternalPublicationExecutionPermitConsumptionMemory,
    };
    assert.equal(inspectControlledExternalPublicationExecutionPermitConsumptionReceipt({
      ...result.consumptionReceipt,
      permitConsumed: false,
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledExternalPublicationExecutionPermitConsumptionReceipt(result.consumptionReceipt, {
      ...inspectionContext,
      controlledExternalPublicationExecutionPermitConsumptionMemory: subject.controlledExternalPublicationExecutionPermitConsumptionMemory,
    }).ok, false);
    assert.equal(inspectControlledExternalPublicationExecutionPermitConsumptionMemory({
      ...result.controlledExternalPublicationExecutionPermitConsumptionMemory,
      summary: {
        ...result.controlledExternalPublicationExecutionPermitConsumptionMemory.summary,
        controlledProofExecutionStarted: true,
      },
    }, { policy: subject.controlledExternalPublicationExecutionPermitConsumptionPolicy }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

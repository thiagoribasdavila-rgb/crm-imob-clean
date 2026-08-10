import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  consumeControlledExternalPublicationAuthorization,
  createControlledExternalPublicationAuthorizationConsumptionMemory,
  createControlledExternalPublicationAuthorizationConsumptionPolicy,
  inspectControlledExternalPublicationAuthorizationConsumptionMemory,
  inspectControlledExternalPublicationAuthorizationConsumptionPolicy,
  inspectControlledExternalPublicationAuthorizationConsumptionReceipt,
} from "../../lib/release/controlled-external-publication-authorization-consumption.mjs";
import {
  createControlledExternalPublicationAuthorizationGrantMemory,
  grantControlledExternalPublicationAuthorization,
} from "../../lib/release/controlled-external-publication-authorization-grant.mjs";
import {
  fixture as grantFixture,
  grantArguments,
} from "./controlled-external-publication-authorization-grant.test.mjs";
import { policyContext } from "./controlled-external-publication-authorization-review.test.mjs";

export function authorizationConsumer(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "external-publication-authorization-consumer-key",
      actorId: "external-publication-authorization-consumer",
      role: "release-external-publication-authorization-consumer",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

function consumptionPolicyContext(subject) {
  return {
    controlledExternalPublicationAuthorizationGrantPolicy: subject.controlledExternalPublicationAuthorizationGrantPolicy,
    controlledExternalPublicationReviewPolicy: subject.controlledExternalPublicationReviewPolicy,
    ...policyContext(subject),
  };
}

export async function fixture({ failed = false } = {}) {
  const subject = await grantFixture({ failed });
  const grantResult = grantControlledExternalPublicationAuthorization(grantArguments(subject));
  const consumer = authorizationConsumer();
  const controlledExternalPublicationAuthorizationConsumptionPolicy = createControlledExternalPublicationAuthorizationConsumptionPolicy({
    ...consumptionPolicyContext(subject),
    trustedConsumers: [consumer.descriptor],
  });
  const controlledExternalPublicationAuthorizationConsumptionMemory = createControlledExternalPublicationAuthorizationConsumptionMemory({
    policy: controlledExternalPublicationAuthorizationConsumptionPolicy,
  });
  return {
    ...subject,
    grant: grantResult.grant,
    controlledExternalPublicationAuthorizationGrantMemory: grantResult.controlledExternalPublicationAuthorizationGrantMemory,
    consumer,
    controlledExternalPublicationAuthorizationConsumptionPolicy,
    controlledExternalPublicationAuthorizationConsumptionMemory,
  };
}

export function consumptionArguments(subject, overrides = {}) {
  return {
    ...grantArguments(subject),
    controlledExternalPublicationAuthorizationGrant: subject.grant,
    controlledExternalPublicationAuthorizationGrantMemory: subject.controlledExternalPublicationAuthorizationGrantMemory,
    controlledExternalPublicationAuthorizationConsumptionPolicy: subject.controlledExternalPublicationAuthorizationConsumptionPolicy,
    controlledExternalPublicationAuthorizationConsumptionMemory: subject.controlledExternalPublicationAuthorizationConsumptionMemory,
    consumptionId: "external-publication-authorization-consumption-one",
    consumerKeyId: subject.consumer.descriptor.keyId,
    consumerPrivateKey: subject.consumer.privateKey,
    consumedAt: "2026-08-09T10:29:00.000Z",
    nonce: "external-publication-authorization-consumption-nonce-one",
    ...overrides,
  };
}

test("política exige consumidor independente e mantém toda execução externa bloqueada", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectControlledExternalPublicationAuthorizationConsumptionPolicy(
      subject.controlledExternalPublicationAuthorizationConsumptionPolicy,
      consumptionPolicyContext(subject),
    ).ok, true);
    assert.equal(inspectControlledExternalPublicationAuthorizationConsumptionMemory(
      subject.controlledExternalPublicationAuthorizationConsumptionMemory,
      { policy: subject.controlledExternalPublicationAuthorizationConsumptionPolicy },
    ).ok, true);
    assert.equal(subject.controlledExternalPublicationAuthorizationConsumptionPolicy.singleUseConsumptionRequired, true);
    assert.equal(subject.controlledExternalPublicationAuthorizationConsumptionPolicy.maximumUses, 1);
    for (const key of [
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPublicationExecution",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledExternalPublicationAuthorizationConsumptionPolicy[key], false);

    assert.throws(() => createControlledExternalPublicationAuthorizationConsumptionPolicy({
      ...consumptionPolicyContext(subject),
      trustedConsumers: [{ ...subject.consumer.descriptor, actorId: subject.grantor.descriptor.actorId }],
    }), /external_publication_authorization_consumer_must_be_independent/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("concessão válida é consumida atomicamente uma única vez sem executar publicação", async () => {
  const subject = await fixture();
  try {
    const result = consumeControlledExternalPublicationAuthorization(consumptionArguments(subject));
    const inspection = inspectControlledExternalPublicationAuthorizationConsumptionReceipt(result.consumptionReceipt, {
      ...consumptionArguments(subject),
      controlledExternalPublicationAuthorizationConsumptionMemory: result.controlledExternalPublicationAuthorizationConsumptionMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.consumptionReceipt.authorizationConsumed, true);
    assert.equal(result.consumptionReceipt.remainingUses, 0);
    assert.equal(result.consumptionReceipt.consumptionRecorded, true);
    assert.equal(result.consumptionReceipt.externalPublicationExecuted, false);
    assert.equal(result.consumptionReceipt.buildExecuted, false);
    assert.equal(result.consumptionReceipt.deployExecuted, false);
    assert.equal(result.controlledExternalPublicationAuthorizationConsumptionMemory.summary.recordedConsumptions, 1);
    assert.equal(result.controlledExternalPublicationAuthorizationConsumptionMemory.summary.consumedSingleUseGrants, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("concessão negada, expirada ou não registrada nunca pode ser consumida", async () => {
  const denied = await fixture({ failed: true });
  const valid = await fixture();
  try {
    assert.throws(() => consumeControlledExternalPublicationAuthorization(consumptionArguments(denied)), /authorized_recorded_unexpired_grant_required_for_consumption/);
    assert.throws(() => consumeControlledExternalPublicationAuthorization(consumptionArguments(valid, {
      consumedAt: valid.grant.expiresAt,
    })), /external_publication_authorization_consumption_after_expiration/);
    assert.throws(() => consumeControlledExternalPublicationAuthorization(consumptionArguments(valid, {
      controlledExternalPublicationAuthorizationGrantMemory: createEmptyGrantMemory(valid),
    })), /external_publication_authorization_grant_invalid|external_publication_authorization_grant_not_recorded/);
  } finally {
    rmSync(denied.artifact.directory, { recursive: true, force: true });
    rmSync(valid.artifact.directory, { recursive: true, force: true });
  }
});

test("reutilização e consumidor não confiável são rejeitados", async () => {
  const subject = await fixture();
  try {
    const first = consumeControlledExternalPublicationAuthorization(consumptionArguments(subject));
    assert.throws(() => consumeControlledExternalPublicationAuthorization(consumptionArguments(subject, {
      controlledExternalPublicationAuthorizationConsumptionMemory: first.controlledExternalPublicationAuthorizationConsumptionMemory,
      consumptionId: "external-publication-authorization-consumption-two",
      nonce: "external-publication-authorization-consumption-nonce-two",
    })), /external_publication_authorization_grant_already_consumed/);
    assert.throws(() => consumeControlledExternalPublicationAuthorization(consumptionArguments(subject, {
      consumerKeyId: "untrusted-external-publication-authorization-consumer",
    })), /external_publication_authorization_consumer_untrusted/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("inspeção detecta recibo adulterado, memória divergente e consumo não registrado", async () => {
  const subject = await fixture();
  try {
    const result = consumeControlledExternalPublicationAuthorization(consumptionArguments(subject));
    const context = {
      ...consumptionArguments(subject),
      controlledExternalPublicationAuthorizationConsumptionMemory: result.controlledExternalPublicationAuthorizationConsumptionMemory,
    };
    assert.equal(inspectControlledExternalPublicationAuthorizationConsumptionReceipt({
      ...result.consumptionReceipt,
      externalPublicationExecuted: true,
    }, context).ok, false);
    assert.equal(inspectControlledExternalPublicationAuthorizationConsumptionReceipt(result.consumptionReceipt, {
      ...context,
      controlledExternalPublicationAuthorizationConsumptionMemory: subject.controlledExternalPublicationAuthorizationConsumptionMemory,
    }).ok, false);
    assert.equal(inspectControlledExternalPublicationAuthorizationConsumptionMemory({
      ...result.controlledExternalPublicationAuthorizationConsumptionMemory,
      summary: { ...result.controlledExternalPublicationAuthorizationConsumptionMemory.summary, buildExecuted: true },
    }, { policy: subject.controlledExternalPublicationAuthorizationConsumptionPolicy }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

function createEmptyGrantMemory(subject) {
  return createControlledExternalPublicationAuthorizationGrantMemory({
    policy: subject.controlledExternalPublicationAuthorizationGrantPolicy,
  });
}

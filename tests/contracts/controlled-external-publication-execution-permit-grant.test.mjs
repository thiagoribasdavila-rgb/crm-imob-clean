import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANTOR_ROLE,
  createControlledExternalPublicationExecutionPermitGrantPolicy,
  createControlledExternalPublicationExecutionPermitMemory,
  grantControlledExternalPublicationExecutionPermit,
  inspectControlledExternalPublicationExecutionPermit,
  inspectControlledExternalPublicationExecutionPermitGrantPolicy,
  inspectControlledExternalPublicationExecutionPermitMemory,
} from "../../lib/release/controlled-external-publication-execution-permit-grant.mjs";
import {
  recordControlledExternalPublicationExecutionAcceptance,
} from "../../lib/release/controlled-external-publication-execution-acceptance.mjs";
import {
  acceptanceArguments,
  fixture as acceptanceFixture,
} from "./controlled-external-publication-execution-acceptance.test.mjs";

export function permitGrantor(overrides = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "external-publication-execution-permit-grantor-key",
      actorId: "external-publication-execution-permit-grantor",
      role: CONTROLLED_EXTERNAL_PUBLICATION_EXECUTION_PERMIT_GRANTOR_ROLE,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

function permitPolicyContext(subject) {
  return {
    ...acceptanceArguments(subject),
    controlledExternalPublicationExecutionAcceptancePolicy: subject.controlledExternalPublicationExecutionAcceptancePolicy,
    trustedPermitGrantors: [subject.permitGrantor.descriptor],
  };
}

export async function fixture() {
  const subject = await acceptanceFixture();
  const acceptance = recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject));
  const permitGrantorValue = permitGrantor();
  const controlledExternalPublicationExecutionPermitGrantPolicy = createControlledExternalPublicationExecutionPermitGrantPolicy({
    ...acceptanceArguments(subject),
    controlledExternalPublicationExecutionAcceptancePolicy: subject.controlledExternalPublicationExecutionAcceptancePolicy,
    trustedPermitGrantors: [permitGrantorValue.descriptor],
  });
  const controlledExternalPublicationExecutionPermitMemory = createControlledExternalPublicationExecutionPermitMemory({
    policy: controlledExternalPublicationExecutionPermitGrantPolicy,
  });
  return {
    ...subject,
    acceptanceReceipt: acceptance.acceptanceReceipt,
    controlledExternalPublicationExecutionAcceptanceMemory: acceptance.controlledExternalPublicationExecutionAcceptanceMemory,
    permitGrantor: permitGrantorValue,
    controlledExternalPublicationExecutionPermitGrantPolicy,
    controlledExternalPublicationExecutionPermitMemory,
  };
}

export function permitArguments(subject, overrides = {}) {
  return {
    ...acceptanceArguments(subject),
    controlledExternalPublicationExecutionAcceptanceReceipt: subject.acceptanceReceipt,
    controlledExternalPublicationExecutionAcceptanceMemory: subject.controlledExternalPublicationExecutionAcceptanceMemory,
    controlledExternalPublicationExecutionHandoffReceipt: subject.handoffReceipt,
    controlledExternalPublicationExecutionPermitGrantPolicy: subject.controlledExternalPublicationExecutionPermitGrantPolicy,
    controlledExternalPublicationExecutionPermitMemory: subject.controlledExternalPublicationExecutionPermitMemory,
    permitId: "external-publication-execution-permit-one",
    permitGrantorKeyId: subject.permitGrantor.descriptor.keyId,
    permitGrantorPrivateKey: subject.permitGrantor.privateKey,
    reasonCode: "accepted-execution-permit-granted",
    grantedAt: "2026-08-09T10:30:40.000Z",
    expiresAt: "2026-08-09T10:30:55.000Z",
    nonce: "external-publication-execution-permit-nonce-one",
    ...overrides,
  };
}

test("política exige concessor independente e bloqueia toda execução externa", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectControlledExternalPublicationExecutionPermitGrantPolicy(
      subject.controlledExternalPublicationExecutionPermitGrantPolicy,
      permitPolicyContext(subject),
    ).ok, true);
    assert.equal(inspectControlledExternalPublicationExecutionPermitMemory(
      subject.controlledExternalPublicationExecutionPermitMemory,
      { policy: subject.controlledExternalPublicationExecutionPermitGrantPolicy },
    ).ok, true);
    assert.equal(subject.controlledExternalPublicationExecutionPermitGrantPolicy.permitGrantAllowed, true);
    assert.equal(subject.controlledExternalPublicationExecutionPermitGrantPolicy.permitConsumptionAllowed, false);
    for (const key of [
      "publicationExecutionAllowed",
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPublicationExecution",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledExternalPublicationExecutionPermitGrantPolicy[key], false);

    assert.throws(() => createControlledExternalPublicationExecutionPermitGrantPolicy({
      ...acceptanceArguments(subject),
      controlledExternalPublicationExecutionAcceptancePolicy: subject.controlledExternalPublicationExecutionAcceptancePolicy,
      trustedPermitGrantors: [{
        ...subject.permitGrantor.descriptor,
        keyId: subject.executor.descriptor.keyId,
        actorId: subject.executor.descriptor.actorId,
      }],
    }), /grantor_must_be_independent/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("aceite registrado gera permissão curta, assinada e de uso único sem executar publicação", async () => {
  const subject = await fixture();
  try {
    const result = grantControlledExternalPublicationExecutionPermit(permitArguments(subject));
    const inspection = inspectControlledExternalPublicationExecutionPermit(result.permit, {
      ...permitArguments(subject),
      controlledExternalPublicationExecutionPermitMemory: result.controlledExternalPublicationExecutionPermitMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(inspection.publicationExecutionPermitted, true);
    assert.equal(inspection.permitConsumed, false);
    assert.equal(inspection.remainingUses, 1);
    assert.equal(result.permit.singleUse, true);
    assert.equal(result.permit.maximumUses, 1);
    assert.equal(result.permit.externalPublicationExecuted, false);
    assert.equal(result.permit.buildExecuted, false);
    assert.equal(result.permit.deployExecuted, false);
    assert.equal(result.controlledExternalPublicationExecutionPermitMemory.summary.activeUnconsumedPermits, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("aceite rejeitado não pode receber permissão", async () => {
  const subject = await acceptanceFixture();
  try {
    const rejected = recordControlledExternalPublicationExecutionAcceptance(acceptanceArguments(subject, {
      decision: "rejected",
      reasonCode: "execution-handoff-rejected",
    }));
    const permitGrantorValue = permitGrantor();
    const policy = createControlledExternalPublicationExecutionPermitGrantPolicy({
      ...acceptanceArguments(subject),
      controlledExternalPublicationExecutionAcceptancePolicy: subject.controlledExternalPublicationExecutionAcceptancePolicy,
      trustedPermitGrantors: [permitGrantorValue.descriptor],
    });
    const memory = createControlledExternalPublicationExecutionPermitMemory({ policy });
    assert.throws(() => grantControlledExternalPublicationExecutionPermit({
      ...acceptanceArguments(subject),
      controlledExternalPublicationExecutionAcceptanceReceipt: rejected.acceptanceReceipt,
      controlledExternalPublicationExecutionAcceptanceMemory: rejected.controlledExternalPublicationExecutionAcceptanceMemory,
      controlledExternalPublicationExecutionHandoffReceipt: subject.handoffReceipt,
      controlledExternalPublicationExecutionPermitGrantPolicy: policy,
      controlledExternalPublicationExecutionPermitMemory: memory,
      permitId: "external-publication-execution-permit-rejected",
      permitGrantorKeyId: permitGrantorValue.descriptor.keyId,
      permitGrantorPrivateKey: permitGrantorValue.privateKey,
      reasonCode: "rejected-execution-permit-denied",
      grantedAt: "2026-08-09T10:30:40.000Z",
      expiresAt: "2026-08-09T10:30:55.000Z",
      nonce: "external-publication-execution-permit-rejected-nonce",
    }), /eligible_recorded_execution_acceptance_required_for_permit/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("duplicidade, concessor não confiável, chave errada e janelas inválidas são rejeitados", async () => {
  const subject = await fixture();
  try {
    const first = grantControlledExternalPublicationExecutionPermit(permitArguments(subject));
    assert.throws(() => grantControlledExternalPublicationExecutionPermit(permitArguments(subject, {
      controlledExternalPublicationExecutionPermitMemory: first.controlledExternalPublicationExecutionPermitMemory,
      permitId: "external-publication-execution-permit-two",
      nonce: "external-publication-execution-permit-nonce-two",
    })), /acceptance_already_permitted/);
    assert.throws(() => grantControlledExternalPublicationExecutionPermit(permitArguments(subject, {
      permitGrantorKeyId: "untrusted-external-publication-permit-grantor",
    })), /grantor_untrusted/);
    const unrelated = generateKeyPairSync("ed25519");
    assert.throws(() => grantControlledExternalPublicationExecutionPermit(permitArguments(subject, {
      permitGrantorPrivateKey: unrelated.privateKey,
    })), /private_key_does_not_match_external_publication_execution_permit_grantor/);
    assert.throws(() => grantControlledExternalPublicationExecutionPermit(permitArguments(subject, {
      expiresAt: "2026-08-09T10:31:31.000Z",
    })), /expiration_exceeds_handoff/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("permissão adulterada, não registrada e memória divergente são detectadas", async () => {
  const subject = await fixture();
  try {
    const result = grantControlledExternalPublicationExecutionPermit(permitArguments(subject));
    const inspectionContext = {
      ...permitArguments(subject),
      controlledExternalPublicationExecutionPermitMemory: result.controlledExternalPublicationExecutionPermitMemory,
    };
    assert.equal(inspectControlledExternalPublicationExecutionPermit({
      ...result.permit,
      remainingUses: 0,
    }, inspectionContext).ok, false);
    assert.equal(inspectControlledExternalPublicationExecutionPermit(result.permit, {
      ...inspectionContext,
      controlledExternalPublicationExecutionPermitMemory: subject.controlledExternalPublicationExecutionPermitMemory,
    }).ok, false);
    assert.equal(inspectControlledExternalPublicationExecutionPermitMemory({
      ...result.controlledExternalPublicationExecutionPermitMemory,
      summary: { ...result.controlledExternalPublicationExecutionPermitMemory.summary, buildExecuted: true },
    }, { policy: subject.controlledExternalPublicationExecutionPermitGrantPolicy }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

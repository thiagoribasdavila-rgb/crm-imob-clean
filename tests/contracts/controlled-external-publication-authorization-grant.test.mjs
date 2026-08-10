import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  createControlledExternalPublicationAuthorizationGrantMemory,
  createControlledExternalPublicationAuthorizationGrantPolicy,
  grantControlledExternalPublicationAuthorization,
  inspectControlledExternalPublicationAuthorizationGrant,
  inspectControlledExternalPublicationAuthorizationGrantMemory,
  inspectControlledExternalPublicationAuthorizationGrantPolicy,
} from "../../lib/release/controlled-external-publication-authorization-grant.mjs";
import {
  reviewControlledExternalPublicationAuthorization,
} from "../../lib/release/controlled-external-publication-authorization-review.mjs";
import {
  fixture as reviewFixture,
  policyContext,
  reviewArguments,
} from "./controlled-external-publication-authorization-review.test.mjs";

export function authorizationGrantor(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "external-publication-authorization-grantor-key",
      actorId: "external-publication-authorization-grantor",
      role: "release-external-publication-authorization-grantor",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

function grantPolicyContext(subject) {
  return {
    controlledExternalPublicationReviewPolicy: subject.controlledExternalPublicationReviewPolicy,
    ...policyContext(subject),
  };
}

export async function fixture({ failed = false } = {}) {
  const subject = await reviewFixture({ failed });
  const reviewResult = reviewControlledExternalPublicationAuthorization(reviewArguments(subject));
  subject.controlledExternalPublicationReviewMemory = reviewResult.controlledExternalPublicationReviewMemory;
  const grantor = authorizationGrantor();
  const controlledExternalPublicationAuthorizationGrantPolicy = createControlledExternalPublicationAuthorizationGrantPolicy({
    ...grantPolicyContext(subject),
    trustedGrantors: [grantor.descriptor],
  });
  const controlledExternalPublicationAuthorizationGrantMemory = createControlledExternalPublicationAuthorizationGrantMemory({
    policy: controlledExternalPublicationAuthorizationGrantPolicy,
  });
  return {
    ...subject,
    review: reviewResult.review,
    grantor,
    controlledExternalPublicationAuthorizationGrantPolicy,
    controlledExternalPublicationAuthorizationGrantMemory,
  };
}

export function grantArguments(subject, overrides = {}) {
  const eligible = subject.review.eligibleForAuthorizationGrant === true;
  return {
    ...reviewArguments(subject),
    controlledExternalPublicationAuthorizationReview: subject.review,
    controlledExternalPublicationReviewMemory: subject.controlledExternalPublicationReviewMemory,
    controlledExternalPublicationAuthorizationGrantPolicy: subject.controlledExternalPublicationAuthorizationGrantPolicy,
    controlledExternalPublicationAuthorizationGrantMemory: subject.controlledExternalPublicationAuthorizationGrantMemory,
    grantId: "external-publication-authorization-grant-one",
    grantorKeyId: subject.grantor.descriptor.keyId,
    grantorPrivateKey: subject.grantor.privateKey,
    outcome: eligible ? "granted" : "denied",
    reasonCode: eligible ? "eligible-review-authorized-once" : "ineligible-review-denied",
    reason: eligible
      ? "A revisão elegível recebe autorização externa curta e de uso único, sem execução automática."
      : "A revisão inelegível permanece sem autorização externa e sem qualquer efeito de publicação.",
    grantedAt: "2026-08-09T10:27:00.000Z",
    expiresAt: "2026-08-09T10:32:00.000Z",
    nonce: "external-publication-authorization-grant-nonce-one",
    ...overrides,
  };
}

test("política exige concedente independente e mantém execução externa bloqueada", async () => {
  const subject = await fixture();
  try {
    const inspection = inspectControlledExternalPublicationAuthorizationGrantPolicy(
      subject.controlledExternalPublicationAuthorizationGrantPolicy,
      grantPolicyContext(subject),
    );
    assert.equal(inspection.ok, true);
    assert.equal(inspectControlledExternalPublicationAuthorizationGrantMemory(
      subject.controlledExternalPublicationAuthorizationGrantMemory,
      { policy: subject.controlledExternalPublicationAuthorizationGrantPolicy },
    ).ok, true);
    assert.equal(subject.controlledExternalPublicationAuthorizationGrantPolicy.externalPublicationAuthorizationGrantAllowed, true);
    assert.equal(subject.controlledExternalPublicationAuthorizationGrantPolicy.singleUseGrantRequired, true);
    for (const key of [
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticAuthorizationConsumption",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledExternalPublicationAuthorizationGrantPolicy[key], false);

    assert.throws(() => createControlledExternalPublicationAuthorizationGrantPolicy({
      ...grantPolicyContext(subject),
      trustedGrantors: [{ ...subject.grantor.descriptor, actorId: subject.reviewer.descriptor.actorId }],
    }), /external_publication_authorization_grantor_must_be_independent/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("revisão elegível recebe concessão assinada, curta, única e ainda não consumida", async () => {
  const subject = await fixture();
  try {
    const result = grantControlledExternalPublicationAuthorization(grantArguments(subject));
    const inspection = inspectControlledExternalPublicationAuthorizationGrant(result.grant, {
      ...grantArguments(subject),
      controlledExternalPublicationAuthorizationGrantMemory: result.controlledExternalPublicationAuthorizationGrantMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.grant.outcome, "granted");
    assert.equal(result.grant.eligibleReviewVerified, true);
    assert.equal(result.grant.externalPublicationAuthorized, true);
    assert.equal(result.grant.singleUse, true);
    assert.equal(result.grant.maximumUses, 1);
    assert.equal(result.grant.remainingUses, 1);
    assert.equal(result.grant.authorizationConsumed, false);
    assert.equal(result.grant.externalPublicationExecuted, false);
    assert.equal(result.grant.buildExecuted, false);
    assert.equal(result.grant.deployExecuted, false);
    assert.equal(result.controlledExternalPublicationAuthorizationGrantMemory.summary.authorizedGrants, 1);
    assert.equal(result.controlledExternalPublicationAuthorizationGrantMemory.summary.unconsumedSingleUseGrants, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("revisão inelegível não pode receber concessão e admite somente negação registrada", async () => {
  const subject = await fixture({ failed: true });
  try {
    assert.throws(() => grantControlledExternalPublicationAuthorization(grantArguments(subject, {
      outcome: "granted",
      reasonCode: "eligible-review-authorized-once",
    })), /eligible_recorded_review_required_for_external_publication_authorization_grant/);

    const result = grantControlledExternalPublicationAuthorization(grantArguments(subject));
    assert.equal(result.grant.outcome, "denied");
    assert.equal(result.grant.eligibleReviewVerified, false);
    assert.equal(result.grant.externalPublicationAuthorized, false);
    assert.equal(result.grant.remainingUses, 0);
    assert.equal(result.controlledExternalPublicationAuthorizationGrantMemory.summary.deniedGrants, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("concessão rejeita repetição, concedente não confiável e janela inválida", async () => {
  const subject = await fixture();
  try {
    const first = grantControlledExternalPublicationAuthorization(grantArguments(subject));
    assert.throws(() => grantControlledExternalPublicationAuthorization(grantArguments(subject, {
      controlledExternalPublicationAuthorizationGrantMemory: first.controlledExternalPublicationAuthorizationGrantMemory,
      grantId: "external-publication-authorization-grant-two",
      nonce: "external-publication-authorization-grant-nonce-two",
    })), /external_publication_authorization_review_already_granted/);
    assert.throws(() => grantControlledExternalPublicationAuthorization(grantArguments(subject, {
      grantorKeyId: "untrusted-external-publication-authorization-grantor",
    })), /external_publication_authorization_grantor_untrusted/);
    assert.throws(() => grantControlledExternalPublicationAuthorization(grantArguments(subject, {
      grantedAt: "2026-08-09T10:40:01.000Z",
      expiresAt: "2026-08-09T10:45:01.000Z",
    })), /external_publication_authorization_grant_delay_exceeded/);
    assert.throws(() => grantControlledExternalPublicationAuthorization(grantArguments(subject, {
      expiresAt: "2026-08-09T10:32:01.000Z",
    })), /external_publication_authorization_grant_validity_exceeded/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("inspeção detecta adulteração, memória divergente e concessão não registrada", async () => {
  const subject = await fixture();
  try {
    const result = grantControlledExternalPublicationAuthorization(grantArguments(subject));
    const context = {
      ...grantArguments(subject),
      controlledExternalPublicationAuthorizationGrantMemory: result.controlledExternalPublicationAuthorizationGrantMemory,
    };
    assert.equal(inspectControlledExternalPublicationAuthorizationGrant({
      ...result.grant,
      externalPublicationExecuted: true,
    }, context).ok, false);
    assert.equal(inspectControlledExternalPublicationAuthorizationGrant(result.grant, {
      ...context,
      controlledExternalPublicationAuthorizationGrantMemory: subject.controlledExternalPublicationAuthorizationGrantMemory,
    }).ok, false);
    assert.equal(inspectControlledExternalPublicationAuthorizationGrantMemory({
      ...result.controlledExternalPublicationAuthorizationGrantMemory,
      summary: { ...result.controlledExternalPublicationAuthorizationGrantMemory.summary, buildExecuted: true },
    }, { policy: subject.controlledExternalPublicationAuthorizationGrantPolicy }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

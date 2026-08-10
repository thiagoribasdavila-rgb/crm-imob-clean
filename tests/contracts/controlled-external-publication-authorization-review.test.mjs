import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  createControlledExternalPublicationAuthorizationReviewMemory,
  createControlledExternalPublicationAuthorizationReviewPolicy,
  inspectControlledExternalPublicationAuthorizationReview,
  inspectControlledExternalPublicationAuthorizationReviewMemory,
  inspectControlledExternalPublicationAuthorizationReviewPolicy,
  reviewControlledExternalPublicationAuthorization,
} from "../../lib/release/controlled-external-publication-authorization-review.mjs";
import {
  adjudicatePublicationExecutionEvidence,
} from "../../lib/release/publication-execution-evidence-adjudication.mjs";
import {
  adjudicationArguments,
  fixture as evidenceFixture,
} from "./publication-execution-evidence-adjudication.test.mjs";

export function authorizationReviewer(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "external-publication-authorization-reviewer-key",
      actorId: "external-publication-authorization-reviewer",
      role: "release-external-publication-authorization-reviewer",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

export function policyContext(subject) {
  return {
    publicationEvidenceAdjudicationPolicy: subject.publicationEvidenceAdjudicationPolicy,
    executionPolicy: subject.authorizedPublicationExecutionPolicy,
    executionAuthorizationPolicy: subject.executionAuthorizationPolicy,
    publicationPolicy: subject.publicationPolicy,
    evidencePolicy: subject.evidencePolicy,
    assemblyPolicy: subject.assemblyPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
  };
}

export async function fixture({ failed = false } = {}) {
  const subject = await evidenceFixture({ failed });
  const adjudication = adjudicatePublicationExecutionEvidence(adjudicationArguments(subject));
  const reviewer = authorizationReviewer();
  const controlledExternalPublicationReviewPolicy = createControlledExternalPublicationAuthorizationReviewPolicy({
    ...policyContext(subject),
    trustedReviewers: [reviewer.descriptor],
  });
  const controlledExternalPublicationReviewMemory = createControlledExternalPublicationAuthorizationReviewMemory({
    policy: controlledExternalPublicationReviewPolicy,
  });
  return {
    ...subject,
    publicationEvidenceAdjudicationDecision: adjudication.decision,
    publicationEvidenceAdjudicationMemory: adjudication.publicationEvidenceAdjudicationMemory,
    reviewer,
    controlledExternalPublicationReviewPolicy,
    controlledExternalPublicationReviewMemory,
  };
}

export function reviewArguments(subject, overrides = {}) {
  const accepted = subject.publicationEvidenceAdjudicationDecision.outcome === "accepted";
  return {
    ...adjudicationArguments(subject),
    publicationEvidenceAdjudicationDecision: subject.publicationEvidenceAdjudicationDecision,
    publicationEvidenceAdjudicationMemory: subject.publicationEvidenceAdjudicationMemory,
    controlledExternalPublicationReviewPolicy: subject.controlledExternalPublicationReviewPolicy,
    controlledExternalPublicationReviewMemory: subject.controlledExternalPublicationReviewMemory,
    reviewId: "external-publication-authorization-review-one",
    reviewerKeyId: subject.reviewer.descriptor.keyId,
    reviewerPrivateKey: subject.reviewer.privateKey,
    outcome: accepted ? "eligible" : "ineligible",
    reasonCode: accepted ? "accepted-proof-eligible" : "rejected-proof-not-eligible",
    reason: accepted
      ? "A prova aceita e registrada qualifica apenas para uma futura autorização externa separada."
      : "A prova rejeitada não qualifica para uma futura autorização externa separada.",
    reviewedAt: "2026-08-09T10:26:00.000Z",
    nonce: "external-publication-authorization-review-nonce-one",
    ...overrides,
  };
}

test("política exige revisor independente e mantém todos os efeitos externos bloqueados", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectControlledExternalPublicationAuthorizationReviewPolicy(subject.controlledExternalPublicationReviewPolicy, policyContext(subject)).ok, true);
    assert.equal(inspectControlledExternalPublicationAuthorizationReviewMemory(subject.controlledExternalPublicationReviewMemory, { policy: subject.controlledExternalPublicationReviewPolicy }).ok, true);
    for (const key of [
      "externalPublicationAuthorizationAllowed",
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.controlledExternalPublicationReviewPolicy[key], false);

    assert.throws(() => createControlledExternalPublicationAuthorizationReviewPolicy({
      ...policyContext(subject),
      trustedReviewers: [{ ...subject.reviewer.descriptor, actorId: subject.adjudicator.descriptor.actorId }],
    }), /external_publication_authorization_reviewer_must_be_independent/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("prova aceita gera revisão elegível assinada sem conceder autorização externa", async () => {
  const subject = await fixture();
  try {
    const result = reviewControlledExternalPublicationAuthorization(reviewArguments(subject));
    const inspection = inspectControlledExternalPublicationAuthorizationReview(result.review, {
      ...reviewArguments(subject),
      controlledExternalPublicationReviewMemory: result.controlledExternalPublicationReviewMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.review.outcome, "eligible");
    assert.equal(result.review.eligibleForAuthorizationGrant, true);
    assert.equal(result.review.externalPublicationAuthorized, false);
    assert.equal(result.controlledExternalPublicationReviewMemory.summary.recordedReviews, 1);
    assert.equal(result.controlledExternalPublicationReviewMemory.summary.eligibleProofs, 1);
    for (const key of ["externalPublicationAuthorized", "publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      assert.equal(result.controlledExternalPublicationReviewMemory.summary[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("prova rejeitada nunca pode ser declarada elegível", async () => {
  const subject = await fixture({ failed: true });
  try {
    assert.throws(() => reviewControlledExternalPublicationAuthorization(reviewArguments(subject, {
      outcome: "eligible",
      reasonCode: "accepted-proof-eligible",
    })), /accepted_recorded_evidence_required_for_authorization_eligibility/);
    const result = reviewControlledExternalPublicationAuthorization(reviewArguments(subject));
    assert.equal(result.review.outcome, "ineligible");
    assert.equal(result.review.eligibleForAuthorizationGrant, false);
    assert.equal(result.controlledExternalPublicationReviewMemory.summary.ineligibleProofs, 1);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("duplicidade, revisor não confiável e revisão tardia são rejeitados", async () => {
  const subject = await fixture();
  try {
    const first = reviewControlledExternalPublicationAuthorization(reviewArguments(subject));
    assert.throws(() => reviewControlledExternalPublicationAuthorization(reviewArguments(subject, {
      controlledExternalPublicationReviewMemory: first.controlledExternalPublicationReviewMemory,
      reviewId: "external-publication-authorization-review-two",
      nonce: "external-publication-authorization-review-nonce-two",
    })), /publication_evidence_decision_already_reviewed/);
    assert.throws(() => reviewControlledExternalPublicationAuthorization(reviewArguments(subject, {
      reviewerKeyId: "untrusted-external-publication-authorization-reviewer",
    })), /external_publication_authorization_reviewer_untrusted/);
    assert.throws(() => reviewControlledExternalPublicationAuthorization(reviewArguments(subject, {
      reviewedAt: "2026-08-09T10:50:04.000Z",
    })), /external_publication_authorization_review_delay_exceeded/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("revisão, memória adulterada e decisão não registrada são detectadas", async () => {
  const subject = await fixture();
  try {
    const result = reviewControlledExternalPublicationAuthorization(reviewArguments(subject));
    const inspectionContext = {
      ...reviewArguments(subject),
      controlledExternalPublicationReviewMemory: result.controlledExternalPublicationReviewMemory,
    };
    assert.equal(inspectControlledExternalPublicationAuthorizationReview({ ...result.review, reason: "Motivo adulterado deliberadamente." }, inspectionContext).ok, false);
    const tamperedMemory = structuredClone(result.controlledExternalPublicationReviewMemory);
    tamperedMemory.entries[0].outcome = "ineligible";
    assert.equal(inspectControlledExternalPublicationAuthorizationReviewMemory(tamperedMemory, { policy: subject.controlledExternalPublicationReviewPolicy }).ok, false);
    assert.equal(inspectControlledExternalPublicationAuthorizationReview(result.review, {
      ...inspectionContext,
      controlledExternalPublicationReviewMemory: createControlledExternalPublicationAuthorizationReviewMemory({ policy: subject.controlledExternalPublicationReviewPolicy }),
    }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

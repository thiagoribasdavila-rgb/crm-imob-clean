import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  adjudicatePublicationExecutionEvidence,
  createPublicationExecutionEvidenceAdjudicationMemory,
  createPublicationExecutionEvidenceAdjudicationPolicy,
  inspectPublicationExecutionEvidenceAdjudicationDecision,
  inspectPublicationExecutionEvidenceAdjudicationMemory,
  inspectPublicationExecutionEvidenceAdjudicationPolicy,
} from "../../lib/release/publication-execution-evidence-adjudication.mjs";
import { executeAuthorizedPublication } from "../../lib/release/authorized-publication-execution.mjs";
import { authorizationArguments } from "./authorized-publication-execution-authorization.test.mjs";
import {
  executionArguments,
  fixture as executionFixture,
  publicationHandler,
} from "./authorized-publication-execution.test.mjs";

export function evidenceAdjudicator(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "publication-evidence-adjudicator-key",
      actorId: "publication-evidence-adjudicator",
      role: "release-publication-evidence-adjudicator",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

function policyContext(subject) {
  return {
    executionPolicy: subject.authorizedPublicationExecutionPolicy,
    executionAuthorizationPolicy: subject.executionAuthorizationPolicy,
    publicationPolicy: subject.publicationPolicy,
    evidencePolicy: subject.evidencePolicy,
    assemblyPolicy: subject.assemblyPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
  };
}

export async function fixture({ failed = false } = {}) {
  const subject = await executionFixture();
  const handler = failed
    ? publicationHandler({ async execute() { throw new Error("falha-local-para-adjudicacao"); } })
    : subject.handler;
  const executionResult = await executeAuthorizedPublication(executionArguments(subject, { publicationHandler: handler }));
  const adjudicator = evidenceAdjudicator();
  const publicationEvidenceAdjudicationPolicy = createPublicationExecutionEvidenceAdjudicationPolicy({
    ...policyContext(subject),
    trustedAdjudicators: [adjudicator.descriptor],
  });
  const publicationEvidenceAdjudicationMemory = createPublicationExecutionEvidenceAdjudicationMemory({ policy: publicationEvidenceAdjudicationPolicy });
  return {
    ...subject,
    executionResult,
    publicationExecutionReceipt: executionResult.receipt,
    executionMemory: executionResult.executionMemory,
    adjudicator,
    publicationEvidenceAdjudicationPolicy,
    publicationEvidenceAdjudicationMemory,
  };
}

export function adjudicationArguments(subject, overrides = {}) {
  const accepted = subject.publicationExecutionReceipt.status === "passed";
  return {
    ...authorizationArguments(subject),
    publicationExecutionAuthorization: subject.executionAuthorization,
    executionAuthorizationMemory: subject.executionAuthorizationMemory,
    authorizedPublicationExecutionPolicy: subject.authorizedPublicationExecutionPolicy,
    publicationExecutionReceipt: subject.publicationExecutionReceipt,
    executionMemory: subject.executionMemory,
    publicationEvidenceAdjudicationPolicy: subject.publicationEvidenceAdjudicationPolicy,
    publicationEvidenceAdjudicationMemory: subject.publicationEvidenceAdjudicationMemory,
    decisionId: "publication-evidence-decision-one",
    adjudicatorKeyId: subject.adjudicator.descriptor.keyId,
    adjudicatorPrivateKey: subject.adjudicator.privateKey,
    outcome: accepted ? "accepted" : "rejected",
    reasonCode: accepted ? "local-proof-accepted" : "execution-failed",
    reason: accepted
      ? "A prova local assinada, íntegra e registrada satisfaz o contrato de evidências."
      : "A execução local falhou e sua evidência foi rejeitada sem autorizar efeito externo.",
    decidedAt: "2026-08-09T10:25:03.000Z",
    nonce: "publication-evidence-nonce-one",
    ...overrides,
  };
}

test("política exige adjudicador independente e proíbe qualquer efeito externo", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectPublicationExecutionEvidenceAdjudicationPolicy(subject.publicationEvidenceAdjudicationPolicy, policyContext(subject)).ok, true);
    assert.equal(inspectPublicationExecutionEvidenceAdjudicationMemory(subject.publicationEvidenceAdjudicationMemory, { policy: subject.publicationEvidenceAdjudicationPolicy }).ok, true);
    for (const key of [
      "externalPublicationAuthorizationAllowed",
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "externalPublicationAllowed",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.publicationEvidenceAdjudicationPolicy[key], false);

    assert.throws(() => createPublicationExecutionEvidenceAdjudicationPolicy({
      ...policyContext(subject),
      trustedAdjudicators: [{ ...subject.adjudicator.descriptor, actorId: subject.executor.descriptor.actorId }],
    }), /publication_evidence_adjudicator_must_be_independent/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("prova local válida gera decisão aceita assinada e memória append-only", async () => {
  const subject = await fixture();
  try {
    const result = adjudicatePublicationExecutionEvidence(adjudicationArguments(subject));
    const inspection = inspectPublicationExecutionEvidenceAdjudicationDecision(result.decision, {
      ...adjudicationArguments(subject),
      publicationEvidenceAdjudicationMemory: result.publicationEvidenceAdjudicationMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.decision.outcome, "accepted");
    assert.equal(result.decision.evidenceAccepted, true);
    assert.equal(result.decision.externalPublicationAuthorized, false);
    assert.equal(result.publicationEvidenceAdjudicationMemory.summary.recordedDecisions, 1);
    assert.equal(result.publicationEvidenceAdjudicationMemory.summary.acceptedEvidence, 1);
    for (const key of ["externalPublicationAuthorized", "publicationExecuted", "externalPublicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      assert.equal(result.publicationEvidenceAdjudicationMemory.summary[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("execução falha só pode ser adjudicada como rejeitada", async () => {
  const subject = await fixture({ failed: true });
  try {
    assert.throws(() => adjudicatePublicationExecutionEvidence(adjudicationArguments(subject, {
      outcome: "accepted",
      reasonCode: "local-proof-accepted",
    })), /failed_publication_execution_evidence_cannot_be_accepted/);
    const result = adjudicatePublicationExecutionEvidence(adjudicationArguments(subject));
    assert.equal(result.decision.outcome, "rejected");
    assert.equal(result.decision.evidenceAccepted, false);
    assert.equal(result.publicationEvidenceAdjudicationMemory.summary.rejectedEvidence, 1);
    assert.equal(result.decision.externalPublicationAuthorized, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("duplicidade, adjudicador não confiável e decisão tardia são rejeitados", async () => {
  const subject = await fixture();
  try {
    const first = adjudicatePublicationExecutionEvidence(adjudicationArguments(subject));
    assert.throws(() => adjudicatePublicationExecutionEvidence(adjudicationArguments(subject, {
      publicationEvidenceAdjudicationMemory: first.publicationEvidenceAdjudicationMemory,
      decisionId: "publication-evidence-decision-two",
      nonce: "publication-evidence-nonce-two",
    })), /publication_execution_evidence_already_adjudicated/);
    assert.throws(() => adjudicatePublicationExecutionEvidence(adjudicationArguments(subject, {
      adjudicatorKeyId: "untrusted-publication-evidence-adjudicator",
    })), /publication_evidence_adjudicator_untrusted/);
    assert.throws(() => adjudicatePublicationExecutionEvidence(adjudicationArguments(subject, {
      decidedAt: "2026-08-09T10:50:00.000Z",
    })), /publication_evidence_adjudication_delay_exceeded/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("recibo, decisão ou memória adulterados e decisão não registrada são detectados", async () => {
  const subject = await fixture();
  try {
    const result = adjudicatePublicationExecutionEvidence(adjudicationArguments(subject));
    const inspectionContext = {
      ...adjudicationArguments(subject),
      publicationEvidenceAdjudicationMemory: result.publicationEvidenceAdjudicationMemory,
    };
    assert.equal(inspectPublicationExecutionEvidenceAdjudicationDecision({ ...result.decision, reason: "Motivo adulterado e inválido para a decisão." }, inspectionContext).ok, false);
    assert.equal(inspectPublicationExecutionEvidenceAdjudicationDecision(result.decision, {
      ...inspectionContext,
      publicationExecutionReceipt: { ...subject.publicationExecutionReceipt, summary: "Recibo adulterado da execução local." },
    }).ok, false);
    const tamperedMemory = structuredClone(result.publicationEvidenceAdjudicationMemory);
    tamperedMemory.entries[0].outcome = "rejected";
    assert.equal(inspectPublicationExecutionEvidenceAdjudicationMemory(tamperedMemory, { policy: subject.publicationEvidenceAdjudicationPolicy }).ok, false);
    assert.equal(inspectPublicationExecutionEvidenceAdjudicationDecision(result.decision, {
      ...inspectionContext,
      publicationEvidenceAdjudicationMemory: createPublicationExecutionEvidenceAdjudicationMemory({ policy: subject.publicationEvidenceAdjudicationPolicy }),
    }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

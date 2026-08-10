import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  createAuthorizedPackagePublicationDecisionMemory,
  createAuthorizedPackagePublicationDecisionPolicy,
  decideAuthorizedPackagePublication,
  inspectAuthorizedPackagePublicationDecision,
  inspectAuthorizedPackagePublicationDecisionMemory,
  inspectAuthorizedPackagePublicationDecisionPolicy,
} from "../../lib/release/authorized-package-publication-decision.mjs";
import {
  commitAuthorizedPackageEvidence,
} from "../../lib/release/authorized-package-evidence-commitment.mjs";
import {
  evidenceArguments,
  evidenceFixture,
} from "./authorized-package-evidence-commitment.test.mjs";

export function publicationDirector(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "package-publication-director-key",
      actorId: "package-publication-director",
      role: "release-package-publication-director",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

export async function fixture() {
  const subject = await evidenceFixture();
  const evidence = commitAuthorizedPackageEvidence(evidenceArguments(subject));
  const director = publicationDirector();
  const publicationPolicy = createAuthorizedPackagePublicationDecisionPolicy({
    evidencePolicy: subject.evidencePolicy,
    assemblyPolicy: subject.assemblyPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    trustedPublicationDirectors: [director.descriptor],
  });
  const publicationMemory = createAuthorizedPackagePublicationDecisionMemory({ policy: publicationPolicy });
  return { ...subject, evidence, director, publicationPolicy, publicationMemory };
}

export function decisionArguments(subject, overrides = {}) {
  return {
    ...evidenceArguments(subject),
    commitment: subject.evidence.commitment,
    evidenceMemory: subject.evidence.evidenceMemory,
    publicationPolicy: subject.publicationPolicy,
    publicationMemory: subject.publicationMemory,
    decisionId: "authorized-publication-decision-one",
    keyId: subject.director.descriptor.keyId,
    outcome: "approved",
    reasonCode: "approved-for-publication",
    reason: "A evidência independente autoriza a decisão de publicação deste pacote exato.",
    decidedAt: "2026-08-09T10:22:00.000Z",
    nonce: "authorized-publication-decision-nonce-one",
    privateKey: subject.director.privateKey,
    ...overrides,
  };
}

test("política exige diretor independente e mantém toda execução automática desligada", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectAuthorizedPackagePublicationDecisionPolicy(subject.publicationPolicy, {
      evidencePolicy: subject.evidencePolicy,
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
    }).ok, true);
    assert.equal(inspectAuthorizedPackagePublicationDecisionMemory(subject.publicationMemory, { policy: subject.publicationPolicy }).ok, true);
    assert.equal(subject.publicationPolicy.independentPublicationDirectorRequired, true);
    for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticPublication", "automaticDeploy", "automaticReleasePromotion"]) {
      assert.equal(subject.publicationPolicy[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("diretor independente aprova o pacote exato sem executar publicação, build ou deploy", async () => {
  const subject = await fixture();
  try {
    const result = decideAuthorizedPackagePublication(decisionArguments(subject));
    const inspection = inspectAuthorizedPackagePublicationDecision(result.decision, {
      ...decisionArguments(subject),
      publicationMemory: result.publicationMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.publicationMemory.summary.recordedDecisions, 1);
    assert.equal(result.decision.publicationAuthorized, true);
    for (const key of ["publicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      assert.equal(result.decision[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("rejeição é assinada, persistida e não autoriza publicação", async () => {
  const subject = await fixture();
  try {
    const result = decideAuthorizedPackagePublication(decisionArguments(subject, {
      outcome: "rejected",
      reasonCode: "publication-risk-not-accepted",
      reason: "O risco residual de publicação não foi aceito pelo decisor independente.",
    }));
    assert.equal(result.decision.publicationAuthorized, false);
    assert.equal(result.publicationMemory.summary.rejectedDecisions, 1);
    assert.equal(inspectAuthorizedPackagePublicationDecision(result.decision, {
      ...decisionArguments(subject, {
        outcome: "rejected",
        reasonCode: "publication-risk-not-accepted",
        reason: "O risco residual de publicação não foi aceito pelo decisor independente.",
      }),
      publicationMemory: result.publicationMemory,
    }).ok, true);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("evidência, pacote e memória adulterados invalidam a decisão", async () => {
  const subject = await fixture();
  try {
    const result = decideAuthorizedPackagePublication(decisionArguments(subject));
    const tamperedCommitment = { ...subject.evidence.commitment, packageSha256: "0".repeat(64) };
    assert.equal(inspectAuthorizedPackagePublicationDecision(result.decision, {
      ...decisionArguments(subject),
      commitment: tamperedCommitment,
      publicationMemory: result.publicationMemory,
    }).ok, false);
    const tamperedEvidenceMemory = structuredClone(subject.evidence.evidenceMemory);
    tamperedEvidenceMemory.entries[0].packageSha256 = "0".repeat(64);
    assert.equal(inspectAuthorizedPackagePublicationDecision(result.decision, {
      ...decisionArguments(subject),
      evidenceMemory: tamperedEvidenceMemory,
      publicationMemory: result.publicationMemory,
    }).ok, false);
    assert.throws(() => decideAuthorizedPackagePublication(decisionArguments(subject, {
      packageBytes: Buffer.from("not-the-authorized-package"),
    })), /package_publication_evidence_invalid/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("diretor em colisão, inativo ou fora da validade é bloqueado", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => createAuthorizedPackagePublicationDecisionPolicy({
      evidencePolicy: subject.evidencePolicy,
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
      trustedPublicationDirectors: [{ ...subject.director.descriptor, actorId: subject.signer.descriptor.actorId }],
    }), /package_publication_director_must_be_independent/);
    for (const override of [{ status: "inactive" }, { validUntil: "2026-08-09T10:21:30.000Z" }]) {
      const other = publicationDirector(override);
      const policy = createAuthorizedPackagePublicationDecisionPolicy({
        evidencePolicy: subject.evidencePolicy,
        assemblyPolicy: subject.assemblyPolicy,
        packageAuthorizationPolicy: subject.authorizationPolicy,
        trustedPublicationDirectors: [other.descriptor],
      });
      assert.throws(() => decideAuthorizedPackagePublication(decisionArguments(subject, {
        publicationPolicy: policy,
        publicationMemory: createAuthorizedPackagePublicationDecisionMemory({ policy }),
        keyId: other.descriptor.keyId,
        privateKey: other.privateKey,
      })), /package_publication_director_(inactive|key_outside_validity)/);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("memória append-only impede dupla decisão e detecta adulteração ou registro ausente", async () => {
  const subject = await fixture();
  try {
    const result = decideAuthorizedPackagePublication(decisionArguments(subject));
    assert.throws(() => decideAuthorizedPackagePublication(decisionArguments(subject, {
      publicationMemory: result.publicationMemory,
    })), /package_publication_duplicate_evidence_decision/);
    const tampered = structuredClone(result.publicationMemory);
    tampered.entries[0].outcome = "rejected";
    assert.equal(inspectAuthorizedPackagePublicationDecisionMemory(tampered, { policy: subject.publicationPolicy }).ok, false);
    const empty = createAuthorizedPackagePublicationDecisionMemory({ policy: subject.publicationPolicy });
    assert.equal(inspectAuthorizedPackagePublicationDecision(result.decision, {
      ...decisionArguments(subject),
      publicationMemory: empty,
    }).reason, "package_publication_decision_not_recorded");
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

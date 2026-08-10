import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  commitAuthorizedPackageEvidence,
  createAuthorizedPackageEvidenceCommitmentPolicy,
  createAuthorizedPackageEvidenceMemory,
  inspectAuthorizedPackageEvidenceCommitment,
  inspectAuthorizedPackageEvidenceCommitmentPolicy,
  inspectAuthorizedPackageEvidenceMemory,
} from "../../lib/release/authorized-package-evidence-commitment.mjs";
import { assembleAuthorizedReleasePackage } from "../../lib/release/authorized-release-package-assembly.mjs";
import { assemblyArguments, assemblyFixture, packageFixture } from "./authorized-release-package-assembly.test.mjs";

function custodian(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "package-evidence-custodian-key",
      actorId: "package-evidence-custodian",
      role: "release-package-evidence-custodian",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

async function fixture() {
  const subject = await assemblyFixture();
  const artifact = packageFixture();
  const assembly = assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact));
  const signer = custodian();
  const evidencePolicy = createAuthorizedPackageEvidenceCommitmentPolicy({
    assemblyPolicy: subject.assemblyPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    trustedEvidenceCustodians: [signer.descriptor],
  });
  const evidenceMemory = createAuthorizedPackageEvidenceMemory({ policy: evidencePolicy });
  return { ...subject, artifact, assembly, signer, evidencePolicy, evidenceMemory };
}

function argumentsFor(subject, overrides = {}) {
  return {
    ...subject.approvalContext,
    receipt: subject.assembly.receipt,
    authorization: subject.authorization,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    assemblyPolicy: subject.assemblyPolicy,
    assemblyMemory: subject.assembly.assemblyMemory,
    evidencePolicy: subject.evidencePolicy,
    evidenceMemory: subject.evidenceMemory,
    memory: subject.memory,
    memoryPolicy: subject.policy,
    approvalPolicy: subject.approval.approvalPolicy,
    packageBytes: subject.artifact.packageBytes,
    inventory: subject.artifact.inventory,
    evidenceId: "authorized-package-evidence-one",
    keyId: subject.signer.descriptor.keyId,
    committedAt: "2026-08-09T10:21:00.000Z",
    nonce: "authorized-package-evidence-nonce-one",
    privateKey: subject.signer.privateKey,
    ...overrides,
  };
}

export {
  argumentsFor as evidenceArguments,
  custodian as evidenceCustodian,
  fixture as evidenceFixture,
};

test("política exige custodiante independente e mantém efeitos externos desligados", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectAuthorizedPackageEvidenceCommitmentPolicy(subject.evidencePolicy, {
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
    }).ok, true);
    assert.equal(inspectAuthorizedPackageEvidenceMemory(subject.evidenceMemory, { policy: subject.evidencePolicy }).ok, true);
    assert.equal(subject.evidencePolicy.independentCustodianRequired, true);
    for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion"]) {
      assert.equal(subject.evidencePolicy[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("custodiante independente compromete evidência assinada e verificável", async () => {
  const subject = await fixture();
  try {
    const result = commitAuthorizedPackageEvidence(argumentsFor(subject));
    const inspection = inspectAuthorizedPackageEvidenceCommitment(result.commitment, {
      ...argumentsFor(subject),
      evidenceMemory: result.evidenceMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.evidenceMemory.summary.committedPackages, 1);
    assert.equal(result.commitment.independentlyVerified, true);
    for (const key of ["buildExecuted", "deployExecuted", "releasePromoted"]) assert.equal(result.commitment[key], false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("pacote, inventário e recibo adulterados são recusados", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => commitAuthorizedPackageEvidence(argumentsFor(subject, { packageBytes: Buffer.from("not-a-zip") })), /package_evidence_receipt_invalid/);
    assert.throws(() => commitAuthorizedPackageEvidence(argumentsFor(subject, { inventory: [{ ...subject.artifact.inventory[0], bytes: 1 }] })), /package_evidence_receipt_invalid/);
    assert.throws(() => commitAuthorizedPackageEvidence(argumentsFor(subject, { receipt: { ...subject.assembly.receipt, packageName: "evil.zip" } })), /package_evidence_receipt_invalid/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("custodiante não independente, inativo ou fora da validade é bloqueado", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => createAuthorizedPackageEvidenceCommitmentPolicy({
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
      trustedEvidenceCustodians: [{ ...subject.signer.descriptor, actorId: subject.authorization.authorizerActorId }],
    }), /package_assembler_and_evidence_custodian_must_be_separate/);
    for (const override of [
      { status: "inactive" },
      { validUntil: "2026-08-09T10:20:30.000Z" },
    ]) {
      const other = custodian(override);
      const policy = createAuthorizedPackageEvidenceCommitmentPolicy({
        assemblyPolicy: subject.assemblyPolicy,
        packageAuthorizationPolicy: subject.authorizationPolicy,
        trustedEvidenceCustodians: [other.descriptor],
      });
      assert.throws(() => commitAuthorizedPackageEvidence(argumentsFor(subject, {
        evidencePolicy: policy,
        evidenceMemory: createAuthorizedPackageEvidenceMemory({ policy }),
        keyId: other.descriptor.keyId,
        privateKey: other.privateKey,
      })), /package_evidence_custodian_(inactive|key_outside_validity)/);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("memória append-only bloqueia repetição e detecta adulteração", async () => {
  const subject = await fixture();
  try {
    const result = commitAuthorizedPackageEvidence(argumentsFor(subject));
    assert.throws(() => commitAuthorizedPackageEvidence(argumentsFor(subject, { evidenceMemory: result.evidenceMemory })), /package_evidence_duplicate_receipt/);
    const tampered = structuredClone(result.evidenceMemory);
    tampered.entries[0].packageSha256 = "0".repeat(64);
    assert.equal(inspectAuthorizedPackageEvidenceMemory(tampered, { policy: subject.evidencePolicy }).ok, false);
    const uncommitted = createAuthorizedPackageEvidenceMemory({ policy: subject.evidencePolicy });
    assert.equal(inspectAuthorizedPackageEvidenceCommitment(result.commitment, {
      ...argumentsFor(subject), evidenceMemory: uncommitted,
    }).reason, "package_evidence_commitment_not_committed");
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

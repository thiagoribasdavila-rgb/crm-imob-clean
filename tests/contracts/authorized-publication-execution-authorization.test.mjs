import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import {
  authorizeApprovedPackagePublicationExecution,
  createAuthorizedPublicationExecutionAuthorizationMemory,
  createAuthorizedPublicationExecutionAuthorizationPolicy,
  inspectAuthorizedPublicationExecutionAuthorization,
  inspectAuthorizedPublicationExecutionAuthorizationMemory,
  inspectAuthorizedPublicationExecutionAuthorizationPolicy,
} from "../../lib/release/authorized-publication-execution-authorization.mjs";
import {
  decideAuthorizedPackagePublication,
} from "../../lib/release/authorized-package-publication-decision.mjs";
import {
  decisionArguments,
  fixture as publicationFixture,
} from "./authorized-package-publication-decision.test.mjs";

export function executionAuthorizer(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "publication-execution-authorizer-key",
      actorId: "publication-execution-authorizer",
      role: "release-publication-execution-authorizer",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

export async function fixture() {
  const subject = await publicationFixture();
  const publication = decideAuthorizedPackagePublication(decisionArguments(subject));
  const authorizer = executionAuthorizer();
  const executionAuthorizationPolicy = createAuthorizedPublicationExecutionAuthorizationPolicy({
    publicationPolicy: subject.publicationPolicy,
    evidencePolicy: subject.evidencePolicy,
    assemblyPolicy: subject.assemblyPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    trustedExecutionAuthorizers: [authorizer.descriptor],
  });
  const executionAuthorizationMemory = createAuthorizedPublicationExecutionAuthorizationMemory({
    policy: executionAuthorizationPolicy,
  });
  return {
    ...subject,
    publication,
    authorizer,
    executionAuthorizationPolicy,
    executionAuthorizationMemory,
  };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    ...decisionArguments(subject),
    publicationDecision: subject.publication.decision,
    publicationMemory: subject.publication.publicationMemory,
    executionAuthorizationPolicy: subject.executionAuthorizationPolicy,
    executionAuthorizationMemory: subject.executionAuthorizationMemory,
    authorizationId: "approved-publication-execution-authorization-one",
    keyId: subject.authorizer.descriptor.keyId,
    reason: "A decisão aprovada pode seguir para execução manual controlada deste pacote exato.",
    authorizedAt: "2026-08-09T10:24:00.000Z",
    expiresAt: "2026-08-09T10:34:00.000Z",
    nonce: "approved-publication-execution-authorization-nonce-one",
    privateKey: subject.authorizer.privateKey,
    ...overrides,
  };
}

test("política exige autorizador independente e mantém todos os efeitos externos desligados", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectAuthorizedPublicationExecutionAuthorizationPolicy(subject.executionAuthorizationPolicy, {
      publicationPolicy: subject.publicationPolicy,
      evidencePolicy: subject.evidencePolicy,
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
    }).ok, true);
    assert.equal(inspectAuthorizedPublicationExecutionAuthorizationMemory(subject.executionAuthorizationMemory, {
      policy: subject.executionAuthorizationPolicy,
    }).ok, true);
    assert.equal(subject.executionAuthorizationPolicy.independentExecutionAuthorizerRequired, true);
    for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticPublication", "automaticDeploy", "automaticReleasePromotion"]) {
      assert.equal(subject.executionAuthorizationPolicy[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("autorizador independente autoriza a execução exata sem publicar, compilar, implantar ou promover", async () => {
  const subject = await fixture();
  try {
    const result = authorizeApprovedPackagePublicationExecution(authorizationArguments(subject));
    const inspection = inspectAuthorizedPublicationExecutionAuthorization(result.authorization, {
      ...authorizationArguments(subject),
      executionAuthorizationMemory: result.authorizationMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.authorizationMemory.summary.recordedAuthorizations, 1);
    assert.equal(result.authorization.executionAuthorized, true);
    for (const key of ["publicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      assert.equal(result.authorization[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("decisão de publicação rejeitada nunca autoriza execução", async () => {
  const subject = await publicationFixture();
  try {
    const publication = decideAuthorizedPackagePublication(decisionArguments(subject, {
      outcome: "rejected",
      reasonCode: "publication-risk-not-accepted",
      reason: "O risco residual de publicação não foi aceito pelo decisor independente.",
    }));
    const authorizer = executionAuthorizer();
    const executionAuthorizationPolicy = createAuthorizedPublicationExecutionAuthorizationPolicy({
      publicationPolicy: subject.publicationPolicy,
      evidencePolicy: subject.evidencePolicy,
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
      trustedExecutionAuthorizers: [authorizer.descriptor],
    });
    const executionAuthorizationMemory = createAuthorizedPublicationExecutionAuthorizationMemory({ policy: executionAuthorizationPolicy });
    assert.throws(() => authorizeApprovedPackagePublicationExecution({
      ...decisionArguments(subject),
      publicationDecision: publication.decision,
      publicationMemory: publication.publicationMemory,
      executionAuthorizationPolicy,
      executionAuthorizationMemory,
      authorizationId: "rejected-publication-cannot-execute",
      keyId: authorizer.descriptor.keyId,
      reason: "Uma rejeição jamais pode liberar a execução da publicação.",
      authorizedAt: "2026-08-09T10:24:00.000Z",
      expiresAt: "2026-08-09T10:34:00.000Z",
      nonce: "rejected-publication-execution-nonce",
      privateKey: authorizer.privateKey,
    }), /approved_publication_decision_required/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("autorizador em colisão, inativo ou fora da validade é bloqueado", async () => {
  const subject = await fixture();
  try {
    assert.throws(() => createAuthorizedPublicationExecutionAuthorizationPolicy({
      publicationPolicy: subject.publicationPolicy,
      evidencePolicy: subject.evidencePolicy,
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
      trustedExecutionAuthorizers: [{
        ...subject.authorizer.descriptor,
        actorId: subject.director.descriptor.actorId,
      }],
    }), /publication_execution_authorizer_must_be_independent/);

    for (const override of [{ status: "inactive" }, { validUntil: "2026-08-09T10:23:30.000Z" }]) {
      const other = executionAuthorizer(override);
      const policy = createAuthorizedPublicationExecutionAuthorizationPolicy({
        publicationPolicy: subject.publicationPolicy,
        evidencePolicy: subject.evidencePolicy,
        assemblyPolicy: subject.assemblyPolicy,
        packageAuthorizationPolicy: subject.authorizationPolicy,
        trustedExecutionAuthorizers: [other.descriptor],
      });
      assert.throws(() => authorizeApprovedPackagePublicationExecution(authorizationArguments(subject, {
        executionAuthorizationPolicy: policy,
        executionAuthorizationMemory: createAuthorizedPublicationExecutionAuthorizationMemory({ policy }),
        keyId: other.descriptor.keyId,
        privateKey: other.privateKey,
      })), /publication_execution_authorizer_(inactive|key_outside_validity)/);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("decisão, memória e assinatura adulteradas invalidam a autorização", async () => {
  const subject = await fixture();
  try {
    const result = authorizeApprovedPackagePublicationExecution(authorizationArguments(subject));
    const tamperedDecision = { ...subject.publication.decision, packageSha256: "0".repeat(64) };
    assert.equal(inspectAuthorizedPublicationExecutionAuthorization(result.authorization, {
      ...authorizationArguments(subject),
      publicationDecision: tamperedDecision,
      executionAuthorizationMemory: result.authorizationMemory,
    }).ok, false);
    const tamperedPublicationMemory = structuredClone(subject.publication.publicationMemory);
    tamperedPublicationMemory.entries[0].outcome = "rejected";
    assert.equal(inspectAuthorizedPublicationExecutionAuthorization(result.authorization, {
      ...authorizationArguments(subject),
      publicationMemory: tamperedPublicationMemory,
      executionAuthorizationMemory: result.authorizationMemory,
    }).ok, false);
    const tamperedAuthorization = { ...result.authorization, signature: "AA" };
    assert.equal(inspectAuthorizedPublicationExecutionAuthorization(tamperedAuthorization, {
      ...authorizationArguments(subject),
      executionAuthorizationMemory: result.authorizationMemory,
    }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("memória append-only impede dupla autorização e detecta adulteração ou registro ausente", async () => {
  const subject = await fixture();
  try {
    const result = authorizeApprovedPackagePublicationExecution(authorizationArguments(subject));
    assert.throws(() => authorizeApprovedPackagePublicationExecution(authorizationArguments(subject, {
      executionAuthorizationMemory: result.authorizationMemory,
    })), /publication_execution_duplicate_decision_authorization/);
    const tampered = structuredClone(result.authorizationMemory);
    tampered.entries[0].executionAuthorized = false;
    assert.equal(inspectAuthorizedPublicationExecutionAuthorizationMemory(tampered, {
      policy: subject.executionAuthorizationPolicy,
    }).ok, false);
    const empty = createAuthorizedPublicationExecutionAuthorizationMemory({ policy: subject.executionAuthorizationPolicy });
    assert.equal(inspectAuthorizedPublicationExecutionAuthorization(result.authorization, {
      ...authorizationArguments(subject),
      executionAuthorizationMemory: empty,
    }).reason, "publication_execution_authorization_not_recorded");
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

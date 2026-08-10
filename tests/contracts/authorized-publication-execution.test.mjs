import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { rmSync } from "node:fs";
import test from "node:test";
import { authorizeApprovedPackagePublicationExecution } from "../../lib/release/authorized-publication-execution-authorization.mjs";
import {
  createAuthorizedPublicationExecutionMemory,
  createAuthorizedPublicationExecutionPolicy,
  executeAuthorizedPublication,
  inspectAuthorizedPublicationExecutionMemory,
  inspectAuthorizedPublicationExecutionPolicy,
  inspectAuthorizedPublicationExecutionReceipt,
} from "../../lib/release/authorized-publication-execution.mjs";
import {
  authorizationArguments,
  fixture as authorizationFixture,
} from "./authorized-publication-execution-authorization.test.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function publicationExecutor(overrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    descriptor: {
      keyId: "publication-executor-key",
      actorId: "publication-executor",
      role: "release-publication-executor",
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
      validFrom: "2026-08-09T10:00:00.000Z",
      validUntil: "2026-08-09T11:00:00.000Z",
      status: "active",
      ...overrides,
    },
  };
}

export function publicationHandler(overrides = {}) {
  const handlerId = overrides.handlerId ?? "local-publication-proof";
  const handlerDigest = overrides.handlerDigest ?? hash("local-publication-proof-handler-v1");
  return {
    handlerId,
    handlerDigest,
    async execute(context) {
      return {
        status: "passed",
        exitCode: 0,
        summary: "Prova local isolada concluída sem publicação externa.",
        evidence: [{
          type: "local-proof",
          artifactPath: `evidence/publication/${context.executionId}/result.json`,
          artifactHash: hash(context),
        }],
      };
    },
    ...overrides,
  };
}

export function consumptionStore(initial = []) {
  const claims = new Set(initial);
  return {
    claims,
    async claim(authorizationHash) {
      if (claims.has(authorizationHash)) return false;
      claims.add(authorizationHash);
      return true;
    },
  };
}

export async function fixture() {
  const subject = await authorizationFixture();
  const authorizationResult = authorizeApprovedPackagePublicationExecution(authorizationArguments(subject));
  const authorized = {
    ...subject,
    authorizationResult,
    executionAuthorization: authorizationResult.authorization,
    executionAuthorizationMemory: authorizationResult.authorizationMemory,
  };
  const executor = publicationExecutor();
  const handler = publicationHandler();
  const authorizedPublicationExecutionPolicy = createAuthorizedPublicationExecutionPolicy({
    executionAuthorizationPolicy: authorized.executionAuthorizationPolicy,
    publicationPolicy: authorized.publicationPolicy,
    evidencePolicy: authorized.evidencePolicy,
    assemblyPolicy: authorized.assemblyPolicy,
    packageAuthorizationPolicy: authorized.authorizationPolicy,
    trustedExecutors: [executor.descriptor],
    trustedPublicationHandlers: [{ handlerId: handler.handlerId, handlerDigest: handler.handlerDigest }],
  });
  const executionMemory = createAuthorizedPublicationExecutionMemory({ policy: authorizedPublicationExecutionPolicy });
  return { ...authorized, executor, handler, authorizedPublicationExecutionPolicy, executionMemory };
}

export function executionArguments(subject, overrides = {}) {
  return {
    ...authorizationArguments(subject),
    publicationExecutionAuthorization: subject.executionAuthorization,
    executionAuthorizationMemory: subject.executionAuthorizationMemory,
    authorizedPublicationExecutionPolicy: subject.authorizedPublicationExecutionPolicy,
    executionMemory: subject.executionMemory,
    executionId: "authorized-publication-execution-one",
    executorKeyId: subject.executor.descriptor.keyId,
    executorPrivateKey: subject.executor.privateKey,
    publicationHandler: subject.handler,
    consumptionStore: consumptionStore(),
    startedAt: "2026-08-09T10:25:00.000Z",
    completedAt: "2026-08-09T10:25:02.000Z",
    ...overrides,
  };
}

test("política limita a execução a prova local isolada e exige executor independente", async () => {
  const subject = await fixture();
  try {
    assert.equal(inspectAuthorizedPublicationExecutionPolicy(subject.authorizedPublicationExecutionPolicy, {
      executionAuthorizationPolicy: subject.executionAuthorizationPolicy,
      publicationPolicy: subject.publicationPolicy,
      evidencePolicy: subject.evidencePolicy,
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
    }).ok, true);
    assert.equal(inspectAuthorizedPublicationExecutionMemory(subject.executionMemory, { policy: subject.authorizedPublicationExecutionPolicy }).ok, true);
    assert.equal(subject.authorizedPublicationExecutionPolicy.isolationMode, "isolated-local-publication-proof");
    for (const key of [
      "networkAccessAllowed",
      "databaseMutationAllowed",
      "arbitraryCommandExecutionAllowed",
      "externalPublicationAllowed",
      "automaticPackageGeneration",
      "automaticBuild",
      "automaticDeploy",
      "automaticReleasePromotion",
    ]) assert.equal(subject.authorizedPublicationExecutionPolicy[key], false);

    assert.throws(() => createAuthorizedPublicationExecutionPolicy({
      executionAuthorizationPolicy: subject.executionAuthorizationPolicy,
      publicationPolicy: subject.publicationPolicy,
      evidencePolicy: subject.evidencePolicy,
      assemblyPolicy: subject.assemblyPolicy,
      packageAuthorizationPolicy: subject.authorizationPolicy,
      trustedExecutors: [{ ...subject.executor.descriptor, actorId: subject.authorizer.descriptor.actorId }],
      trustedPublicationHandlers: [{ handlerId: subject.handler.handlerId, handlerDigest: subject.handler.handlerDigest }],
    }), /publication_executor_must_be_independent/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("execução autorizada gera recibo assinado e memória sem publicação externa", async () => {
  const subject = await fixture();
  try {
    const result = await executeAuthorizedPublication(executionArguments(subject));
    const inspection = inspectAuthorizedPublicationExecutionReceipt(result.receipt, {
      ...authorizationArguments(subject),
      publicationExecutionAuthorization: subject.executionAuthorization,
      executionAuthorizationMemory: subject.executionAuthorizationMemory,
      authorizedPublicationExecutionPolicy: subject.authorizedPublicationExecutionPolicy,
      executionMemory: result.executionMemory,
    });
    assert.equal(inspection.ok, true);
    assert.equal(result.receipt.status, "passed");
    assert.equal(result.executionMemory.summary.recordedExecutions, 1);
    assert.equal(result.executionMemory.summary.successfulLocalProofs, 1);
    assert.equal(result.receipt.authorizationConsumed, true);
    assert.equal(result.receipt.publicationProofExecuted, true);
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      assert.equal(result.receipt[key], false);
      assert.equal(result.executionMemory.summary[key], false);
    }
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("memória e reivindicação atômica impedem a reutilização da autorização", async () => {
  const subject = await fixture();
  try {
    const store = consumptionStore();
    const first = await executeAuthorizedPublication(executionArguments(subject, { consumptionStore: store }));
    await assert.rejects(() => executeAuthorizedPublication(executionArguments(subject, {
      executionMemory: first.executionMemory,
      consumptionStore: consumptionStore(),
      executionId: "authorized-publication-execution-two",
    })), /publication_execution_authorization_already_consumed/);
    await assert.rejects(() => executeAuthorizedPublication(executionArguments(subject, {
      consumptionStore: store,
      executionId: "authorized-publication-execution-three",
    })), /publication_execution_authorization_claim_failed/);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("executor, handler e janela não autorizados são rejeitados antes da prova", async () => {
  const subject = await fixture();
  try {
    const store = consumptionStore();
    await assert.rejects(() => executeAuthorizedPublication(executionArguments(subject, {
      executorKeyId: "executor-nao-confiavel",
      consumptionStore: store,
    })), /publication_executor_untrusted/);
    await assert.rejects(() => executeAuthorizedPublication(executionArguments(subject, {
      publicationHandler: publicationHandler({ handlerId: "handler-nao-confiavel" }),
      consumptionStore: store,
    })), /publication_handler_untrusted/);
    await assert.rejects(() => executeAuthorizedPublication(executionArguments(subject, {
      startedAt: "2026-08-09T10:35:00.000Z",
      completedAt: "2026-08-09T10:35:01.000Z",
      consumptionStore: store,
    })), /publication_execution_authorization_expired/);
    assert.equal(store.claims.size, 0);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("falha do handler é registrada como prova falha sem executar efeitos externos", async () => {
  const subject = await fixture();
  try {
    const result = await executeAuthorizedPublication(executionArguments(subject, {
      publicationHandler: publicationHandler({ async execute() { throw new Error("falha-local-controlada"); } }),
    }));
    assert.equal(result.receipt.status, "failed");
    assert.equal(result.receipt.exitCode, 1);
    assert.match(result.receipt.summary, /falha-local-controlada/);
    assert.equal(result.executionMemory.summary.failedLocalProofs, 1);
    assert.equal(result.receipt.externalPublicationExecuted, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

test("recibo ou memória adulterados e recibo não registrado são detectados", async () => {
  const subject = await fixture();
  try {
    const result = await executeAuthorizedPublication(executionArguments(subject));
    const context = {
      ...authorizationArguments(subject),
      publicationExecutionAuthorization: subject.executionAuthorization,
      executionAuthorizationMemory: subject.executionAuthorizationMemory,
      authorizedPublicationExecutionPolicy: subject.authorizedPublicationExecutionPolicy,
      executionMemory: result.executionMemory,
    };
    assert.equal(inspectAuthorizedPublicationExecutionReceipt({ ...result.receipt, summary: "Resumo adulterado da prova." }, context).ok, false);
    const tamperedMemory = structuredClone(result.executionMemory);
    tamperedMemory.entries[0].status = "failed";
    assert.equal(inspectAuthorizedPublicationExecutionMemory(tamperedMemory, { policy: subject.authorizedPublicationExecutionPolicy }).ok, false);
    assert.equal(inspectAuthorizedPublicationExecutionReceipt(result.receipt, {
      ...context,
      executionMemory: createAuthorizedPublicationExecutionMemory({ policy: subject.authorizedPublicationExecutionPolicy }),
    }).ok, false);
  } finally { rmSync(subject.artifact.directory, { recursive: true, force: true }); }
});

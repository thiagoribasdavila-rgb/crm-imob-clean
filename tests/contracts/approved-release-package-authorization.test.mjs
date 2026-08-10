import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { appendApprovedReleaseMemory } from "../../lib/release/approved-release-memory-commitment.mjs";
import {
  createApprovedReleasePackageAuthorization,
  createApprovedReleasePackageAuthorizationPolicy,
  inspectApprovedReleasePackageAuthorization,
  inspectApprovedReleasePackageAuthorizationPolicy,
} from "../../lib/release/approved-release-package-authorization.mjs";
import { approvedFixture, appendArguments } from "./approved-release-memory-commitment.test.mjs";

export async function authorizationFixture() {
  const subject = await approvedFixture();
  const memory = appendApprovedReleaseMemory(appendArguments(subject));
  const authorizationPolicy = createApprovedReleasePackageAuthorizationPolicy({
    approvalPolicy: subject.approval.approvalPolicy,
    memoryPolicy: subject.policy,
    ...subject.approvalContext,
  });
  return { ...subject, memory, authorizationPolicy };
}

export function authorizationArguments(subject, overrides = {}) {
  return {
    memory: subject.memory,
    memoryPolicy: subject.policy,
    approvalPolicy: subject.approval.approvalPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    approvedEntryHash: subject.memory.entries[0].entryHash,
    authorizationId: "approved-package-authorization-one",
    keyId: subject.approval.approver.keyId,
    packageName: "ATLAS_ONE_APPROVED_RELEASE.zip",
    reason: "Montagem isolada do pacote aprovado para validação local.",
    authorizedAt: "2026-08-09T10:19:00.000Z",
    expiresAt: "2026-08-09T10:24:00.000Z",
    nonce: "approved-package-authorization-once",
    privateKey: subject.approval.approverKeys.privateKey,
    ...subject.approvalContext,
    ...overrides,
  };
}

test("política deriva a autoridade final e mantém todos os efeitos automáticos desligados", async () => {
  const subject = await authorizationFixture();
  const inspection = inspectApprovedReleasePackageAuthorizationPolicy(subject.authorizationPolicy, {
    approvalPolicy: subject.approval.approvalPolicy,
    memoryPolicy: subject.policy,
    ...subject.approvalContext,
  });
  assert.equal(inspection.ok, true);
  assert.equal(subject.authorizationPolicy.trustedPackageAuthorizers.length, 1);
  assert.equal(subject.authorizationPolicy.trustedPackageAuthorizers[0].keyId, subject.approval.approver.keyId);
  for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion"]) {
    assert.equal(subject.authorizationPolicy[key], false);
  }
});

test("entrada aprovada permite autorização assinada, exata e de uso único sem gerar pacote", async () => {
  const subject = await authorizationFixture();
  const authorization = createApprovedReleasePackageAuthorization(authorizationArguments(subject));
  const inspection = inspectApprovedReleasePackageAuthorization(authorization, {
    ...subject.approvalContext,
    memory: subject.memory,
    memoryPolicy: subject.policy,
    approvalPolicy: subject.approval.approvalPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    inspectedAt: "2026-08-09T10:20:00.000Z",
  });
  assert.equal(inspection.ok, true);
  assert.equal(authorization.approvedReleaseMemoryHash, subject.memory.memoryHash);
  assert.equal(authorization.approvedReleaseMemoryEntryHash, subject.memory.entries[0].entryHash);
  assert.equal(authorization.packageAssemblyAuthorized, true);
  assert.equal(authorization.singleUseRequired, true);
  for (const key of ["packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) assert.equal(authorization[key], false);
});

test("memória vazia ou adulterada nunca autoriza montagem", async () => {
  const subject = await authorizationFixture();
  const empty = { ...subject.memory, entries: [], summary: { ...subject.memory.summary, committedApprovals: 0, latestEntryHash: null } };
  assert.throws(() => createApprovedReleasePackageAuthorization(authorizationArguments(subject, { memory: empty })), /approved_release_memory_invalid/);

  const tampered = { ...subject.memory, entries: [{ ...subject.memory.entries[0], approverActorId: "outro-ator" }] };
  assert.throws(() => createApprovedReleasePackageAuthorization(authorizationArguments(subject, { memory: tampered })), /approved_release_memory_invalid/);
});

test("nome inseguro, chave errada e janela inválida são bloqueados", async () => {
  const subject = await authorizationFixture();
  assert.throws(() => createApprovedReleasePackageAuthorization(authorizationArguments(subject, { packageName: "../release.zip" })), /package_name_invalid/);

  const wrongKeys = generateKeyPairSync("ed25519");
  assert.throws(() => createApprovedReleasePackageAuthorization(authorizationArguments(subject, { privateKey: wrongKeys.privateKey })), /private_key_does_not_match_package_authorizer/);
  assert.throws(() => createApprovedReleasePackageAuthorization(authorizationArguments(subject, { authorizedAt: "2026-08-09T10:30:00.000Z", expiresAt: "2026-08-09T10:35:00.000Z" })), /package_authorization_window_expired/);
});

test("assinatura, contrato de segurança e expiração adulterados são detectados", async () => {
  const subject = await authorizationFixture();
  const authorization = createApprovedReleasePackageAuthorization(authorizationArguments(subject));
  const inspect = (value, inspectedAt = "2026-08-09T10:20:00.000Z") => inspectApprovedReleasePackageAuthorization(value, {
    ...subject.approvalContext,
    memory: subject.memory,
    memoryPolicy: subject.policy,
    approvalPolicy: subject.approval.approvalPolicy,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    inspectedAt,
  });
  assert.match(inspect({ ...authorization, packageName: "OUTRO.zip" }).reason, /package_authorization_packageName_mismatch|package_authorization_signature_verification_failed/);
  assert.equal(inspect({ ...authorization, packageGenerated: true }).reason, "package_authorization_packageGenerated_must_be_false");
  assert.equal(inspect(authorization, "2026-08-09T10:25:00.000Z").reason, "package_authorization_expired");
});

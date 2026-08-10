import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createApprovedReleasePackageAuthorization } from "../../lib/release/approved-release-package-authorization.mjs";
import {
  assembleAuthorizedReleasePackage,
  createAuthorizedReleasePackageAssemblyMemory,
  createAuthorizedReleasePackageAssemblyPolicy,
  inspectAuthorizedReleasePackageAssemblyMemory,
  inspectAuthorizedReleasePackageAssemblyPolicy,
  inspectAuthorizedReleasePackageAssemblyReceipt,
} from "../../lib/release/authorized-release-package-assembly.mjs";
import { authorizationArguments, authorizationFixture } from "./approved-release-package-authorization.test.mjs";

export function packageFixture() {
  const directory = mkdtempSync(join(tmpdir(), "atlas-phase-214-"));
  const content = Buffer.from("Atlas One approved release fixture\n");
  writeFileSync(join(directory, "README.md"), content);
  execFileSync("zip", ["-Xq", "approved-release.zip", "README.md"], { cwd: directory });
  const packageBytes = readFileSync(join(directory, "approved-release.zip"));
  return {
    directory,
    packageBytes,
    inventory: [{ path: "README.md", bytes: content.length, sha256: createHash("sha256").update(content).digest("hex") }],
  };
}

export async function assemblyFixture() {
  const subject = await authorizationFixture();
  const authorization = createApprovedReleasePackageAuthorization(authorizationArguments(subject));
  const assemblyPolicy = createAuthorizedReleasePackageAssemblyPolicy({
    packageAuthorizationPolicy: subject.authorizationPolicy,
    approvalPolicy: subject.approval.approvalPolicy,
    memoryPolicy: subject.policy,
    ...subject.approvalContext,
  });
  const assemblyMemory = createAuthorizedReleasePackageAssemblyMemory({ policy: assemblyPolicy });
  return { ...subject, authorization, assemblyPolicy, assemblyMemory };
}

export function assemblyArguments(subject, artifact, overrides = {}) {
  return {
    ...subject.approvalContext,
    authorization: subject.authorization,
    packageAuthorizationPolicy: subject.authorizationPolicy,
    assemblyPolicy: subject.assemblyPolicy,
    assemblyMemory: subject.assemblyMemory,
    memory: subject.memory,
    memoryPolicy: subject.policy,
    approvalPolicy: subject.approval.approvalPolicy,
    packageBytes: artifact.packageBytes,
    inventory: artifact.inventory,
    assemblyId: "authorized-release-package-one",
    assemblerActorId: subject.authorization.authorizerActorId,
    assembledAt: "2026-08-09T10:20:00.000Z",
    ...overrides,
  };
}

test("política de montagem deriva a autorização e mantém build, deploy e promoção desligados", async () => {
  const subject = await assemblyFixture();
  const inspection = inspectAuthorizedReleasePackageAssemblyPolicy(subject.assemblyPolicy, {
    packageAuthorizationPolicy: subject.authorizationPolicy,
    approvalPolicy: subject.approval.approvalPolicy,
    memoryPolicy: subject.policy,
    ...subject.approvalContext,
  });
  assert.equal(inspection.ok, true);
  assert.equal(subject.assemblyPolicy.authorizationSingleUseRequired, true);
  assert.equal(subject.assemblyPolicy.sameActorAsAuthorizerRequired, true);
  for (const key of ["automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion"]) {
    assert.equal(subject.assemblyPolicy[key], false);
  }
});

test("autorização válida monta recibo rastreável e é consumida uma única vez", async () => {
  const subject = await assemblyFixture();
  const artifact = packageFixture();
  try {
    const result = assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact));
    const memoryInspection = inspectAuthorizedReleasePackageAssemblyMemory(result.assemblyMemory, { policy: subject.assemblyPolicy });
    assert.equal(memoryInspection.ok, true);
    assert.equal(result.receipt.packageGenerated, true);
    assert.equal(result.receipt.authorizationConsumed, true);
    assert.equal(result.assemblyMemory.summary.assembledPackages, 1);
    for (const key of ["buildExecuted", "deployExecuted", "releasePromoted"]) assert.equal(result.receipt[key], false);

    const receiptInspection = inspectAuthorizedReleasePackageAssemblyReceipt(result.receipt, {
      ...assemblyArguments(subject, artifact),
      assemblyMemory: result.assemblyMemory,
    });
    assert.equal(receiptInspection.ok, true);

    assert.throws(
      () => assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact, { assemblyMemory: result.assemblyMemory })),
      /package_authorization_already_consumed/,
    );
  } finally {
    rmSync(artifact.directory, { recursive: true, force: true });
  }
});

test("conteúdo ou inventário adulterado invalida o recibo", async () => {
  const subject = await assemblyFixture();
  const artifact = packageFixture();
  try {
    const result = assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact));
    const tamperedBytes = Buffer.concat([artifact.packageBytes, Buffer.from("tampered")]);
    const bytesInspection = inspectAuthorizedReleasePackageAssemblyReceipt(result.receipt, {
      ...assemblyArguments(subject, artifact, { packageBytes: tamperedBytes }),
      assemblyMemory: result.assemblyMemory,
    });
    assert.equal(bytesInspection.ok, false);
    assert.match(bytesInspection.reason, /package_assembly_receipt_contract_mismatch|package_zip_eocd_invalid/);

    const inventoryInspection = inspectAuthorizedReleasePackageAssemblyReceipt(result.receipt, {
      ...assemblyArguments(subject, artifact, { inventory: [{ ...artifact.inventory[0], bytes: artifact.inventory[0].bytes + 1 }] }),
      assemblyMemory: result.assemblyMemory,
    });
    assert.equal(inventoryInspection.ok, false);
    assert.equal(inventoryInspection.reason, "package_assembly_receipt_contract_mismatch");
  } finally {
    rmSync(artifact.directory, { recursive: true, force: true });
  }
});

test("arquivo sensível, ator divergente, ZIP inválido e autorização expirada são bloqueados", async () => {
  const subject = await assemblyFixture();
  const artifact = packageFixture();
  try {
    assert.throws(
      () => assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact, { inventory: [{ ...artifact.inventory[0], path: ".env.local" }] })),
      /package_inventory_sensitive_env/,
    );
    assert.throws(
      () => assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact, { assemblerActorId: "outro-diretor" })),
      /package_assembler_must_match_authorizer/,
    );
    assert.throws(
      () => assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact, { packageBytes: Buffer.alloc(64) })),
      /package_zip_signature_invalid/,
    );
    assert.throws(
      () => assembleAuthorizedReleasePackage(assemblyArguments(subject, artifact, { assembledAt: "2026-08-09T10:25:00.000Z" })),
      /package_authorization_expired/,
    );
  } finally {
    rmSync(artifact.directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  evaluateProductionEvidence,
  verifyCandidate,
} from "../../scripts/check-v3000-phase-11-homologation.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "atlas-v3000-phase-11-"));
  const zipPath = join(directory, "candidate.zip");
  const checksumPath = `${zipPath}.sha256`;
  const proofPath = `${zipPath}.proof.json`;
  const contents = Buffer.from("artefato-controlado");
  const sha256 = createHash("sha256").update(contents).digest("hex");
  const contract = {
    candidate: {
      artifact: "candidate.zip",
      bytes: contents.length,
      files: 12,
      sha256,
      sourceFingerprint: "sha256:snapshot-controlado",
      commitReference: "commit-controlado",
      cleanBuild: true,
      secretsPackaged: false,
      databaseMutations: 0,
      deploymentPerformed: false,
    },
    productionGate: {
      origin: "https://atlasaios.com.br",
      route: "/notifications",
      requiredStatus: "approved",
      requiredHttpStatus: 200,
      requiredConsoleErrors: 0,
      requiredBusinessDataMutations: 0,
      requiredChecks: ["authenticatedSession", "desktopApproved"],
    },
  };
  writeFileSync(zipPath, contents);
  writeFileSync(checksumPath, `${sha256}  candidate.zip\n`);
  writeFileSync(
    proofPath,
    JSON.stringify({
      phase: 10,
      ok: true,
      sha256,
      bytes: contents.length,
      files: 12,
      sourceFingerprint: contract.candidate.sourceFingerprint,
      commitReference: contract.candidate.commitReference,
      cleanBuild: true,
      secretsPackaged: false,
      databaseMutations: 0,
      deploymentPerformed: false,
      route: "/notifications",
      routeSourceIncluded: true,
    }),
  );
  return { directory, zipPath, checksumPath, proofPath, contract };
}

test("Fase 11 reconhece o candidato comprovado por três fontes", () => {
  const input = fixture();
  const result = verifyCandidate(input);
  assert.equal(result.artifactVerified, true);
  assert.equal(result.sha256, input.contract.candidate.sha256);
});

test("Fase 11 rejeita pacote alterado depois da prova", () => {
  const input = fixture();
  writeFileSync(input.zipPath, "artefato-diferente");
  assert.throws(() => verifyCandidate(input), /divergente do candidato aprovado/);
});

test("Fase 11 não promove produção sem prova autenticada completa", () => {
  const { contract } = fixture();
  const evidence = {
    phase: 11,
    status: "approved",
    candidateSha256: contract.candidate.sha256,
    sourceFingerprint: contract.candidate.sourceFingerprint,
    origin: contract.productionGate.origin,
    route: contract.productionGate.route,
    httpStatus: 200,
    consoleErrors: 0,
    businessDataMutations: 0,
    authenticatedSession: true,
    desktopApproved: false,
    desktopEvidence: "desktop.png",
    mobileEvidence: "mobile.png",
    reviewedBy: "homologador",
    reviewedAt: "2026-08-10T12:00:00-03:00"
  };
  assert.throws(
    () => evaluateProductionEvidence({ evidence, contract }),
    /desktopApproved divergente/,
  );
  evidence.desktopApproved = true;
  const result = evaluateProductionEvidence({ evidence, contract });
  assert.equal(result.eligibleForTemplatePromotion, true);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const proofScript = readFileSync(
  "scripts/prove-v3000-hostinger-artifact.mjs",
  "utf8",
);
const verifier = readFileSync("scripts/verify-hostinger-package.mjs", "utf8");

test("Fase 10 prova o artefato exato e não apenas o workspace", () => {
  assert.match(proofScript, /unzip/);
  assert.match(proofScript, /sha256/);
  assert.match(proofScript, /sourceFingerprint/);
  assert.match(proofScript, /routeSourceIncluded: true/);
  assert.match(proofScript, /realEnvironmentFilesIncluded: false/);
  assert.match(proofScript, /databaseMutations: 0/);
  assert.match(proofScript, /deploymentPerformed: false/);
});

test("gate recusa Fase 10 sem snapshot e sem toolchain de build", () => {
  assert.match(verifier, /v3000-phase-10/);
  assert.match(verifier, /evolutionPhase !== 10/);
  assert.match(verifier, /@tailwindcss\/postcss/);
  assert.match(verifier, /Dependência ausente no lockfile/);
});

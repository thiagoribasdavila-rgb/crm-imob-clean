import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packager = readFileSync("scripts/package-hostinger.mjs", "utf8");
const verifier = readFileSync("scripts/verify-hostinger-package.mjs", "utf8");
const legacyRoutes = readFileSync("scripts/legacy-route-paths.mjs", "utf8");

test("Fase 9 permite snapshot explícito do workspace sem fingir paridade com HEAD", () => {
  assert.match(packager, /ATLAS_PACKAGE_SOURCE/);
  assert.match(packager, /workspace-content-hash/);
  assert.match(packager, /sourceMode === "git-archive"/);
  assert.match(verifier, /workspace-content-hash/);
  assert.match(verifier, /sourceProvenanceMatches/);
});

test("Fase 9 preserva o piloto /notifications no pacote Hostinger", () => {
  assert.doesNotMatch(legacyRoutes, /app\/\(crm\)\/notifications/);
  for (const source of [packager, verifier]) {
    assert.match(source, /app\/\(crm\)\/notifications\/page\.tsx/);
    assert.match(source, /notifications-v3000-surface\.tsx/);
    assert.match(source, /v3000-page-template\.tsx/);
  }
});

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (file) => readFileSync(resolve(root, file), "utf8");

test("release auditada é imutável e condicionada aos gates", () => {
  const release = read("scripts/release-audited.mjs");
  assert.match(release, /atlas-one-audited-/);
  assert.match(release, /A release já existe e não será sobrescrita/);
  assert.match(release, /unit-and-contract-tests/);
  assert.match(release, /dependency-audit-high/);
  assert.match(release, /release-check-including-production-build/);
  assert.match(release, /immutable-package-and-integrity-verification/);
  assert.match(release, /ATLAS_RELEASE_EVIDENCE_FILE/);
});

test("pacote auditado incorpora e valida o relatório sem segredos", () => {
  const packager = read("scripts/package-hostinger.mjs");
  const verifier = read("scripts/verify-hostinger-package.mjs");
  assert.match(packager, /RELEASE_TEST_REPORT\.json/);
  assert.match(packager, /gate\.status !== "passed"/);
  assert.match(verifier, /Release auditada sem relatório interno de testes/);
  assert.match(verifier, /Relatório interno contém gate sem aprovação/);
  assert.ok(
    packager.indexOf('join(stage, "RELEASE_TEST_REPORT.json")') <
      packager.indexOf('const fingerprintFiles = execFileSync'),
    "o relatório interno precisa existir antes do fingerprint da origem",
  );
  assert.doesNotMatch(read("scripts/release-audited.mjs"), /process\.env\[name\]\s*[,}]/);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const evidence = JSON.parse(
  read("docs/evidence/V3000_PHASE_379_ACTIVE_ROUTE_VALIDATION.json"),
);
const progress = JSON.parse(read("config/v3000-progress.json"));

test("auditoria reexecutável aprova as 268 rotas ativas", () => {
  const current = JSON.parse(
    execFileSync("node", ["scripts/audit-v3000-active-routes.mjs"], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  assert.equal(current.summary.sourceOk, true);
  assert.equal(current.summary.activeRouteFiles, 268);
  assert.equal(current.summary.activePages, 95);
  assert.equal(current.summary.activeApis, 173);
  assert.equal(current.summary.sourceIssues, 0);
});

test("toda página exporta componente e toda API declara método HTTP", () => {
  assert.deepEqual(evidence.findings.emptyRoutes, []);
  assert.deepEqual(evidence.findings.pagesWithoutDefaultExport, []);
  assert.deepEqual(evidence.findings.apisWithoutMethod, []);
  assert.deepEqual(evidence.findings.collisions, []);
});

test("build contém exatamente a superfície ativa e as rotas internas do Next", () => {
  assert.equal(evidence.build.required, true);
  assert.equal(evidence.build.available, true);
  assert.equal(evidence.build.ok, true);
  assert.equal(evidence.build.manifestRouteCount, 270);
  assert.equal(evidence.build.activeRoutesPresent, 268);
  assert.deepEqual(evidence.build.activeRoutesMissing, []);
  assert.deepEqual(evidence.build.publicPathMismatches, []);
  assert.deepEqual(evidence.build.quarantinedRoutesPresent, []);
  assert.deepEqual(evidence.build.unexpectedManifestRoutes, []);
  assert.deepEqual(evidence.build.internalNextRoutes, [
    "/_global-error/page",
    "/_not-found/page",
  ]);
});

test("quatro aliases permanentes chegam diretamente às páginas canônicas", () => {
  assert.equal(evidence.summary.canonicalRedirects, 4);
  assert.equal(evidence.build.configuredRedirects, 4);
  assert.equal(evidence.build.redirectsPresent, 4);
  assert.deepEqual(evidence.build.redirectsMissing, []);
  assert.deepEqual(evidence.findings.invalidAliases, []);
  assert.deepEqual(evidence.findings.aliasChains, []);
});

test("governança avança para a fase 379 e gate 6", () => {
  assert.ok(progress.program.verifiedHistoricalPhases >= 379);
  assert.ok(progress.program.phaseContractsFound >= 59);
  assert.ok(progress.program.lastVerifiedPhase >= 379);
  assert.ok(progress.consolidation.currentPhase >= 6);
  assert.equal(
    progress.consolidation.phases.find((phase) => phase.id === 6)?.status,
    "complete",
  );
  assert.ok(
    ["next", "complete"].includes(
      progress.consolidation.phases.find((phase) => phase.id === 7)?.status,
    ),
  );
});

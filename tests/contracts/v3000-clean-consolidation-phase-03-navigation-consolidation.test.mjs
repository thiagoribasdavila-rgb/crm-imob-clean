import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  readFileSync("docs/evidence/V3000_PHASE_03_NAVIGATION_CONTRACT.json", "utf8"),
);

test("toda navegação governada resolve para uma página ativa", () => {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.summary.canonicalMenuDestinations, 19);
  assert.equal(evidence.summary.governedDestinations, 29);
  assert.equal(evidence.summary.inactiveGovernedDestinations, 0);
  assert.deepEqual(evidence.findings.inactiveNavigation, []);
});

test("aliases úteis são redirects estáticos, diretos e sem colisão", () => {
  assert.equal(evidence.summary.compatibilityRedirects, 4);
  assert.equal(evidence.summary.invalidRedirects, 0);
  assert.equal(evidence.summary.duplicateSources, 0);
  assert.equal(evidence.summary.duplicateDestinations, 0);
  assert.equal(evidence.summary.redirectChains, 0);
  assert.equal(evidence.summary.redirectCycles, 0);
  assert.deepEqual(evidence.findings.invalidAliases, []);
  assert.deepEqual(evidence.findings.chains, []);
  assert.deepEqual(evidence.findings.cycles, []);
  assert.ok(evidence.redirects.every((entry) => entry.permanent));
  assert.ok(evidence.redirects.every((entry) => !entry.sourceIsActivePage));
  assert.ok(evidence.redirects.every((entry) => entry.destinationIsActivePage));
});

test("aliases sem destino operacional foram retirados do contrato público", () => {
  assert.equal(evidence.summary.removedInactiveAliases, 3);
  assert.equal(evidence.summary.removedAliasesStillGoverned, 0);
  assert.deepEqual(evidence.findings.removedAliasSourcesStillGoverned, []);
  assert.deepEqual(
    evidence.removedAliases.map(({ source }) => source).sort(),
    ["/agents", "/ai-insights", "/automation"],
  );
});

test("código ativo usa somente destinos canônicos", () => {
  assert.equal(evidence.summary.activeLegacyReferences, 0);
  assert.deepEqual(evidence.findings.activeLegacyReferences, []);
});

test("Next configura aliases estáticos e proxy permanece dedicado à sessão", () => {
  assert.deepEqual(evidence.contract, {
    activeTypecheckExcludesGeneratedQuarantineRegistry: true,
    nextConfigImportsRedirectContract: true,
    nextConfigExposesRedirects: true,
    proxyReservedForConditionalAccess: true,
  });
  assert.deepEqual(evidence.findings.generatedRouteTypeIncludes, []);
  assert.equal(evidence.summary.proxyAliasReferences, 0);
  assert.deepEqual(evidence.findings.proxyAliasReferences, []);
});

test("auditoria não lê dados, ambiente ou segredos", () => {
  assert.deepEqual(evidence.privacy, {
    readsApplicationData: false,
    readsEnvironmentSecrets: false,
    capturesPersonalData: false,
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const evidence = JSON.parse(
  readFileSync("docs/evidence/V3000_PHASE_02_ROUTE_INVENTORY.json", "utf8"),
);

test("inventário representa integralmente a superfície rastreada", () => {
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.summary.routeFiles, evidence.routes.length);
  assert.equal(
    evidence.summary.activeRouteFiles,
    evidence.routes.filter((entry) => entry.active).length,
  );
  assert.equal(
    evidence.summary.quarantinedRouteFiles,
    evidence.routes.filter((entry) => entry.quarantined).length,
  );
  assert.equal(
    evidence.summary.pages + evidence.summary.apiRoutes,
    evidence.summary.routeFiles,
  );
});

test("nenhuma URL ativa colide e todas as APIs ativas expõem método HTTP", () => {
  assert.equal(evidence.summary.activeCollisions, 0);
  assert.deepEqual(evidence.collisions.active, []);
  assert.deepEqual(
    evidence.routes
      .filter((entry) => entry.active && entry.type === "api" && entry.methods.length === 0)
      .map((entry) => entry.file),
    [],
  );
});

test("todos os destinos de navegação publicados existem na superfície ativa", () => {
  assert.equal(evidence.summary.inactiveNavigationDestinations, 0);
  assert.ok(evidence.navigation.length > 0);
  assert.deepEqual(
    evidence.navigation.filter((entry) => !entry.active).map((entry) => entry.url),
    [],
  );
  assert.ok(
    evidence.navigation.every((entry) => entry.pages.some((page) => page.active)),
  );
});

test("aliases não criam duas implementações ativas para o mesmo conceito", () => {
  assert.equal(evidence.summary.aliasesWithActiveSourceAndTarget, 0);
  assert.deepEqual(
    evidence.aliases
      .filter((entry) => entry.sourceActive && entry.targetActive)
      .map((entry) => entry.concept),
    [],
  );
});

test("fronteira pública e bootstrap permanecem explicitamente protegidos", () => {
  assert.deepEqual(evidence.requestBoundary.publicPages, [
    "/",
    "/auth/callback",
    "/forgot-password",
    "/login",
    "/reset-password",
    "/setup",
  ]);
  assert.equal(evidence.requestBoundary.hasProxyRedirect, true);
  assert.equal(evidence.requestBoundary.setupExcludedFromMatcher, true);
  assert.equal(evidence.requestBoundary.nextConfigHasRedirects, true);
  assert.equal(evidence.requestBoundary.nextConfigHasRewrites, false);
});

test("evidência não consulta dados, ambiente ou segredos", () => {
  assert.deepEqual(evidence.privacy, {
    readsApplicationData: false,
    readsEnvironmentSecrets: false,
    capturesPersonalData: false,
  });
});

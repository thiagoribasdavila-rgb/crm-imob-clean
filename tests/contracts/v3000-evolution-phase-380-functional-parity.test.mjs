import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const evidence = JSON.parse(
  read("docs/evidence/V3000_PHASE_380_FUNCTIONAL_PARITY.json"),
);
const progress = JSON.parse(read("config/v3000-progress.json"));

test("auditoria reexecutável classifica os 19 módulos canônicos", () => {
  const current = JSON.parse(
    execFileSync("node", ["scripts/audit-v3000-functional-parity.mjs"], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  assert.deepEqual(current.summary, {
    canonicalModules: 19,
    navigationEntries: 19,
    navigationExact: true,
    functionalContractProven: 18,
    connectRequired: 1,
    partialOrBroken: 0,
    invalidModules: 0,
    readyForRuntimeGate: true,
  });
});

test("módulos internos possuem interface, API, persistência, tenant e testemunhas", () => {
  const internalModules = evidence.modules.filter(
    (moduleRecord) => !moduleRecord.externalDependency,
  );
  assert.equal(internalModules.length, 18);
  for (const moduleRecord of internalModules) {
    assert.equal(
      moduleRecord.status,
      "FUNCTIONAL_CONTRACT_PROVEN",
      moduleRecord.id,
    );
    assert.equal(moduleRecord.frontend.exists, true, moduleRecord.id);
    assert.equal(moduleRecord.frontend.nonTrivial, true, moduleRecord.id);
    assert.equal(moduleRecord.frontend.defaultExport, true, moduleRecord.id);
    assert.deepEqual(moduleRecord.frontend.ui, {
      loading: true,
      error: true,
      empty: true,
    }, moduleRecord.id);
    assert.equal(moduleRecord.frontend.placeholderFree, true, moduleRecord.id);
    assert.equal(moduleRecord.api.exists, true, moduleRecord.id);
    assert.deepEqual(moduleRecord.api.missingMethods, [], moduleRecord.id);
    assert.equal(moduleRecord.api.authentication, true, moduleRecord.id);
    assert.equal(moduleRecord.api.tenant, true, moduleRecord.id);
    assert.equal(moduleRecord.api.persistence, true, moduleRecord.id);
    assert.equal(moduleRecord.api.permissions, true, moduleRecord.id);
    assert.equal(moduleRecord.permissions.navigation, true, moduleRecord.id);
    assert.equal(moduleRecord.permissions.authenticated, true, moduleRecord.id);
    assert.equal(moduleRecord.permissions.tenantScoped, true, moduleRecord.id);
    assert.equal(moduleRecord.permissions.roleAware, true, moduleRecord.id);
    assert.equal(moduleRecord.persistence, true, moduleRecord.id);
    assert.equal(
      moduleRecord.witnesses.every((witness) => witness.exists),
      true,
      moduleRecord.id,
    );
    assert.deepEqual(moduleRecord.issues, [], moduleRecord.id);
  }
});

test("integrações não prometem operação externa sem teste real", () => {
  const integrations = evidence.modules.find(
    (moduleRecord) => moduleRecord.id === "integrations",
  );
  assert.ok(integrations);
  assert.equal(integrations.status, "CONNECT_REQUIRED");
  assert.equal(integrations.externalDependency, true);
  assert.equal(integrations.externalTruthful, true);
  assert.equal(integrations.api.authentication, true);
  assert.equal(integrations.api.tenant, true);
  assert.equal(integrations.api.persistence, true);
  assert.equal(integrations.api.permissions, true);
  assert.deepEqual(integrations.issues, []);
});

test("governança fecha a fase histórica 380 e avança ao gate 8", () => {
  assert.ok(progress.program.verifiedHistoricalPhases >= 380);
  assert.ok(progress.program.phaseContractsFound >= 60);
  assert.ok(progress.program.lastVerifiedPhase >= 380);
  assert.ok(progress.consolidation.currentPhase >= 7);
  assert.equal(
    progress.consolidation.phases.find((phase) => phase.id === 7)?.status,
    "complete",
  );
  assert.ok(
    ["next", "in_progress", "complete"].includes(
      progress.consolidation.phases.find((phase) => phase.id === 8)?.status,
    ),
  );
});

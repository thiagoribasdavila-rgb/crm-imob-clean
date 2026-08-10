import assert from "node:assert/strict";
import test from "node:test";
import {
  atlasRoleRoutines,
  getAtlasMobileNavigationForIdentity,
  getAtlasNavigationForIdentity,
  getAtlasRoleRoutineForIdentity,
  normalizeAtlasNavigationRole,
} from "../../lib/atlas/navigation.ts";

const identities = {
  director: { role: "director", accessRole: "director_decisor" },
  superintendent: { role: "superintendent", accessRole: "superintendent" },
  manager: { role: "manager", accessRole: "manager" },
  broker: { role: "broker", accessRole: "broker" },
};

test("cada papel recebe cinco destinos próprios e sem duplicidade", () => {
  for (const [role, identity] of Object.entries(identities)) {
    const routine = getAtlasRoleRoutineForIdentity(identity);
    assert.equal(routine.role, role);
    assert.equal(routine.items.length, 5);
    assert.equal(new Set(routine.items.map((item) => item.href)).size, routine.items.length);
    const permitted = new Set(getAtlasNavigationForIdentity(identity).map((item) => item.href));
    assert.ok(routine.items.every((item) => permitted.has(item.href)));
  }
});

test("rotinas refletem execução, gestão e decisão", () => {
  assert.deepEqual(atlasRoleRoutines.broker.itemIds, ["command-center", "leads", "pipeline", "tasks", "calendar"]);
  assert.ok(!atlasRoleRoutines.manager.itemIds.includes("distribution"));
  assert.ok(!atlasRoleRoutines.superintendent.itemIds.includes("distribution"));
  assert.ok(atlasRoleRoutines.superintendent.itemIds.includes("sales"));
  assert.ok(atlasRoleRoutines.director.itemIds.includes("revenue-engine"));
});

test("mobile prioriza quatro destinos por papel e fallback é restritivo", () => {
  for (const identity of Object.values(identities)) {
    assert.equal(getAtlasMobileNavigationForIdentity(identity).length, 4);
  }
  assert.equal(normalizeAtlasNavigationRole({ role: "unknown", accessRole: "unknown" }), "broker");
  assert.equal(normalizeAtlasNavigationRole({ role: "admin", accessRole: "admin" }), "director");
  assert.ok(!getAtlasNavigationForIdentity(identities.manager).some((item) => item.id === "distribution"));
  assert.ok(!getAtlasNavigationForIdentity(identities.superintendent).some((item) => item.id === "distribution"));
  assert.ok(getAtlasNavigationForIdentity(identities.director).some((item) => item.id === "distribution"));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  getAtlasNavigationForIdentity,
  getAtlasRoleRoutineForIdentity,
  getAtlasSecondaryNavigationForIdentity,
} from "../../lib/atlas/navigation.ts";

const identities = [
  { role: "director", accessRole: "director_decisor" },
  { role: "superintendent", accessRole: "superintendent" },
  { role: "manager", accessRole: "manager" },
  { role: "broker", accessRole: "broker" },
];

test("rotina e Mais particionam todo o escopo permitido sem duplicidade", () => {
  for (const identity of identities) {
    const permitted = getAtlasNavigationForIdentity(identity);
    const routine = getAtlasRoleRoutineForIdentity(identity).items;
    const secondary = getAtlasSecondaryNavigationForIdentity(identity);
    const routineIds = new Set(routine.map((item) => item.id));
    assert.ok(secondary.every((item) => !routineIds.has(item.id)));
    assert.deepEqual(
      new Set([...routine, ...secondary].map((item) => item.id)),
      new Set(permitted.map((item) => item.id)),
    );
  }
});

test("Mais contém apenas destinos permitidos ao papel", () => {
  const brokerSecondary = getAtlasSecondaryNavigationForIdentity(identities[3]);
  assert.ok(brokerSecondary.length > 0);
  assert.ok(brokerSecondary.every((item) => item.roles.includes("broker")));
  assert.ok(!brokerSecondary.some((item) => item.id === "users" || item.id === "integrations"));
});

test("rotas administrativas continuam acessíveis ao diretor sem entrar na rotina do corretor", () => {
  const directorIds = new Set(getAtlasNavigationForIdentity(identities[0]).map((item) => item.id));
  const brokerIds = new Set(getAtlasNavigationForIdentity(identities[3]).map((item) => item.id));
  assert.ok(directorIds.has("integrations"));
  assert.ok(!brokerIds.has("integrations"));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalE2ERoleProvisioningPlan,
  evaluateLocalE2EProvisionerEnvironment,
  LOCAL_E2E_PROVISIONER_ENV,
  provisionLocalE2ERoles,
} from "../../lib/testing/local-e2e-role-provisioning.mjs";
import { ISOLATED_E2E_ENV } from "../../lib/testing/isolated-e2e-readiness.mjs";

function validValues() {
  return {
    [ISOLATED_E2E_ENV.supabaseUrl]: "http://127.0.0.1:54321",
    [LOCAL_E2E_PROVISIONER_ENV]: "local-only-provisioner-secret",
    [ISOLATED_E2E_ENV.adminEmail]: "admin@isolated.test",
    [ISOLATED_E2E_ENV.adminPassword]: "local-admin-password",
    [ISOLATED_E2E_ENV.directorEmail]: "director@isolated.test",
    [ISOLATED_E2E_ENV.directorPassword]: "local-director-password",
    [ISOLATED_E2E_ENV.managerEmail]: "manager@isolated.test",
    [ISOLATED_E2E_ENV.managerPassword]: "local-manager-password",
    [ISOLATED_E2E_ENV.brokerEmail]: "broker@isolated.test",
    [ISOLATED_E2E_ENV.brokerPassword]: "local-broker-password",
  };
}

test("accepts a complete loopback-only provisioner contract", () => {
  assert.equal(evaluateLocalE2EProvisionerEnvironment(validValues()).ready, true);
});

test("rejects production Supabase and missing provisioner key", () => {
  const values = validValues();
  values[ISOLATED_E2E_ENV.supabaseUrl] =
    "https://pozbrcsfthnhmnebfoxv.supabase.co";
  delete values[LOCAL_E2E_PROVISIONER_ENV];
  const result = evaluateLocalE2EProvisionerEnvironment(values);
  assert.equal(result.ready, false);
  assert.match(result.errors.join("\n"), /operacional|ausente/);
});

test("plan contains hierarchy and variable names but no credentials", () => {
  const values = validValues();
  const serialized = JSON.stringify(buildLocalE2ERoleProvisioningPlan());
  assert.match(serialized, /DIRETOR/);
  assert.match(serialized, /GERENTE/);
  assert.match(serialized, /CORRETOR/);
  assert.doesNotMatch(serialized, new RegExp(values[LOCAL_E2E_PROVISIONER_ENV]));
  assert.doesNotMatch(serialized, /local-admin-password/);
  assert.equal(buildLocalE2ERoleProvisioningPlan().secretsIncluded, false);
});

function fakeGateway(initialUsers = []) {
  const state = {
    users: initialUsers.map((user) => ({ ...user })),
    organizations: [],
    profiles: [],
    creates: 0,
    updates: 0,
  };
  return {
    state,
    gateway: {
      async upsertOrganization(value) {
        state.organizations = [value];
      },
      async listUsers() {
        return state.users;
      },
      async createUser(attributes) {
        state.creates++;
        const user = { id: `user-${state.users.length + 1}`, email: attributes.email };
        state.users.push(user);
        return user;
      },
      async updateUser(id, attributes) {
        state.updates++;
        const user = state.users.find((item) => item.id === id);
        Object.assign(user, { email: attributes.email });
        return user;
      },
      async upsertProfile(profile) {
        const index = state.profiles.findIndex((item) => item.id === profile.id);
        if (index >= 0) state.profiles[index] = profile;
        else state.profiles.push(profile);
      },
    },
  };
}

test("provisions the official four-role hierarchy idempotently", async () => {
  const fixture = fakeGateway();
  const first = await provisionLocalE2ERoles({ gateway: fixture.gateway, values: validValues() });
  assert.equal(first.created, 4);
  assert.equal(first.secretsReturned, false);
  assert.equal(fixture.state.profiles.length, 4);
  const director = fixture.state.profiles.find((item) => item.access_role === "director_decisor");
  const manager = fixture.state.profiles.find((item) => item.access_role === "director");
  const broker = fixture.state.profiles.find((item) => item.access_role === "broker");
  assert.equal(manager.reports_to, director.id);
  assert.equal(broker.reports_to, manager.id);

  const second = await provisionLocalE2ERoles({ gateway: fixture.gateway, values: validValues() });
  assert.equal(second.created, 0);
  assert.equal(second.updated, 4);
  assert.equal(fixture.state.users.length, 4);
  assert.equal(fixture.state.profiles.length, 4);
});

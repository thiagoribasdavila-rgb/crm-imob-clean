import assert from "node:assert/strict";
import test from "node:test";
import {
  createIsolatedPlaywrightEnvironment,
  evaluateIsolatedE2EEnvironment,
  ISOLATED_E2E_ENV,
} from "../../lib/testing/isolated-e2e-readiness.mjs";

function validValues() {
  return {
    [ISOLATED_E2E_ENV.baseUrl]: "http://127.0.0.1:3000",
    [ISOLATED_E2E_ENV.supabaseUrl]: "http://127.0.0.1:54321",
    [ISOLATED_E2E_ENV.publishableKey]: "local-publishable-key",
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

test("accepts only a complete loopback-shaped isolated contract", () => {
  const result = evaluateIsolatedE2EEnvironment(validValues(), {
    dockerAvailable: true,
    localSupabaseAvailable: true,
    workspaceEnvIsolated: true,
  });
  assert.equal(result.contractReady, true);
  assert.equal(result.runtimeReady, true);
});

test("rejects the Atlas production domain", () => {
  const values = validValues();
  values[ISOLATED_E2E_ENV.baseUrl] = "https://atlasaios.com.br";
  const result = evaluateIsolatedE2EEnvironment(values);
  assert.equal(result.contractReady, false);
  assert.match(result.errors.join("\n"), /loopback|operacional proibido/);
});

test("rejects the known operational Supabase project", () => {
  const values = validValues();
  values[ISOLATED_E2E_ENV.supabaseUrl] =
    "https://pozbrcsfthnhmnebfoxv.supabase.co";
  const result = evaluateIsolatedE2EEnvironment(values);
  assert.equal(result.contractReady, false);
  assert.match(result.errors.join("\n"), /Supabase operacional proibido/);
});

test("does not fall back to generic or production credentials", () => {
  const values = validValues();
  delete values[ISOLATED_E2E_ENV.adminEmail];
  values.ATLAS_TEST_EMAIL = "legacy@example.com";
  values.ATLAS_TEST_PASSWORD = "legacy-password";
  const result = evaluateIsolatedE2EEnvironment(values);
  assert.equal(result.contractReady, false);
  assert.ok(result.missing.includes(ISOLATED_E2E_ENV.adminEmail));
});

test("requires distinct accounts for each role", () => {
  const values = validValues();
  values[ISOLATED_E2E_ENV.brokerEmail] = values[ISOLATED_E2E_ENV.managerEmail];
  const result = evaluateIsolatedE2EEnvironment(values);
  assert.equal(result.contractReady, false);
  assert.match(result.errors.join("\n"), /conta isolada distinta/);
});

test("rejects an isolated service-role variable", () => {
  const result = evaluateIsolatedE2EEnvironment({
    ...validValues(),
    ATLAS_E2E_ISOLATED_SERVICE_ROLE_KEY: "must-not-be-used",
  });
  assert.equal(result.contractReady, false);
  assert.match(result.errors.join("\n"), /SERVICE_ROLE_KEY é proibida/);
});

test("sanitized child environment removes admin and legacy fallbacks", () => {
  const child = createIsolatedPlaywrightEnvironment(validValues(), {
    PATH: "/usr/local/bin:/usr/bin",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    DATABASE_URL: "postgresql://production",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-key",
    OPENAI_API_KEY: "external-ai-secret",
    META_ACCESS_TOKEN: "external-meta-secret",
    WHATSAPP_ACCESS_TOKEN: "external-whatsapp-secret",
    ATLAS_TEST_EMAIL: "legacy@example.com",
    ATLAS_TEST_PASSWORD: "legacy-password",
    ATLAS_BASE_URL: "https://atlasaios.com.br",
    ATLAS_E2E_ADMIN_EMAIL: "production@example.com",
    ATLAS_E2E_LOCAL_PROVISIONER_SERVICE_ROLE_KEY: "local-admin-secret",
  });
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(child.DATABASE_URL, undefined);
  assert.equal(child.NEXT_PUBLIC_SUPABASE_ANON_KEY, undefined);
  assert.equal(child.OPENAI_API_KEY, undefined);
  assert.equal(child.META_ACCESS_TOKEN, undefined);
  assert.equal(child.WHATSAPP_ACCESS_TOKEN, undefined);
  assert.equal(child.ATLAS_TEST_EMAIL, undefined);
  assert.equal(child.ATLAS_BASE_URL, undefined);
  assert.equal(child.ATLAS_E2E_ADMIN_EMAIL, "admin@isolated.test");
  assert.equal(child.ATLAS_E2E_LOCAL_PROVISIONER_SERVICE_ROLE_KEY, undefined);
  assert.equal(child.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(child.PATH, "/usr/local/bin:/usr/bin");
  assert.equal(child[ISOLATED_E2E_ENV.adminPassword], undefined);
});

test("runtime stays blocked when Docker or local Supabase is absent", () => {
  const result = evaluateIsolatedE2EEnvironment(validValues(), {
    dockerAvailable: false,
    localSupabaseAvailable: false,
    workspaceEnvIsolated: true,
  });
  assert.equal(result.contractReady, true);
  assert.equal(result.runtimeReady, false);
});

test("runtime refuses a workspace that can auto-load .env.local", () => {
  const result = evaluateIsolatedE2EEnvironment(validValues(), {
    dockerAvailable: true,
    localSupabaseAvailable: true,
    workspaceEnvIsolated: false,
  });
  assert.equal(result.contractReady, true);
  assert.equal(result.runtimeReady, false);
  assert.equal(result.runtime.workspaceEnvIsolated, false);
});

import { existsSync, readFileSync } from "node:fs";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^[\"']|[\"']$/g, "")];
  }));
}

const present = (value) => typeof value === "string" && value.trim().length >= 8;
const safeHttpsUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname) && !/(?:localhost|example\.|seudominio|seu-dominio)/i.test(parsed.hostname);
  } catch { return false; }
};
const postgresUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ["postgres:", "postgresql:"].includes(parsed.protocol) && Boolean(parsed.hostname) && parsed.pathname !== "/";
  } catch { return false; }
};

export function auditLeadRoundtripEnvironment(input) {
  const value = (key) => String(input?.[key] ?? "").trim();
  const baseUrl = value("ATLAS_BASE_URL").replace(/\/$/, "");
  const publicUrl = value("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  const publicKey = value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || value("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = value("SUPABASE_SERVICE_ROLE_KEY");
  const checks = {
    atlasHomologation: value("ATLAS_ENV") === "homologation",
    databaseHomologation: value("ATLAS_DATABASE_ENVIRONMENT") === "homologation",
    environmentIdentityPresent: present(value("ATLAS_ENVIRONMENT_ID")),
    secureBaseUrl: safeHttpsUrl(baseUrl),
    applicationUrlsAligned: safeHttpsUrl(baseUrl) && baseUrl === publicUrl,
    dedicatedTenantReferencePresent: present(value("ATLAS_DEFAULT_ORGANIZATION_ID")),
    syntheticTestAccountPresent: present(value("ATLAS_TEST_EMAIL")) && present(value("ATLAS_TEST_PASSWORD")),
    supabasePublicConfigurationPresent: safeHttpsUrl(value("NEXT_PUBLIC_SUPABASE_URL")) && present(publicKey),
    supabaseServerCredentialPresent: present(serviceKey),
    postgresConnectionStructurallyValid: postgresUrl(value("DATABASE_URL")),
    serviceCredentialServerOnly: present(serviceKey) && !Object.entries(input ?? {}).some(([key, candidate]) => key.startsWith("NEXT_PUBLIC_") && candidate === serviceKey)
  };
  const missingChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    schema: "atlas.lead-roundtrip-environment-audit.v1",
    status: missingChecks.length ? "environment_configuration_incomplete" : "environment_structure_ready_permit_still_required",
    passedChecks: Object.values(checks).filter(Boolean).length,
    totalChecks: Object.keys(checks).length,
    checks,
    missingChecks,
    network: { connectionAttempted: false, databaseQueryExecuted: false, authenticationAttempted: false, httpRequestExecuted: false },
    release: { permitMayBeCompleted: missingChecks.length === 0, executionAllowed: false, productionAllowed: false, metaEmissionAllowed: false, zipAllowed: false }
  };
}

export function selfTestLeadRoundtripEnvironmentAudit() {
  const valid = {
    ATLAS_ENV: "homologation",
    ATLAS_DATABASE_ENVIRONMENT: "homologation",
    ATLAS_ENVIRONMENT_ID: "homologation-atlas-001",
    ATLAS_BASE_URL: "https://homologation.atlas.invalid",
    NEXT_PUBLIC_APP_URL: "https://homologation.atlas.invalid",
    ATLAS_DEFAULT_ORGANIZATION_ID: "tenant-homologation-001",
    ATLAS_TEST_EMAIL: "synthetic-test-account",
    ATLAS_TEST_PASSWORD: "synthetic-test-password",
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic-project.supabase.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-secret",
    DATABASE_URL: "postgresql://synthetic:synthetic@db.invalid:5432/atlas"
  };
  const cases = [
    ["valid", (value) => value, 11],
    ["production", (value) => { value.ATLAS_ENV = "production"; return value; }, 10],
    ["database_mismatch", (value) => { value.ATLAS_DATABASE_ENVIRONMENT = "production"; return value; }, 10],
    ["insecure_url", (value) => { value.ATLAS_BASE_URL = "http://localhost:3000"; return value; }, 9],
    ["url_mismatch", (value) => { value.NEXT_PUBLIC_APP_URL = "https://other.atlas.invalid"; return value; }, 10],
    ["missing_tenant", (value) => { value.ATLAS_DEFAULT_ORGANIZATION_ID = ""; return value; }, 10],
    ["missing_test_account", (value) => { value.ATLAS_TEST_PASSWORD = ""; return value; }, 10],
    ["missing_public_key", (value) => { value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ""; return value; }, 10],
    ["service_key_exposed", (value) => { value.NEXT_PUBLIC_LEAK = value.SUPABASE_SERVICE_ROLE_KEY; return value; }, 10],
    ["invalid_postgres", (value) => { value.DATABASE_URL = "not-a-url"; return value; }, 10]
  ];
  const failures = cases.filter(([_, mutate, expectedPassed]) => auditLeadRoundtripEnvironment(mutate(structuredClone(valid))).passedChecks !== expectedPassed).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestLeadRoundtripEnvironmentAudit();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
} else if (process.argv[1]?.endsWith("audit-lead-roundtrip-environment.mjs")) {
  const local = loadEnvFile(new URL("../.env.local", import.meta.url));
  const result = auditLeadRoundtripEnvironment({ ...local, ...process.env });
  console.log(JSON.stringify(result, null, 2));
}

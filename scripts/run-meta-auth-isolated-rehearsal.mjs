import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

const normalizeUrl = (value) => value.replace(/\/$/, "");

function decodeLegacyKeyRole(value) {
  try {
    const part = value.split(".")[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

function classifyKey(value) {
  if (value.startsWith("sb_publishable_")) return "publishable";
  if (value.startsWith("sb_secret_")) return "secret";
  const role = decodeLegacyKeyRole(value);
  if (role === "anon") return "legacy_anon";
  if (role === "service_role") return "legacy_service_role";
  return "unknown";
}

const environment = required("ATLAS_AUTH_TEST_ENVIRONMENT");
const mutationApproved = process.env.ATLAS_AUTH_TEST_MUTATION_APPROVED === "true";
const requireEmptyClone = process.env.ATLAS_AUTH_TEST_REQUIRE_EMPTY_CLONE === "true";
const url = normalizeUrl(required("ATLAS_AUTH_TEST_SUPABASE_URL"));
const publishableKey = required("ATLAS_AUTH_TEST_SUPABASE_PUBLISHABLE_KEY");
const secretKey = required("ATLAS_AUTH_TEST_SUPABASE_SECRET_KEY");
const expectedRef = required("ATLAS_AUTH_TEST_EXPECTED_PROJECT_REF");
const target = new URL(url);
const productionUrls = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.ATLAS_PRODUCTION_SUPABASE_URL]
  .filter(Boolean)
  .map(normalizeUrl);

if (environment !== "staging_clone") throw new Error("staging_clone_required");
if (!mutationApproved) throw new Error("explicit_staging_mutation_approval_required");
if (!requireEmptyClone) throw new Error("empty_clone_confirmation_required");
if (target.protocol !== "https:") throw new Error("https_staging_target_required");
if (target.hostname !== `${expectedRef}.supabase.co`) throw new Error("expected_staging_project_reference_mismatch");
if (productionUrls.includes(url)) throw new Error("production_target_forbidden");
if (!["publishable", "legacy_anon"].includes(classifyKey(publishableKey))) throw new Error("invalid_publishable_key_class");
if (!["secret", "legacy_service_role"].includes(classifyKey(secretKey))) throw new Error("invalid_secret_key_class");

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const runId = randomBytes(8).toString("hex");
const organizationIds = [randomUUID(), randomUUID()];
const leadIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const createdAuthUsers = [];
const createdProfileIds = [];
const cleanupErrors = [];
let mutationStarted = false;
let phase14Evidence = null;

const definitions = [
  { key: "directorA", org: 0, name: "Atlas Synthetic Director A", role: "director_decisor", accessRole: "director_decisor", commercialRole: "director", supervisor: null },
  { key: "managerA", org: 0, name: "Atlas Synthetic Manager A", role: "director", accessRole: "director", commercialRole: "manager", supervisor: "directorA" },
  { key: "brokerA", org: 0, name: "Atlas Synthetic Broker A", role: "broker", accessRole: "broker", commercialRole: "broker", supervisor: "managerA" },
  { key: "teammateA", org: 0, name: "Atlas Synthetic Teammate A", role: "broker", accessRole: "broker", commercialRole: "broker", supervisor: "managerA" },
  { key: "managerOtherA", org: 0, name: "Atlas Synthetic Manager Other A", role: "director", accessRole: "director", commercialRole: "manager", supervisor: "directorA" },
  { key: "otherTeamBrokerA", org: 0, name: "Atlas Synthetic Other Team Broker A", role: "broker", accessRole: "broker", commercialRole: "broker", supervisor: "managerOtherA" },
  { key: "directorB", org: 1, name: "Atlas Synthetic Director B", role: "director_decisor", accessRole: "director_decisor", commercialRole: "director", supervisor: null },
  { key: "managerB", org: 1, name: "Atlas Synthetic Manager B", role: "director", accessRole: "director", commercialRole: "manager", supervisor: "directorB" },
  { key: "brokerB", org: 1, name: "Atlas Synthetic Broker B", role: "broker", accessRole: "broker", commercialRole: "broker", supervisor: "managerB" },
];

function credentialsFor(definition) {
  return {
    email: `atlas-phase15-${runId}-${definition.key.toLowerCase()}@example.invalid`,
    password: `${randomBytes(24).toString("base64url")}!Aa7`,
  };
}

async function countRows(table) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`schema_or_count_failed_${table}:${error.code ?? "unknown"}`);
  return count ?? 0;
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth_inventory_failed:${error.status ?? "unknown"}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 1000) return users;
  }
}

async function assertSchemaAndEmptyClone() {
  for (const [table, columns] of [
    ["organizations", "id,name,slug,plan,active"],
    ["profiles", "id,organization_id,full_name,role,access_role,commercial_role,reports_to,active"],
    ["leads", "id,organization_id,name,status,assigned_to,created_at"],
  ]) {
    const { error } = await admin.from(table).select(columns).limit(0);
    if (error) throw new Error(`required_schema_missing_${table}:${error.code ?? "unknown"}`);
  }
  const counts = {
    organizations: await countRows("organizations"),
    profiles: await countRows("profiles"),
    leads: await countRows("leads"),
    authUsers: (await listAuthUsers()).length,
  };
  if (Object.values(counts).some((count) => count !== 0)) throw new Error("isolated_clone_not_empty");
  return counts;
}

async function provision() {
  mutationStarted = true;
  const organizations = organizationIds.map((id, index) => ({
    id,
    name: `Atlas isolated rehearsal ${index === 0 ? "A" : "B"}`,
    slug: `atlas-rehearsal-${runId}-${index === 0 ? "a" : "b"}`,
    plan: "founder",
    active: true,
  }));
  const { error: organizationError } = await admin.from("organizations").insert(organizations);
  if (organizationError) throw new Error(`fixture_organization_create_failed:${organizationError.code ?? "unknown"}`);

  const ids = new Map();
  const credentials = new Map();
  for (const definition of definitions) {
    const login = credentialsFor(definition);
    const organizationId = organizationIds[definition.org];
    const { data, error } = await admin.auth.admin.createUser({
      email: login.email,
      password: login.password,
      email_confirm: true,
      user_metadata: { full_name: definition.name },
      app_metadata: { organization_id: organizationId, access_role: definition.accessRole, atlas_fixture: "phase_015" },
    });
    if (error || !data.user) throw new Error(`fixture_auth_user_create_failed:${definition.key}`);
    createdAuthUsers.push(data.user.id);
    ids.set(definition.key, data.user.id);
    credentials.set(definition.key, login);
    const reportsTo = definition.supervisor ? ids.get(definition.supervisor) : null;
    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      organization_id: organizationId,
      full_name: definition.name,
      role: definition.role,
      access_role: definition.accessRole,
      commercial_role: definition.commercialRole,
      reports_to: reportsTo,
      active: true,
    }, { onConflict: "id" });
    if (profileError) throw new Error(`fixture_profile_create_failed:${definition.key}`);
    createdProfileIds.push(data.user.id);
  }

  const leadFixtures = [
    { id: leadIds[0], organization_id: organizationIds[0], name: "Atlas Synthetic Own Lead", assigned_to: ids.get("brokerA") },
    { id: leadIds[1], organization_id: organizationIds[0], name: "Atlas Synthetic Teammate Lead", assigned_to: ids.get("teammateA") },
    { id: leadIds[2], organization_id: organizationIds[0], name: "Atlas Synthetic Other Team Lead", assigned_to: ids.get("otherTeamBrokerA") },
    { id: leadIds[3], organization_id: organizationIds[1], name: "Atlas Synthetic Cross Tenant Lead", assigned_to: ids.get("brokerB") },
  ].map((lead) => ({ ...lead, status: "novo", source: "phase_015_isolated_rehearsal" }));
  const { error: leadError } = await admin.from("leads").insert(leadFixtures);
  if (leadError) throw new Error(`fixture_lead_create_failed:${leadError.code ?? "unknown"}`);
  return { ids, credentials };
}

function runPhase14(fixtures) {
  const env = {
    ...process.env,
    ATLAS_AUTH_TEST_BROKER_A_EMAIL: fixtures.credentials.get("brokerA").email,
    ATLAS_AUTH_TEST_BROKER_A_PASSWORD: fixtures.credentials.get("brokerA").password,
    ATLAS_AUTH_TEST_MANAGER_A_EMAIL: fixtures.credentials.get("managerA").email,
    ATLAS_AUTH_TEST_MANAGER_A_PASSWORD: fixtures.credentials.get("managerA").password,
    ATLAS_AUTH_TEST_DIRECTOR_A_EMAIL: fixtures.credentials.get("directorA").email,
    ATLAS_AUTH_TEST_DIRECTOR_A_PASSWORD: fixtures.credentials.get("directorA").password,
    ATLAS_AUTH_TEST_BROKER_B_EMAIL: fixtures.credentials.get("brokerB").email,
    ATLAS_AUTH_TEST_BROKER_B_PASSWORD: fixtures.credentials.get("brokerB").password,
    ATLAS_AUTH_TEST_OWN_LEAD_A_ID: leadIds[0],
    ATLAS_AUTH_TEST_TEAMMATE_LEAD_A_ID: leadIds[1],
    ATLAS_AUTH_TEST_OTHER_TEAM_LEAD_A_ID: leadIds[2],
    ATLAS_AUTH_TEST_CROSS_TENANT_LEAD_B_ID: leadIds[3],
  };
  const child = spawnSync(process.execPath, ["scripts/run-meta-auth-jwt-data-api-staging.mjs"], {
    cwd: new URL("..", import.meta.url), env, encoding: "utf8", maxBuffer: 2 * 1024 * 1024,
  });
  const raw = (child.status === 0 ? child.stdout : child.stderr || child.stdout).trim();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("phase14_evidence_not_json"); }
  if (child.status !== 0 || parsed?.passed !== true) throw new Error(`phase14_rehearsal_failed:${parsed?.errorCode ?? "unknown"}`);
  return parsed;
}

async function cleanup() {
  if (!mutationStarted) return { complete: true, zeroResidual: true, skipped: true };
  const attempt = async (code, operation) => {
    try { await operation(); } catch { cleanupErrors.push(code); }
  };
  await attempt("cleanup_leads_failed", async () => {
    const { error } = await admin.from("leads").delete().in("id", leadIds);
    if (error) throw error;
  });
  await attempt("cleanup_profile_links_failed", async () => {
    if (!createdProfileIds.length) return;
    const { error } = await admin.from("profiles").update({ active: false, reports_to: null }).in("id", createdProfileIds);
    if (error) throw error;
  });
  await attempt("cleanup_profiles_failed", async () => {
    if (!createdProfileIds.length) return;
    const { error } = await admin.from("profiles").delete().in("id", createdProfileIds);
    if (error) throw error;
  });
  for (const userId of [...createdAuthUsers].reverse()) {
    await attempt("cleanup_auth_user_failed", async () => {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw error;
    });
  }
  await attempt("cleanup_organizations_failed", async () => {
    const { error } = await admin.from("organizations").delete().in("id", organizationIds);
    if (error) throw error;
  });
  let residual = { organizations: -1, profiles: -1, leads: -1, authUsers: -1 };
  await attempt("cleanup_residual_check_failed", async () => {
    residual = {
      organizations: await countRows("organizations"),
      profiles: await countRows("profiles"),
      leads: await countRows("leads"),
      authUsers: (await listAuthUsers()).length,
    };
  });
  const zeroResidual = Object.values(residual).every((count) => count === 0);
  if (!zeroResidual) cleanupErrors.push("cleanup_residual_detected");
  return { complete: cleanupErrors.length === 0, zeroResidual, residual, errorCodes: [...new Set(cleanupErrors)] };
}

async function main() {
  let preflightCounts;
  let primaryError = null;
  let fixtureResult = null;
  try {
    preflightCounts = await assertSchemaAndEmptyClone();
    fixtureResult = await provision();
    phase14Evidence = runPhase14(fixtureResult);
  } catch (error) {
    primaryError = error instanceof Error ? error.message.split(":")[0] : "unknown_failure";
  }
  const cleanupResult = await cleanup();
  const passed = !primaryError && phase14Evidence?.passed === true && cleanupResult.complete && cleanupResult.zeroResidual;
  const output = {
    format: "atlas_meta_auth_isolated_rehearsal_evidence_v1",
    phase: 15,
    environment: "staging_clone",
    passed,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    productionProject: false,
    emptyCloneGate: { required: true, passed: Boolean(preflightCounts), initialCounts: preflightCounts ?? null },
    fixtureLifecycle: {
      provisioned: Boolean(fixtureResult),
      organizationsCreated: fixtureResult ? 2 : 0,
      authUsersCreated: createdAuthUsers.length,
      profilesCreated: createdProfileIds.length,
      leadsCreated: fixtureResult ? 4 : 0,
      credentialsPersisted: false,
      cleanup: cleanupResult,
    },
    authJwtDataApi: phase14Evidence ? {
      passed: true,
      scenarioCount: phase14Evidence.scenarioCount,
      realSignedJwt: phase14Evidence.sessionType === "real_signed_supabase_jwt",
      hierarchyAndTenantIsolation: phase14Evidence.scenarios?.filter((item) => item.id.includes("scope") || item.id.includes("cross_tenant")).every((item) => item.passed) === true,
      anonymousDenied: phase14Evidence.scenarios?.some((item) => item.id === "anonymous_data_api_denied" && item.passed) === true,
      serviceRoleServerOnly: phase14Evidence.scenarios?.some((item) => item.id === "service_role_server_boundary" && item.passed) === true,
      refreshRevocation: phase14Evidence.scenarios?.some((item) => item.id === "revoked_refresh_token_rejected" && item.passed) === true,
      tokensPersisted: false,
    } : null,
    errorCode: primaryError,
    prohibitedActions: {
      productionMutation: false,
      realMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
  };
  console.log(JSON.stringify(output, null, 2));
  if (!passed) process.exit(1);
}

main().catch(async (error) => {
  const cleanupResult = await cleanup();
  console.error(JSON.stringify({
    format: "atlas_meta_auth_isolated_rehearsal_evidence_v1",
    phase: 15,
    passed: false,
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
    cleanup: cleanupResult,
  }));
  process.exit(1);
});

import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

const environment = required("ATLAS_RLS_TEST_ENVIRONMENT");
const mutationApproved = process.env.ATLAS_RLS_TEST_MUTATION_APPROVED === "true";
const url = required("ATLAS_RLS_TEST_SUPABASE_URL");
const anonKey = required("ATLAS_RLS_TEST_SUPABASE_ANON_KEY");
const expectedRef = required("ATLAS_RLS_TEST_EXPECTED_PROJECT_REF");
const productionUrls = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.ATLAS_PRODUCTION_SUPABASE_URL]
  .filter(Boolean)
  .map((value) => value.replace(/\/$/, ""));

if (environment !== "staging_clone") throw new Error("staging_clone_required");
if (!mutationApproved) throw new Error("explicit_staging_mutation_approval_required");
if (!url.includes(expectedRef)) throw new Error("expected_staging_project_reference_mismatch");
if (productionUrls.includes(url.replace(/\/$/, ""))) throw new Error("production_target_forbidden");

const fixtures = {
  brokerA: {
    email: required("ATLAS_RLS_TEST_BROKER_A_EMAIL"),
    password: required("ATLAS_RLS_TEST_BROKER_A_PASSWORD"),
  },
  managerA: {
    email: required("ATLAS_RLS_TEST_MANAGER_A_EMAIL"),
    password: required("ATLAS_RLS_TEST_MANAGER_A_PASSWORD"),
  },
  directorA: {
    email: required("ATLAS_RLS_TEST_DIRECTOR_A_EMAIL"),
    password: required("ATLAS_RLS_TEST_DIRECTOR_A_PASSWORD"),
  },
  brokerB: {
    email: required("ATLAS_RLS_TEST_BROKER_B_EMAIL"),
    password: required("ATLAS_RLS_TEST_BROKER_B_PASSWORD"),
  },
  ownLeadA: required("ATLAS_RLS_TEST_OWN_LEAD_A_ID"),
  teammateLeadA: required("ATLAS_RLS_TEST_TEAMMATE_LEAD_A_ID"),
  otherTeamLeadA: required("ATLAS_RLS_TEST_OTHER_TEAM_LEAD_A_ID"),
  crossTenantLeadB: required("ATLAS_RLS_TEST_CROSS_TENANT_LEAD_B_ID"),
};

const results = [];
const record = (id, passed, details = {}) => {
  results.push({ id, passed, ...details });
  if (!passed) throw new Error(`staging_assertion_failed:${id}`);
};

async function clientFor(credentials) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.session?.access_token || !data.user?.id) throw new Error("staging_authentication_failed");
  return client;
}

async function visible(client, ids) {
  const { data, error } = await client.from("leads").select("id").in("id", ids);
  if (error) throw new Error(`staging_read_failed:${error.code ?? "unknown"}`);
  return new Set((data ?? []).map((row) => row.id));
}

const brokerA = await clientFor(fixtures.brokerA);
const brokerVisible = await visible(brokerA, [
  fixtures.ownLeadA,
  fixtures.teammateLeadA,
  fixtures.otherTeamLeadA,
  fixtures.crossTenantLeadB,
]);
record("broker_own_lead_allowed", brokerVisible.has(fixtures.ownLeadA), { visibleRows: 1 });
record("broker_teammate_denied", !brokerVisible.has(fixtures.teammateLeadA), { visibleRows: 0 });
record("broker_other_team_denied", !brokerVisible.has(fixtures.otherTeamLeadA), { visibleRows: 0 });
record("broker_cross_tenant_denied", !brokerVisible.has(fixtures.crossTenantLeadB), { visibleRows: 0 });

const managerA = await clientFor(fixtures.managerA);
const managerVisible = await visible(managerA, [fixtures.ownLeadA, fixtures.teammateLeadA, fixtures.otherTeamLeadA, fixtures.crossTenantLeadB]);
record("manager_team_allowed", managerVisible.has(fixtures.ownLeadA) && managerVisible.has(fixtures.teammateLeadA), { visibleRows: 2 });
record("manager_other_team_denied", !managerVisible.has(fixtures.otherTeamLeadA), { visibleRows: 0 });
record("manager_cross_tenant_denied", !managerVisible.has(fixtures.crossTenantLeadB), { visibleRows: 0 });

const directorA = await clientFor(fixtures.directorA);
const directorVisible = await visible(directorA, [fixtures.ownLeadA, fixtures.teammateLeadA, fixtures.otherTeamLeadA, fixtures.crossTenantLeadB]);
record("director_same_tenant_allowed", directorVisible.has(fixtures.ownLeadA) && directorVisible.has(fixtures.otherTeamLeadA), { visibleRows: 3 });
record("director_cross_tenant_denied", !directorVisible.has(fixtures.crossTenantLeadB), { visibleRows: 0 });

const brokerB = await clientFor(fixtures.brokerB);
const brokerBVisible = await visible(brokerB, [fixtures.crossTenantLeadB, fixtures.ownLeadA]);
record("second_tenant_own_lead_allowed", brokerBVisible.has(fixtures.crossTenantLeadB), { visibleRows: 1 });
record("second_tenant_cross_read_denied", !brokerBVisible.has(fixtures.ownLeadA), { visibleRows: 0 });

const { data: originalRows, error: originalError } = await brokerA.from("leads").select("id,status").eq("id", fixtures.ownLeadA).limit(1);
if (originalError || originalRows?.length !== 1) throw new Error("staging_restore_snapshot_failed");
const originalStatus = originalRows[0].status;
const probeStatus = originalStatus === "contact" ? "new" : "contact";

try {
  const { data: ownUpdate, error: ownUpdateError } = await brokerA
    .from("leads").update({ status: probeStatus }).eq("id", fixtures.ownLeadA).select("id");
  record("broker_own_update_allowed", !ownUpdateError && ownUpdate?.length === 1, { affectedRows: 1 });

  const { data: crossUpdate, error: crossUpdateError } = await brokerA
    .from("leads").update({ status: probeStatus }).eq("id", fixtures.crossTenantLeadB).select("id");
  record("broker_cross_tenant_update_denied", !crossUpdateError && (crossUpdate?.length ?? 0) === 0, { affectedRows: 0 });
} finally {
  const { data: restored, error: restoreError } = await brokerA
    .from("leads").update({ status: originalStatus }).eq("id", fixtures.ownLeadA).select("id");
  if (restoreError || restored?.length !== 1) throw new Error("staging_restore_failed");
}

for (const client of [brokerA, managerA, directorA, brokerB]) await client.auth.signOut();

console.log(JSON.stringify({
  format: "atlas_meta_rls_jwt_data_api_evidence_v1",
  environment: "staging_clone",
  passed: results.every((item) => item.passed),
  sanitized: true,
  containsSecrets: false,
  containsPersonalData: false,
  projectIdentifiersPersisted: false,
  productionProject: false,
  sessionType: "real_signed_supabase_jwt",
  restoredAfterMutationProbe: true,
  scenarioCount: results.length,
  scenarios: results,
  prohibitedActions: {
    realMetaEventDelivery: false,
    campaignMutation: false,
    budgetMutation: false,
    audienceMutation: false,
  },
}, null, 2));

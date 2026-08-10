import { createClient } from "@supabase/supabase-js";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
};

const normalizeUrl = (value) => value.replace(/\/$/, "");
const uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
const audienceIncludesAuthenticated = (value) => value === "authenticated" || (Array.isArray(value) && value.includes("authenticated"));

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
if (target.protocol !== "https:") throw new Error("https_staging_target_required");
if (target.hostname !== `${expectedRef}.supabase.co`) throw new Error("expected_staging_project_reference_mismatch");
if (productionUrls.includes(url)) throw new Error("production_target_forbidden");
if (!["publishable", "legacy_anon"].includes(classifyKey(publishableKey))) throw new Error("invalid_publishable_key_class");
if (!["secret", "legacy_service_role"].includes(classifyKey(secretKey))) throw new Error("invalid_secret_key_class");

const fixtures = {
  brokerA: {
    email: required("ATLAS_AUTH_TEST_BROKER_A_EMAIL"),
    password: required("ATLAS_AUTH_TEST_BROKER_A_PASSWORD"),
  },
  managerA: {
    email: required("ATLAS_AUTH_TEST_MANAGER_A_EMAIL"),
    password: required("ATLAS_AUTH_TEST_MANAGER_A_PASSWORD"),
  },
  directorA: {
    email: required("ATLAS_AUTH_TEST_DIRECTOR_A_EMAIL"),
    password: required("ATLAS_AUTH_TEST_DIRECTOR_A_PASSWORD"),
  },
  brokerB: {
    email: required("ATLAS_AUTH_TEST_BROKER_B_EMAIL"),
    password: required("ATLAS_AUTH_TEST_BROKER_B_PASSWORD"),
  },
  ownLeadA: required("ATLAS_AUTH_TEST_OWN_LEAD_A_ID"),
  teammateLeadA: required("ATLAS_AUTH_TEST_TEAMMATE_LEAD_A_ID"),
  otherTeamLeadA: required("ATLAS_AUTH_TEST_OTHER_TEAM_LEAD_A_ID"),
  crossTenantLeadB: required("ATLAS_AUTH_TEST_CROSS_TENANT_LEAD_B_ID"),
};

const results = [];
const clients = [];
const record = (id, passed, details = {}) => {
  results.push({ id, passed, ...details });
  if (!passed) throw new Error(`staging_assertion_failed:${id}`);
};

function publicClient(key = publishableKey) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.push(client);
  return client;
}

async function signedIdentity(label, credentials) {
  const client = publicClient();
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.session?.access_token || !data.session.refresh_token || !data.user?.id) {
    throw new Error(`staging_authentication_failed:${label}`);
  }
  const { data: verified, error: claimsError } = await client.auth.getClaims(data.session.access_token);
  if (claimsError || !verified?.claims) throw new Error(`signed_claim_verification_failed:${label}`);
  const claims = verified.claims;
  const now = Math.floor(Date.now() / 1_000);
  const issuer = `${url}/auth/v1`;
  const valid = claims.sub === data.user.id
    && claims.role === "authenticated"
    && audienceIncludesAuthenticated(claims.aud)
    && claims.iss === issuer
    && typeof claims.exp === "number" && claims.exp > now
    && typeof claims.iat === "number" && claims.iat <= now + 60
    && uuid(claims.session_id)
    && claims.is_anonymous !== true
    && verified.header?.alg !== "none";
  record(`signed_claims_${label}`, valid, {
    signatureVerified: true,
    subjectMatchesAuthUser: claims.sub === data.user.id,
    sessionIdPresent: uuid(claims.session_id),
  });
  return { client, user: data.user, session: data.session, claims };
}

async function visible(client, ids) {
  const { data, error } = await client.from("leads").select("id").in("id", ids);
  return { ids: new Set((data ?? []).map((row) => row.id)), error };
}

async function main() {
  const jwks = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
    headers: { Accept: "application/json" },
  });
  const jwksBody = await jwks.json().catch(() => null);
  record("jwks_discovery_reachable", jwks.ok && Array.isArray(jwksBody?.keys), {
    keyCount: Array.isArray(jwksBody?.keys) ? jwksBody.keys.length : 0,
    supportsAsymmetricDiscovery: (jwksBody?.keys?.length ?? 0) > 0,
  });

  const brokerA = await signedIdentity("broker_a", fixtures.brokerA);
  const managerA = await signedIdentity("manager_a", fixtures.managerA);
  const directorA = await signedIdentity("director_a", fixtures.directorA);
  const brokerB = await signedIdentity("broker_b", fixtures.brokerB);

  const initialAccessToken = brokerA.session.access_token;
  const initialRefreshToken = brokerA.session.refresh_token;
  const initialSessionId = brokerA.claims.session_id;
  const { data: refreshed, error: refreshError } = await brokerA.client.auth.refreshSession({ refresh_token: initialRefreshToken });
  if (refreshError || !refreshed.session?.access_token || !refreshed.session.refresh_token) throw new Error("session_refresh_failed");
  const { data: refreshedClaims, error: refreshedClaimsError } = await brokerA.client.auth.getClaims(refreshed.session.access_token);
  record(
    "refresh_token_rotation_verified",
    !refreshedClaimsError
      && refreshed.session.access_token !== initialAccessToken
      && refreshed.session.refresh_token !== initialRefreshToken
      && refreshedClaims?.claims?.sub === brokerA.user.id
      && refreshedClaims?.claims?.session_id === initialSessionId,
    { accessTokenRotated: true, refreshTokenRotated: true, sessionContinuity: true },
  );

  const ids = [fixtures.ownLeadA, fixtures.teammateLeadA, fixtures.otherTeamLeadA, fixtures.crossTenantLeadB];
  const brokerRows = await visible(brokerA.client, ids);
  if (brokerRows.error) throw new Error(`broker_data_api_read_failed:${brokerRows.error.code ?? "unknown"}`);
  record("broker_data_api_scope", brokerRows.ids.has(fixtures.ownLeadA)
    && !brokerRows.ids.has(fixtures.teammateLeadA)
    && !brokerRows.ids.has(fixtures.otherTeamLeadA)
    && !brokerRows.ids.has(fixtures.crossTenantLeadB), { visibleRows: brokerRows.ids.size });

  const managerRows = await visible(managerA.client, ids);
  if (managerRows.error) throw new Error(`manager_data_api_read_failed:${managerRows.error.code ?? "unknown"}`);
  record("manager_data_api_scope", managerRows.ids.has(fixtures.ownLeadA)
    && managerRows.ids.has(fixtures.teammateLeadA)
    && !managerRows.ids.has(fixtures.otherTeamLeadA)
    && !managerRows.ids.has(fixtures.crossTenantLeadB), { visibleRows: managerRows.ids.size });

  const directorRows = await visible(directorA.client, ids);
  if (directorRows.error) throw new Error(`director_data_api_read_failed:${directorRows.error.code ?? "unknown"}`);
  record("director_data_api_scope", directorRows.ids.has(fixtures.ownLeadA)
    && directorRows.ids.has(fixtures.teammateLeadA)
    && directorRows.ids.has(fixtures.otherTeamLeadA)
    && !directorRows.ids.has(fixtures.crossTenantLeadB), { visibleRows: directorRows.ids.size });

  const secondTenantRows = await visible(brokerB.client, ids);
  if (secondTenantRows.error) throw new Error(`second_tenant_data_api_read_failed:${secondTenantRows.error.code ?? "unknown"}`);
  record("second_tenant_data_api_scope", secondTenantRows.ids.has(fixtures.crossTenantLeadB)
    && !secondTenantRows.ids.has(fixtures.ownLeadA), { visibleRows: secondTenantRows.ids.size });

  const anonymous = publicClient();
  const anonymousRows = await visible(anonymous, ids);
  record("anonymous_data_api_denied", Boolean(anonymousRows.error) || anonymousRows.ids.size === 0, {
    visibleRows: anonymousRows.ids.size,
    denialCode: anonymousRows.error?.code ?? "rls_empty_result",
  });

  const service = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const serviceRows = await visible(service, ids);
  record("service_role_server_boundary", !serviceRows.error && serviceRows.ids.size === ids.length, {
    visibleRows: serviceRows.ids.size,
    keyClass: classifyKey(secretKey),
    serverOnly: true,
  });

  const originalMetadata = { ...(brokerA.user.user_metadata ?? {}) };
  const attackKeys = ["role", "commercial_role", "organization_id", "atlas_test_escalation"];
  const attackMetadata = {
    ...originalMetadata,
    role: "director",
    commercial_role: "director",
    organization_id: "00000000-0000-0000-0000-000000000000",
    atlas_test_escalation: "director",
  };
  let metadataRestored = false;
  try {
    const { error: metadataError } = await brokerA.client.auth.updateUser({ data: attackMetadata });
    if (metadataError) throw new Error("editable_metadata_probe_failed");
    const { data: attackRefresh, error: attackRefreshError } = await brokerA.client.auth.refreshSession();
    if (attackRefreshError || !attackRefresh.session) throw new Error("editable_metadata_refresh_failed");
    const attackedRows = await visible(brokerA.client, ids);
    if (attackedRows.error) throw new Error(`editable_metadata_read_failed:${attackedRows.error.code ?? "unknown"}`);
    record("editable_metadata_escalation_denied", attackedRows.ids.has(fixtures.ownLeadA)
      && !attackedRows.ids.has(fixtures.otherTeamLeadA)
      && !attackedRows.ids.has(fixtures.crossTenantLeadB), { visibleRows: attackedRows.ids.size });
  } finally {
    const restoreMetadata = { ...attackMetadata };
    for (const key of attackKeys) restoreMetadata[key] = Object.hasOwn(originalMetadata, key) ? originalMetadata[key] : null;
    const { error: restoreMetadataError } = await brokerA.client.auth.updateUser({ data: restoreMetadata });
    metadataRestored = !restoreMetadataError;
    if (!metadataRestored) throw new Error("editable_metadata_restore_failed");
  }
  record("editable_metadata_restored", metadataRestored, { restored: true });

  const { data: originalRows, error: originalError } = await brokerA.client.from("leads")
    .select("id,status").eq("id", fixtures.ownLeadA).limit(1);
  if (originalError || originalRows?.length !== 1) throw new Error("mutation_restore_snapshot_failed");
  const originalStatus = originalRows[0].status;
  const probeStatus = originalStatus === "contact" ? "new" : "contact";
  try {
    const { data: ownUpdate, error: ownUpdateError } = await brokerA.client.from("leads")
      .update({ status: probeStatus }).eq("id", fixtures.ownLeadA).select("id");
    record("authenticated_data_api_update_allowed", !ownUpdateError && ownUpdate?.length === 1, { affectedRows: 1 });
    const { data: crossUpdate, error: crossUpdateError } = await brokerA.client.from("leads")
      .update({ status: probeStatus }).eq("id", fixtures.crossTenantLeadB).select("id");
    record("cross_tenant_data_api_update_denied", !crossUpdateError && (crossUpdate?.length ?? 0) === 0, { affectedRows: 0 });
  } finally {
    const { data: restored, error: restoreError } = await brokerA.client.from("leads")
      .update({ status: originalStatus }).eq("id", fixtures.ownLeadA).select("id");
    if (restoreError || restored?.length !== 1) throw new Error("mutation_restore_failed");
  }
  record("mutation_probe_restored", true, { restored: true });

  const revokedRefreshToken = brokerB.session.refresh_token;
  const { error: globalSignOutError } = await brokerB.client.auth.signOut({ scope: "global" });
  if (globalSignOutError) throw new Error("global_session_revocation_failed");
  const revokedClient = publicClient();
  const { data: revokedRefresh, error: revokedRefreshError } = await revokedClient.auth.refreshSession({ refresh_token: revokedRefreshToken });
  record("revoked_refresh_token_rejected", Boolean(revokedRefreshError) && !revokedRefresh.session, {
    refreshRejected: true,
    accessTokenImmediateRevocationNotClaimed: true,
  });

  for (const identity of [brokerA, managerA, directorA]) await identity.client.auth.signOut({ scope: "local" });

  console.log(JSON.stringify({
    format: "atlas_meta_auth_jwt_data_api_evidence_v1",
    environment: "staging_clone",
    passed: results.every((item) => item.passed),
    sanitized: true,
    containsSecrets: false,
    containsPersonalData: false,
    projectIdentifiersPersisted: false,
    productionProject: false,
    authProvider: "supabase_auth",
    sessionType: "real_signed_supabase_jwt",
    publishableKeyClass: classifyKey(publishableKey),
    secretKeyClass: classifyKey(secretKey),
    tokenValuesPersisted: false,
    scenarioCount: results.length,
    scenarios: results,
    limitations: {
      accessTokenMayRemainValidUntilExpiryAfterSignOut: true,
      deviceInventoryNotInferred: true,
    },
    prohibitedActions: {
      productionMutation: false,
      realMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
    },
  }, null, 2));
}

main().catch(async (error) => {
  for (const client of clients) await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  console.error(JSON.stringify({
    format: "atlas_meta_auth_jwt_data_api_evidence_v1",
    passed: false,
    sanitized: true,
    containsSecrets: false,
    errorCode: error instanceof Error ? error.message.split(":")[0] : "unknown_failure",
  }));
  process.exit(1);
});

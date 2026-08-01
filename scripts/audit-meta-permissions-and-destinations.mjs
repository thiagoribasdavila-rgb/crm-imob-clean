import { createClient } from "@supabase/supabase-js";

const GRAPH_HOST = "https://graph.facebook.com";
const REQUIRED_PERMISSIONS = {
  ads: ["ads_read"],
  leadRuntime: ["leads_retrieval", "pages_show_list", "pages_read_engagement"],
  leadSetup: ["pages_manage_metadata"],
  conditional: ["ads_management", "business_management"],
};
const DESTINATIONS = [
  "meta_lead_sources",
  "meta_lead_events",
  "meta_conversion_configs",
  "meta_conversion_events",
  "lead_attribution_touches",
  "integration_outbox",
  "meta_andromeda_learning_cycles",
];

const present = (key) => Object.prototype.hasOwnProperty.call(process.env, key)
  ? process.env[key]?.trim() ? "configured" : "empty"
  : "absent";
const safeError = (error) => ({
  category: error?.name || "AuditError",
  code: typeof error?.code === "number" || typeof error?.code === "string" ? String(error.code) : "unavailable",
  httpStatus: typeof error?.httpStatus === "number" ? error.httpStatus : null,
});
const permissionState = (permissions, names, verified) => Object.fromEntries(names.map((name) => [
  name,
  verified ? permissions.get(name) || "not_granted" : "not_verified",
]));

async function graphGet(path, token, params = {}) {
  const apiVersion = process.env.META_GRAPH_API_VERSION || "v23.0";
  const query = new URLSearchParams(params);
  const response = await fetch(`${GRAPH_HOST}/${apiVersion}/${path}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Meta Graph read-only request failed");
    error.code = body?.error?.code || "META_GRAPH_ERROR";
    error.httpStatus = response.status;
    throw error;
  }
  return body;
}

async function readPermissions(token) {
  if (!token) return { status: "not_verified", reason: "token_unavailable", permissions: new Map() };
  try {
    const result = await graphGet("me/permissions", token, { limit: "500" });
    const permissions = new Map((result.data || []).map((item) => [item.permission, item.status]));
    return { status: "verified_read_only", permissions };
  } catch (error) {
    return { status: "failed_read_only", error: safeError(error), permissions: new Map() };
  }
}

async function probeTable(supabase, table) {
  const result = await supabase.from(table).select("id", { count: "exact" }).limit(1);
  return result.error
    ? { status: "blocked", code: result.error.code || "SUPABASE_ERROR" }
    : { status: "destination_ready", count: result.count || 0 };
}

async function auditDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return {
      status: "not_verified",
      reason: "supabase_credentials_unavailable",
      destinations: Object.fromEntries(DESTINATIONS.map((name) => [name, { status: "not_verified" }])),
      sourceMappings: [],
      conversionDatasets: [],
      evidence: {},
    };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const destinationEntries = await Promise.all(DESTINATIONS.map(async (table) => [table, await probeTable(supabase, table)]));
  const attributionContract = await supabase
    .from("leads")
    .select("metadata,first_attribution_id,last_attribution_id", { count: "exact" })
    .limit(1);
  const sources = await supabase
    .from("meta_lead_sources")
    .select("page_id,form_id")
    .eq("active", true);
  const configs = await supabase
    .from("meta_conversion_configs")
    .select("dataset_id")
    .eq("enabled", true);
  const [importedLeads, deliveredConversions, metaAttribution, learningCycles] = await Promise.all([
    supabase.from("meta_lead_events").select("id", { count: "exact" }).eq("status", "imported").limit(1),
    supabase.from("meta_conversion_events").select("id", { count: "exact" }).eq("status", "delivered").limit(1),
    supabase.from("lead_attribution_touches").select("id", { count: "exact" }).eq("channel", "meta").limit(1),
    supabase.from("meta_andromeda_learning_cycles").select("id", { count: "exact" }).limit(1),
  ]);

  const destinations = Object.fromEntries(destinationEntries);
  destinations.leads_attribution_contract = attributionContract.error
    ? { status: "blocked", code: attributionContract.error.code || "SUPABASE_ERROR" }
    : { status: "destination_ready", count: attributionContract.count || 0 };

  return {
    status: Object.values(destinations).every((item) => item.status === "destination_ready")
      ? "destination_ready"
      : "partially_ready",
    destinations,
    sourceMappings: sources.error ? [] : (sources.data || []),
    sourceMappingStatus: sources.error ? { status: "blocked", code: sources.error.code || "SUPABASE_ERROR" } : { status: "destination_ready" },
    conversionDatasets: configs.error ? [] : (configs.data || []).map((item) => item.dataset_id).filter(Boolean),
    conversionConfigStatus: configs.error ? { status: "blocked", code: configs.error.code || "SUPABASE_ERROR" } : { status: "destination_ready" },
    evidence: {
      importedRealLeads: importedLeads.error ? { status: "not_verified", code: importedLeads.error.code || "SUPABASE_ERROR" } : { status: "verified_read_only", count: importedLeads.count || 0 },
      deliveredConversions: deliveredConversions.error ? { status: "not_verified", code: deliveredConversions.error.code || "SUPABASE_ERROR" } : { status: "verified_read_only", count: deliveredConversions.count || 0 },
      metaAttributionTouches: metaAttribution.error ? { status: "not_verified", code: metaAttribution.error.code || "SUPABASE_ERROR" } : { status: "verified_read_only", count: metaAttribution.count || 0 },
      learningCycles: learningCycles.error ? { status: "not_verified", code: learningCycles.error.code || "SUPABASE_ERROR" } : { status: "verified_read_only", count: learningCycles.count || 0 },
    },
  };
}

async function auditAdAccount(token) {
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  if (!token || !accountId) return { status: "not_verified", reason: "ads_credentials_unavailable" };
  try {
    const [account, campaigns, datasets] = await Promise.all([
      graphGet(`act_${accountId}`, token, { fields: "account_status" }),
      graphGet(`act_${accountId}/campaigns`, token, { fields: "id", limit: "500" }),
      graphGet(`act_${accountId}/adspixels`, token, { fields: "id", limit: "100" }).catch((error) => ({ auditError: safeError(error), data: [] })),
    ]);
    return {
      status: "asset_accessible",
      accountAccessible: Boolean(account),
      accountStatusCode: account?.account_status ?? null,
      campaignCount: campaigns.data?.length || 0,
      pixelOrDatasetDiscovery: datasets.auditError
        ? { status: "not_verified", error: datasets.auditError }
        : { status: "asset_accessible", count: datasets.data?.length || 0 },
    };
  } catch (error) {
    return { status: "blocked", error: safeError(error) };
  }
}

async function auditLeadAssets(token, sourceMappings) {
  if (!token) return { status: "not_verified", reason: "lead_token_unavailable", configuredPages: 0, configuredForms: 0 };
  const byPage = new Map();
  for (const source of sourceMappings) {
    if (!source?.page_id) continue;
    const forms = byPage.get(source.page_id) || new Set();
    if (source.form_id) forms.add(source.form_id);
    byPage.set(source.page_id, forms);
  }
  if (!byPage.size) return { status: "blocked", reason: "no_active_source_mapping", configuredPages: 0, configuredForms: 0 };

  let pagesAccessible = 0;
  let formsVisible = 0;
  let configuredForms = 0;
  const errors = [];
  for (const [pageId, expectedForms] of byPage.entries()) {
    configuredForms += expectedForms.size;
    try {
      await graphGet(pageId, token, { fields: "id" });
      pagesAccessible += 1;
      const result = await graphGet(`${pageId}/leadgen_forms`, token, { fields: "id,status", limit: "500" });
      const visible = new Set((result.data || []).map((form) => String(form.id)));
      formsVisible += [...expectedForms].filter((formId) => visible.has(String(formId))).length;
    } catch (error) {
      errors.push(safeError(error));
    }
  }
  return {
    status: pagesAccessible === byPage.size && formsVisible === configuredForms ? "asset_accessible" : "blocked",
    configuredPages: byPage.size,
    pagesAccessible,
    configuredForms,
    formsVisible,
    errors,
  };
}

async function auditConversionDatasets(token, datasetIds) {
  if (!token) return { status: "not_verified", reason: "conversion_token_unavailable", configured: datasetIds.length };
  if (!datasetIds.length) return { status: "blocked", reason: "no_enabled_dataset_mapping", configured: 0 };
  let accessible = 0;
  const errors = [];
  for (const datasetId of new Set(datasetIds)) {
    try {
      await graphGet(datasetId, token, { fields: "id" });
      accessible += 1;
    } catch (error) {
      errors.push(safeError(error));
    }
  }
  const configured = new Set(datasetIds).size;
  return {
    status: accessible === configured ? "asset_accessible" : "blocked",
    configured,
    accessible,
    errors,
  };
}

const credentialState = Object.fromEntries([
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_LEAD_ACCESS_TOKEN",
  "META_ADS_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_CONVERSIONS_ACCESS_TOKEN",
  "META_GRAPH_API_VERSION",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
].map((key) => [key, present(key)]));

const database = await auditDatabase().catch((error) => ({
  status: "failed_read_only",
  error: safeError(error),
  destinations: {},
  sourceMappings: [],
    conversionDatasets: [],
    evidence: {},
}));
const adsToken = process.env.META_ADS_ACCESS_TOKEN;
const leadToken = process.env.META_LEAD_ACCESS_TOKEN;
const conversionToken = process.env.META_CONVERSIONS_ACCESS_TOKEN;
const [adsPermissionsRaw, leadPermissionsRaw, adAccount, leadAssets, conversionDatasets] = await Promise.all([
  readPermissions(adsToken),
  readPermissions(leadToken),
  auditAdAccount(adsToken),
  auditLeadAssets(leadToken, database.sourceMappings || []),
  auditConversionDatasets(conversionToken, database.conversionDatasets || []),
]);

const adsPermissions = {
  status: adsPermissionsRaw.status,
  error: adsPermissionsRaw.error,
  required: permissionState(adsPermissionsRaw.permissions, REQUIRED_PERMISSIONS.ads, adsPermissionsRaw.status === "verified_read_only"),
  conditional: permissionState(adsPermissionsRaw.permissions, ["ads_management", "business_management"], adsPermissionsRaw.status === "verified_read_only"),
};
const leadPermissions = {
  status: leadPermissionsRaw.status,
  error: leadPermissionsRaw.error,
  runtime: permissionState(leadPermissionsRaw.permissions, REQUIRED_PERMISSIONS.leadRuntime, leadPermissionsRaw.status === "verified_read_only"),
  setup: permissionState(leadPermissionsRaw.permissions, REQUIRED_PERMISSIONS.leadSetup, leadPermissionsRaw.status === "verified_read_only"),
  conditional: permissionState(leadPermissionsRaw.permissions, REQUIRED_PERMISSIONS.conditional, leadPermissionsRaw.status === "verified_read_only"),
};
const allGranted = (record) => Object.values(record).every((value) => value === "granted");
const destinationReady = (name) => database.destinations?.[name]?.status === "destination_ready";
const hasEvidence = (name) => (database.evidence?.[name]?.count || 0) > 0;
const blockers = [];
if (adsPermissionsRaw.error?.code === "190" || leadPermissionsRaw.error?.code === "190") blockers.push("token_expired_or_invalid");
if (!allGranted(adsPermissions.required)) blockers.push("ads_read_not_proven");
if (!allGranted(leadPermissions.runtime)) blockers.push("lead_runtime_permissions_not_proven");
if (!allGranted(leadPermissions.setup)) blockers.push("webhook_setup_permission_not_proven");
if (adAccount.status !== "asset_accessible") blockers.push("ad_account_not_accessible");
if (leadAssets.status !== "asset_accessible") blockers.push("page_or_form_ownership_not_proven");
if (conversionDatasets.status !== "asset_accessible") blockers.push("conversion_dataset_not_accessible");
if (!Object.values(database.destinations || {}).every((item) => item.status === "destination_ready")) blockers.push("runtime_schema_not_ready");
if (!hasEvidence("importedRealLeads")) blockers.push("real_lead_proof_unavailable");
if (!hasEvidence("deliveredConversions")) blockers.push("capi_test_proof_unavailable");

console.log(JSON.stringify({
  audit: "Atlas Meta Permissions And Destinations",
  phase: 2,
  mode: "read_only",
  generatedAt: new Date().toISOString(),
  credentialState,
  permissions: { ads: adsPermissions, leadAds: leadPermissions },
  ownership: { adAccount, leadAssets, conversionDatasets },
  database: {
    status: database.status,
    destinations: database.destinations,
    sourceMappingStatus: database.sourceMappingStatus,
    conversionConfigStatus: database.conversionConfigStatus,
    evidence: database.evidence,
  },
  readiness: {
    adsRead: allGranted(adsPermissions.required) && adAccount.status === "asset_accessible",
    leadIngestion: allGranted(leadPermissions.runtime) && leadAssets.status === "asset_accessible" && hasEvidence("importedRealLeads"),
    conversionDelivery: conversionDatasets.status === "asset_accessible" && hasEvidence("deliveredConversions") && destinationReady("integration_outbox"),
    learningEvidence: hasEvidence("metaAttributionTouches") && hasEvidence("learningCycles"),
  },
  blockers: [...new Set(blockers)],
  note: "Configured is not operational proof. No campaign, audience, budget, subscription or database mutation was performed.",
  privacy: { secretsPrinted: false, identifiersPrinted: false, personalDataPrinted: false },
}, null, 2));

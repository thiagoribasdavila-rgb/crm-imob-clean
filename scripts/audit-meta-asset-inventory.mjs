import { createClient } from "@supabase/supabase-js";

const GRAPH_HOST = "https://graph.facebook.com";
const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
const statusCount = (rows, key = "status") => rows.reduce((result, row) => {
  const value = String(row?.[key] || "unknown");
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});
const present = (key) => Object.prototype.hasOwnProperty.call(process.env, key)
  ? process.env[key]?.trim() ? "configured" : "empty"
  : "absent";
const safeError = (error) => ({
  category: error?.name || "AuditError",
  code: typeof error?.code === "number" || typeof error?.code === "string" ? String(error.code) : "unavailable",
  httpStatus: typeof error?.httpStatus === "number" ? error.httpStatus : null,
});

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

async function auditDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { status: "not_verified", reason: "supabase_credentials_unavailable" };
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [sourceResult, leadEventResult, configResult, conversionResult, leadResult, attributionResult] = await Promise.all([
    supabase.from("meta_lead_sources").select("page_id,form_id,active,conversion_sharing_enabled,consent_basis"),
    supabase.from("meta_lead_events").select("status,received_at,processed_at").gte("received_at", since).limit(20_000),
    supabase.from("meta_conversion_configs").select("mode,enabled,test_event_code,consent_required"),
    supabase.from("meta_conversion_events").select("status,event_name,created_at,delivered_at").gte("created_at", since).limit(30_000),
    supabase.from("leads").select("id,email,phone,metadata,first_attribution_id,last_attribution_id").eq("source", "Meta Lead Ads").gte("created_at", since).limit(20_000),
    supabase.from("lead_attribution_touches").select("id", { count: "exact", head: true }).eq("channel", "meta").gte("occurred_at", since),
  ]);
  const surfaces = [
    ["meta_lead_sources", sourceResult],
    ["meta_lead_events", leadEventResult],
    ["meta_conversion_configs", configResult],
    ["meta_conversion_events", conversionResult],
    ["leads_attribution_contract", leadResult],
    ["lead_attribution_touches", attributionResult],
  ];
  const errors = surfaces
    .filter(([, result]) => result.error)
    .map(([surface, result]) => ({ surface, code: result.error.code || "SUPABASE_ERROR" }));
  if (errors.length) return { status: "partially_verified", errors };

  const sources = sourceResult.data || [];
  const leadEvents = leadEventResult.data || [];
  const configs = configResult.data || [];
  const conversionEvents = conversionResult.data || [];
  const leads = leadResult.data || [];
  const eligible = leads.filter((lead) => {
    const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata : {};
    const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta : {};
    return meta.dataSharingConsent === true && Boolean(lead.email || lead.phone);
  });
  const latestLeadEventAt = leadEvents.map((event) => Date.parse(event.received_at)).filter(Number.isFinite).sort((a, b) => b - a)[0] || null;
  const latestConversionAt = conversionEvents.filter((event) => event.status === "delivered").map((event) => Date.parse(event.delivered_at || event.created_at)).filter(Number.isFinite).sort((a, b) => b - a)[0] || null;
  const deepEvents = new Set(["QualifiedLead", "Contact", "Schedule", "SubmitApplication", "ConvertedLead"]);

  return {
    status: "verified_read_only",
    windowDays: 30,
    leadSources: {
      total: sources.length,
      active: sources.filter((source) => source.active).length,
      pages: new Set(sources.map((source) => source.page_id).filter(Boolean)).size,
      forms: new Set(sources.map((source) => source.form_id).filter(Boolean)).size,
      conversionSharingEnabled: sources.filter((source) => source.conversion_sharing_enabled && source.consent_basis).length,
    },
    leadEvents: {
      total: leadEvents.length,
      byStatus: statusCount(leadEvents),
      freshnessHours: latestLeadEventAt ? Math.round((Date.now() - latestLeadEventAt) / 3_600_000) : null,
    },
    conversions: {
      configs: configs.length,
      testModeEnabled: configs.filter((config) => config.enabled && config.mode === "test" && config.test_event_code).length,
      consentRequired: configs.filter((config) => config.consent_required).length,
      events: conversionEvents.length,
      byStatus: statusCount(conversionEvents),
      byEventName: statusCount(conversionEvents, "event_name"),
      deepEvents: conversionEvents.filter((event) => deepEvents.has(event.event_name)).length,
      freshnessHours: latestConversionAt ? Math.round((Date.now() - latestConversionAt) / 3_600_000) : null,
    },
    matching: {
      metaLeads: leads.length,
      consentedEligible: eligible.length,
      dualIdentifiers: eligible.filter((lead) => lead.email && lead.phone).length,
      attributedLeads: leads.filter((lead) => lead.first_attribution_id && lead.last_attribution_id).length,
      attributionTouches: attributionResult.count || 0,
    },
  };
}

async function auditGraph(database) {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const accountId = (process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
  if (!token || !accountId) return { status: "not_verified", reason: "ads_credentials_unavailable" };
  try {
    const [account, campaigns, permissions, pixels] = await Promise.all([
      graphGet(`act_${accountId}`, token, { fields: "account_status,currency,timezone_name" }),
      graphGet(`act_${accountId}/campaigns`, token, { fields: "status,effective_status,objective", limit: "500" }),
      graphGet("me/permissions", token, { limit: "500" }),
      graphGet(`act_${accountId}/adspixels`, token, { fields: "last_fired_time", limit: "100" }).catch((error) => ({ auditError: safeError(error), data: [] })),
    ]);
    const pageIds = database?.leadSources?.pages || 0;
    return {
      status: "verified_read_only",
      account: { accessible: true, statusCode: account.account_status ?? null, currency: account.currency || null, timezone: account.timezone_name || null },
      campaigns: {
        total: campaigns.data?.length || 0,
        byEffectiveStatus: statusCount(campaigns.data || [], "effective_status"),
        byObjective: statusCount(campaigns.data || [], "objective"),
      },
      permissions: statusCount(permissions.data || [], "status"),
      pixelsOrDatasets: pixels.auditError ? { status: "not_verified", error: pixels.auditError } : { status: "verified_read_only", count: pixels.data?.length || 0 },
      configuredLeadSourcePages: pageIds,
      note: "Names, identifiers and tokens are intentionally omitted.",
    };
  } catch (error) {
    return { status: "failed_read_only", error: safeError(error) };
  }
}

const credentialState = Object.fromEntries([
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_LEAD_ACCESS_TOKEN",
  "META_ADS_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_CONVERSIONS_ACCESS_TOKEN",
  "META_GRAPH_API_VERSION",
  "ATLAS_CRON_SECRET",
  "ATLAS_BASE_URL",
].map((key) => [key, present(key)]));

const database = await auditDatabase().catch((error) => ({ status: "failed_read_only", error: safeError(error) }));
const graph = await auditGraph(database);
const proof = {
  adsRead: graph.status === "verified_read_only",
  signedLeadWebhook: credentialState.META_APP_SECRET === "configured" && credentialState.META_WEBHOOK_VERIFY_TOKEN === "configured",
  realLeadImported: database?.leadEvents?.byStatus?.imported > 0,
  capiTestConfirmed: database?.conversions?.byStatus?.delivered > 0,
  deepCrmSignals: database?.conversions?.deepEvents > 0,
  attributionRecorded: database?.matching?.attributionTouches > 0,
};

console.log(JSON.stringify({
  audit: "Atlas Meta Asset Inventory",
  phase: 1,
  mode: "read_only",
  generatedAt: new Date().toISOString(),
  credentialState,
  database,
  graph,
  proof,
  classification: {
    ads: proof.adsRead ? "operational_read_only" : "configured_not_proven",
    leadAds: proof.signedLeadWebhook && proof.realLeadImported ? "operational" : "configured_not_proven",
    conversionsApi: proof.capiTestConfirmed ? "operational_in_test_mode" : "blocked_or_not_proven",
    learningLoop: proof.capiTestConfirmed && proof.deepCrmSignals && proof.attributionRecorded ? "learning" : "not_ready",
  },
  privacy: { secretsPrinted: false, identifiersPrinted: false, personalDataPrinted: false },
}, null, 2));

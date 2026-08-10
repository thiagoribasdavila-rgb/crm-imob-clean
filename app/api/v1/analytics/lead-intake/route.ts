import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { buildLeadIntakeAnalytics } from "@/lib/analytics/lead-intake";
import {
  LIVE_LEAD_SELECT,
  isMissingColumn,
  isMissingRelation,
  mapLegacyLead,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import {
  LIVE_PROFILE_SELECT,
  descendantsFromLiveProfiles,
  resolveLiveHierarchy,
} from "@/lib/compat/live-hierarchy";

export const dynamic = "force-dynamic";

const PROFILE_SELECT = "id,full_name,name,role,access_role,commercial_role,reports_to,active,organization_id,team";
const LEAD_SELECT = "id,created_at,assigned_to,organization_id,campaign_id,development_id,source,source_normalized,first_contacted_at,first_response_minutes,next_action_at,import_batch_id,metadata";
const text = (value: unknown) => typeof value === "string" ? value : "";
const uniqueValues = (values: Array<string | null | undefined>) => [...new Set(values.map((value) => text(value).trim()).filter(Boolean))];
const metadataText = (metadata: Record<string, unknown> | null, ...keys: string[]) => {
  for (const key of keys) {
    const value = text(metadata?.[key]).trim();
    if (value) return value;
  }
  return "";
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "analytics.lead-intake" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const actorId = identity.access.profile.id;
  const role = identity.access.profile.commercialRole || identity.access.profile.role;
  const requestedDays = Number(request.nextUrl.searchParams.get("days") || 14);
  const periodDays = Number.isFinite(requestedDays)
    ? Math.min(31, Math.max(7, Math.trunc(requestedDays)))
    : 14;
  const since = new Date(Date.now() - (periodDays + 1) * 86_400_000).toISOString();

  const [canonicalProfiles, canonicalLeads, eventResult] = await Promise.all([
    identity.supabase.from("profiles").select(PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).limit(2000),
    identity.supabase.from("leads").select(LEAD_SELECT).eq("organization_id", organizationId).gte("created_at", since).limit(50000),
    identity.supabase.from("lead_distribution_events").select("lead_id,assigned_to,created_at").eq("organization_id", organizationId).gte("created_at", since).order("created_at").limit(50000),
  ]);

  let profileRows = (canonicalProfiles.data ?? []) as unknown as CompatRow[];
  let profileError = canonicalProfiles.error;
  if (isMissingColumn(canonicalProfiles.error)) {
    const legacy = await identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).limit(2000);
    profileRows = (legacy.data ?? []) as unknown as CompatRow[];
    profileError = legacy.error;
  }

  let leadRows = (canonicalLeads.data ?? []) as unknown as CompatRow[];
  let leadError = canonicalLeads.error;
  if (isMissingColumn(canonicalLeads.error)) {
    const legacy = await identity.supabase.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).gte("created_at", since).limit(50000);
    leadRows = (legacy.data ?? []) as unknown as CompatRow[];
    leadError = legacy.error;
  }
  if (profileError || leadError) {
    return apiError("LEAD_INTAKE_UNAVAILABLE", "Não foi possível consolidar a entrada diária de leads.", identity.meta, { status: 503 });
  }

  const profiles = resolveLiveHierarchy(profileRows);
  const descendants = descendantsFromLiveProfiles(profiles, actorId);
  const brokers = profiles.filter((profile) => {
    if (profile.commercial_role !== "broker") return false;
    if (role === "director" || role === "admin") return true;
    if (role === "broker") return text(profile.id) === actorId;
    return descendants.has(text(profile.id));
  });
  const brokerIds = new Set(brokers.map((broker) => text(broker.id)));
  const scopedLeads = leadRows
    .map(mapLegacyLead)
    .filter((lead) => role === "director" || role === "admin" || brokerIds.has(text(lead.assigned_to)));

  const warnings: string[] = [];
  const campaignIds = uniqueValues(scopedLeads.map((lead) => text(lead.campaign_id)));
  let campaignRows: CompatRow[] = [];
  if (campaignIds.length) {
    const canonicalCampaigns = await identity.supabase
      .from("campaigns")
      .select("id,name,development_id,developer_id")
      .eq("organization_id", organizationId)
      .in("id", campaignIds);
    campaignRows = (canonicalCampaigns.data ?? []) as unknown as CompatRow[];
    let campaignError = canonicalCampaigns.error;
    if (isMissingColumn(campaignError)) {
      const compatibleCampaigns = await identity.supabase
        .from("campaigns")
        .select("id,name,development_id")
        .eq("organization_id", organizationId)
        .in("id", campaignIds);
      campaignRows = (compatibleCampaigns.data ?? []) as unknown as CompatRow[];
      campaignError = compatibleCampaigns.error;
    }
    if (campaignError) warnings.push("Algumas campanhas ainda não puderam ser identificadas no recorte.");
  }
  const campaignMap = new Map(campaignRows.map((campaign) => [text(campaign.id), campaign]));
  const developmentIds = uniqueValues([
    ...scopedLeads.map((lead) => text(lead.development_id)),
    ...campaignRows.map((campaign) => text(campaign.development_id)),
  ]);
  let developmentRows: CompatRow[] = [];
  if (developmentIds.length) {
    const canonicalDevelopments = await identity.supabase
      .from("developments")
      .select("id,name,developer_id,developer_name")
      .eq("organization_id", organizationId)
      .in("id", developmentIds);
    developmentRows = (canonicalDevelopments.data ?? []) as unknown as CompatRow[];
    let developmentError = canonicalDevelopments.error;
    if (isMissingColumn(developmentError)) {
      const compatibleDevelopments = await identity.supabase
        .from("developments")
        .select("id,name,developer_name")
        .eq("organization_id", organizationId)
        .in("id", developmentIds);
      developmentRows = (compatibleDevelopments.data ?? []) as unknown as CompatRow[];
      developmentError = compatibleDevelopments.error;
    }
    if (isMissingRelation(developmentError)) {
      const legacyDevelopments = await identity.supabase
        .from("crm_projects")
        .select("id,name,developer_name")
        .eq("organization_id", organizationId)
        .in("id", developmentIds);
      developmentRows = (legacyDevelopments.data ?? []) as unknown as CompatRow[];
      developmentError = legacyDevelopments.error;
    }
    if (developmentError) warnings.push("Alguns projetos ainda não puderam ser identificados no recorte.");
  }
  const developmentMap = new Map(developmentRows.map((development) => [text(development.id), development]));
  const developerIds = uniqueValues([
    ...campaignRows.map((campaign) => text(campaign.developer_id)),
    ...developmentRows.map((development) => text(development.developer_id)),
  ]);
  let developerRows: CompatRow[] = [];
  if (developerIds.length) {
    const developers = await identity.supabase
      .from("developers")
      .select("id,trade_name,legal_name")
      .eq("organization_id", organizationId)
      .in("id", developerIds);
    developerRows = (developers.data ?? []) as unknown as CompatRow[];
    if (developers.error) warnings.push("Algumas incorporadoras ainda não puderam ser identificadas no recorte.");
  }
  const developerMap = new Map(developerRows.map((developer) => [text(developer.id), developer]));

  const leads = scopedLeads
    .map((lead) => ({
      lead,
      metadata: lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : null,
      campaign: campaignMap.get(text(lead.campaign_id)),
    }))
    .map(({ lead, metadata, campaign }) => {
      const developmentId = text(lead.development_id) || text(campaign?.development_id);
      const development = developmentMap.get(developmentId);
      const developerId = text(development?.developer_id) || text(campaign?.developer_id);
      const developer = developerMap.get(developerId);
      return {
        id: text(lead.id),
        created_at: text(lead.created_at),
        assigned_to: text(lead.assigned_to) || null,
        campaign_id: text(lead.campaign_id) || null,
        campaign_name: text(campaign?.name)
          || text(lead.campaign)
          || metadataText(metadata, "campaign_name", "campaignName")
          || null,
        development_id: developmentId || null,
        development_name: text(development?.name)
          || text(lead.project_name)
          || metadataText(metadata, "project_name", "projectName", "development_name")
          || null,
        developer_id: developerId || null,
        developer_name: text(developer?.trade_name)
          || text(developer?.legal_name)
          || text(development?.developer_name)
          || metadataText(metadata, "developer_name", "developerName")
          || null,
        source: text(lead.source) || null,
        source_normalized: text(lead.source_normalized) || null,
        first_contacted_at: text(lead.first_contacted_at) || null,
        first_response_minutes: Number.isFinite(Number(lead.first_response_minutes)) ? Number(lead.first_response_minutes) : null,
        next_action_at: text(lead.next_action_at) || null,
        import_batch_id: text(lead.import_batch_id) || null,
        metadata,
      };
    })
    .filter((lead) => lead.id && lead.created_at);
  const ledgerAvailable = !eventResult.error;
  if (eventResult.error && !isMissingRelation(eventResult.error)) {
    return apiError("LEAD_DISTRIBUTION_LEDGER_UNAVAILABLE", "Não foi possível ler o histórico seguro de distribuição.", identity.meta, { status: 503 });
  }
  const assignments = ((eventResult.data ?? []) as Array<Record<string, unknown>>)
    .map((event) => ({ lead_id: text(event.lead_id), assigned_to: text(event.assigned_to), created_at: text(event.created_at) }))
    .filter((event) => event.lead_id && event.created_at && brokerIds.has(event.assigned_to));

  const analytics = buildLeadIntakeAnalytics({
    leads,
    assignments,
    brokers: brokers.map((broker) => ({ id: text(broker.id), name: text(broker.full_name) || text(broker.name) || "Corretor" })),
    periodDays,
    ledgerAvailable,
    role,
  });

  return apiSuccess({
    scope: {
      organizationId,
      actorId,
      role,
      hierarchyApplied: true,
      personalDataReturned: false,
      periodDays,
      timeZone: "America/Sao_Paulo",
    },
    ...analytics,
    warnings,
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

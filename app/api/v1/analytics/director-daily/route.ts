import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_LEAD_SELECT, mapLegacyLead, mapLegacyProject, type CompatRow } from "@/lib/compat/legacy-v2";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro", "won", "lost", "closed"]);
const STAGE_PROBABILITY: Record<string, number> = { novo: 10, contato: 20, qualificacao: 35, visita: 55, proposta: 70, negociacao: 85, contrato: 95, ganho: 100, perdido: 0, comprou_outro: 0 };
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const time = (value: unknown) => { const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };
const text = (value: unknown) => typeof value === "string" ? value : "";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 45, windowMs: 60_000, scope: "director.daily-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { roles: ["admin", "director"] });
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) {
    return apiError("FORBIDDEN", "O painel executivo é exclusivo da diretoria.", identity.meta, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const [profileResult, leadResult, campaignResult, projectResult] = await Promise.all([
    admin.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).limit(2000),
    admin.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).limit(20000),
    admin.from("marketing_campaigns").select("id,name,platform,status,created_at").eq("organization_id", organizationId).limit(1000),
    admin.from("crm_projects").select("id,organization_id,name,developer_name,code,status,city,neighborhood,address,launch_date,delivery_date,created_at,updated_at").eq("organization_id", organizationId).limit(1000),
  ]);
  if (profileResult.error || leadResult.error || campaignResult.error || projectResult.error) {
    return apiError("DIRECTOR_DASHBOARD_FAILED", "Não foi possível consolidar a operação executiva agora.", identity.meta, { status: 503 });
  }

  const profiles = resolveLiveHierarchy((profileResult.data ?? []) as unknown as CompatRow[]);
  const leads = ((leadResult.data ?? []) as unknown as CompatRow[]).map(mapLegacyLead);
  const projects = ((projectResult.data ?? []) as unknown as CompatRow[]).map(mapLegacyProject);
  const campaigns = (campaignResult.data ?? []) as unknown as CompatRow[];
  const now = Date.now();
  const activeLeads = leads.filter((lead) => !TERMINAL.has(normalize(lead.status)));
  const wonLeads = leads.filter((lead) => normalize(lead.status) === "ganho");
  const firstContactOverdue = activeLeads.filter((lead) => normalize(lead.status) === "novo" && (time(lead.created_at) ?? now) < now - 15 * 60_000).length;
  const followUpOverdue = activeLeads.filter((lead) => (time(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
  const withoutNextAction = activeLeads.filter((lead) => !lead.next_action_at).length;
  const pipelineGross = activeLeads.reduce((sum, lead) => sum + money(lead.budget_max), 0);
  const forecastWeighted = activeLeads.reduce((sum, lead) => sum + money(lead.budget_max) * (STAGE_PROBABILITY[normalize(lead.status)] ?? 10) / 100, 0);
  const wonValue = wonLeads.reduce((sum, lead) => sum + money(lead.budget_max), 0);

  const campaignRanking = campaigns.map((campaign) => {
    const campaignLeads = leads.filter((lead) => text(lead.campaign_id) === text(campaign.id));
    const sales = campaignLeads.filter((lead) => normalize(lead.status) === "ganho").length;
    return { id: text(campaign.id), name: text(campaign.name) || "Campanha", channel: text(campaign.platform) || "Não informado", status: text(campaign.status) || "unknown", spend: 0, leads: campaignLeads.length, sales, revenue: 0, costPerLead: null, conversionRate: campaignLeads.length ? Math.round(sales / campaignLeads.length * 1000) / 10 : 0, sampleSufficient: campaignLeads.length >= 30 };
  }).sort((left, right) => Number(right.sampleSufficient) - Number(left.sampleSufficient) || right.sales - left.sales || right.leads - left.leads).slice(0, 8);

  const developerMap = new Map<string, { developerName: string; developments: number; leads: number; won: number }>();
  for (const project of projects) {
    const key = text(project.developer_name) || "Incorporadora não informada";
    const current = developerMap.get(key) || { developerName: key, developments: 0, leads: 0, won: 0 };
    const projectLeads = leads.filter((lead) => text(lead.development_id) === text(project.id));
    current.developments += 1;
    current.leads += projectLeads.length;
    current.won += projectLeads.filter((lead) => normalize(lead.status) === "ganho").length;
    developerMap.set(key, current);
  }
  const developers = [...developerMap.values()].sort((left, right) => right.won - left.won || right.leads - left.leads).slice(0, 8);

  const directSuperintendents = profiles.filter((profile) => profile.commercial_role === "superintendent" && text(profile.reports_to) === identity.access.profile.id);
  const executives = directSuperintendents.map((superintendent) => {
    const memberIds = descendantsFromLiveProfiles(profiles, text(superintendent.id));
    const managers = profiles.filter((profile) => profile.commercial_role === "manager" && memberIds.has(text(profile.id)));
    const brokers = profiles.filter((profile) => profile.commercial_role === "broker" && memberIds.has(text(profile.id)));
    const portfolio = leads.filter((lead) => memberIds.has(text(lead.assigned_to)));
    const won = portfolio.filter((lead) => normalize(lead.status) === "ganho").length;
    return { superintendentId: text(superintendent.id), superintendentName: text(superintendent.full_name) || "Superintendente", managers: managers.length, brokers: brokers.length, leads: portfolio.length, activeLeads: portfolio.filter((lead) => !TERMINAL.has(normalize(lead.status))).length, won, conversionRate: portfolio.length ? Math.round(won / portfolio.length * 1000) / 10 : 0, conversionSampleSufficient: portfolio.length >= 50 };
  }).sort((left, right) => right.won - left.won || right.activeLeads - left.activeLeads);
  const hierarchyGaps = profiles.filter((profile) => ["superintendent", "manager", "broker"].includes(text(profile.commercial_role)) && !profile.reports_to).length;

  const risks: Array<{ severity: "critical" | "attention"; area: string; reason: string; action: string }> = [];
  if (firstContactOverdue) risks.push({ severity: "critical", area: "Comercial", reason: `${firstContactOverdue} leads novas aguardam contato`, action: "Definir responsáveis e recuperar o SLA hoje" });
  if (followUpOverdue >= 5) risks.push({ severity: "attention", area: "Execução", reason: `${followUpOverdue} follow-ups vencidos`, action: "Revisar a fila de próximas ações" });
  if (hierarchyGaps) risks.push({ severity: "attention", area: "Governança", reason: `${hierarchyGaps} perfis sem liderança resolvida`, action: "Confirmar a hierarquia oficial da equipe" });
  if (campaigns.length && !campaignRanking.some((item) => item.sampleSufficient)) risks.push({ severity: "attention", area: "Campanhas", reason: "Nenhuma campanha atingiu amostra mínima", action: "Não escalar verba sem resultados suficientes" });

  return apiSuccess({
    scope: { role: "director", organizationWide: true, directSuperintendentsOnly: true },
    commercial: { leads: leads.length, activeLeads: activeLeads.length, hotLeads: activeLeads.filter((lead) => normalize(lead.temperature) === "quente" || money(lead.score) >= 70).length, unassigned: leads.filter((lead) => !lead.assigned_to).length, won: wonLeads.length, conversionRate: leads.length ? Math.round(wonLeads.length / leads.length * 1000) / 10 : 0, firstContactOverdue, followUpOverdue, withoutNextAction },
    financial: { pipelineGross, forecastWeighted, forecastMethod: "lead_budget_by_canonical_stage", wonValue, commissionReceivable: 0, commissionOverdue: 0 },
    marketing: { campaigns: campaigns.length, campaignsWithSample: campaignRanking.filter((item) => item.sampleSufficient).length, spend: 0, attributedRevenue: 0, roas: null, minimumLeadsForDecision: 30, ranking: campaignRanking },
    developers,
    hierarchy: { superintendents: executives, gaps: hierarchyGaps, comparisonMinimumLeads: 50 },
    ai: { calls30d: 0, tokens30d: 0, estimatedCostUsd30d: 0, averageLatencyMs30d: 0, measured: false },
    risks: risks.slice(0, 8),
    governance: { readOnly: true, humanApprovalRequired: true, noAutomaticBudgetChange: true, noAutomaticPeopleDecision: true },
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

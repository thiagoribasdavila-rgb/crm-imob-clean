import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Profile = { id: string; full_name: string | null; role: string; commercial_role: string | null; reports_to: string | null };
const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const roleOf = (profile: Profile) => profile.commercial_role || (profile.role === "admin" ? "director" : profile.role);
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const time = (value: unknown) => { const parsed = typeof value === "string" ? new Date(value).getTime() : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 45, windowMs: 60_000, scope: "director.daily-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { roles: ["admin", "director"] });
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "O painel executivo é exclusivo da diretoria.", identity.meta, { status: 403 });

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const [profileResult, leadResult, opportunityResult, campaignResult, developmentResult, aiResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,role,commercial_role,reports_to").eq("organization_id", organizationId).eq("active", true).limit(2000),
    admin.from("leads").select("id,assigned_to,status,score,temperature,next_action_at,first_contact_due_at,first_contacted_at,campaign_id,development_id,created_at").eq("organization_id", organizationId).limit(20000),
    admin.from("opportunities").select("id,stage,value,probability,won_at,commission_net,commission_received_amount,commission_due_at,commission_status,created_at").eq("organization_id", organizationId).limit(10000),
    admin.from("campaigns").select("id,name,status,channel,spend,leads_count,sales_count,revenue").eq("organization_id", organizationId).limit(1000),
    admin.from("developments").select("id,name,developer_name,status").eq("organization_id", organizationId).limit(1000),
    admin.from("ai_usage_events").select("estimated_cost_usd,total_tokens,latency_ms,created_at").eq("organization_id", organizationId).gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(10000),
  ]);
  const failed = [profileResult, leadResult, opportunityResult, campaignResult, developmentResult].find((result) => result.error);
  if (failed?.error) return apiError("DIRECTOR_DASHBOARD_FAILED", "Não foi possível consolidar a operação executiva.", identity.meta, { status: 500 });

  const profiles = (profileResult.data ?? []) as Profile[];
  const leads = leadResult.data ?? [];
  const opportunities = opportunityResult.data ?? [];
  const campaigns = campaignResult.data ?? [];
  const developments = developmentResult.data ?? [];
  const now = Date.now();
  const activeLeads = leads.filter((lead) => !TERMINAL.has(normalize(lead.status)));
  const wonLeads = leads.filter((lead) => normalize(lead.status) === "ganho").length;
  const firstContactOverdue = activeLeads.filter((lead) => !lead.first_contacted_at && (time(lead.first_contact_due_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
  const followUpOverdue = activeLeads.filter((lead) => (time(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
  const withoutNextAction = activeLeads.filter((lead) => !lead.next_action_at).length;
  const pipelineGross = opportunities.filter((item) => normalize(item.stage) !== "ganho" && normalize(item.stage) !== "perdido").reduce((sum, item) => sum + money(item.value), 0);
  const forecastWeighted = opportunities.filter((item) => normalize(item.stage) !== "ganho" && normalize(item.stage) !== "perdido").reduce((sum, item) => sum + money(item.value) * Math.min(100, Math.max(0, money(item.probability))) / 100, 0);
  const wonValue = opportunities.filter((item) => normalize(item.stage) === "ganho" || item.won_at).reduce((sum, item) => sum + money(item.value), 0);
  const commissionReceivable = opportunities.reduce((sum, item) => sum + Math.max(0, money(item.commission_net) - money(item.commission_received_amount)), 0);
  const commissionOverdue = opportunities.filter((item) => normalize(item.commission_status) === "overdue" || ((time(item.commission_due_at) ?? Number.MAX_SAFE_INTEGER) < now && money(item.commission_net) > money(item.commission_received_amount))).length;
  const campaignSpend = campaigns.reduce((sum, item) => sum + money(item.spend), 0);
  const campaignRevenue = campaigns.reduce((sum, item) => sum + money(item.revenue), 0);
  const campaignsWithSample = campaigns.filter((item) => money(item.leads_count) >= 30);
  const campaignRanking = campaigns.map((item) => ({ id: item.id, name: item.name || "Campanha", channel: item.channel || "Não informado", status: item.status || "unknown", spend: money(item.spend), leads: money(item.leads_count), sales: money(item.sales_count), revenue: money(item.revenue), costPerLead: money(item.leads_count) > 0 ? Math.round(money(item.spend) / money(item.leads_count) * 100) / 100 : null, conversionRate: money(item.leads_count) > 0 ? Math.round(money(item.sales_count) / money(item.leads_count) * 1000) / 10 : 0, sampleSufficient: money(item.leads_count) >= 30 })).sort((a, b) => Number(b.sampleSufficient) - Number(a.sampleSufficient) || b.sales - a.sales || b.leads - a.leads).slice(0, 8);
  const developerMap = new Map<string, { developerName: string; developments: number; leads: number; won: number }>();
  for (const development of developments) { const key = development.developer_name || "Incorporadora não informada"; const current = developerMap.get(key) || { developerName: key, developments: 0, leads: 0, won: 0 }; current.developments += 1; const projectLeads = leads.filter((lead) => lead.development_id === development.id); current.leads += projectLeads.length; current.won += projectLeads.filter((lead) => normalize(lead.status) === "ganho").length; developerMap.set(key, current); }
  const developers = [...developerMap.values()].sort((a, b) => b.won - a.won || b.leads - a.leads).slice(0, 8);

  const superintendents = profiles.filter((profile) => roleOf(profile) === "superintendent" && profile.reports_to === identity.access.profile.id);
  const executives = superintendents.map((superintendent) => {
    const managers = profiles.filter((profile) => roleOf(profile) === "manager" && profile.reports_to === superintendent.id);
    const managerIds = new Set(managers.map((manager) => manager.id));
    const brokers = profiles.filter((profile) => roleOf(profile) === "broker" && profile.reports_to && managerIds.has(profile.reports_to));
    const ownerIds = new Set([...managers.map((manager) => manager.id), ...brokers.map((broker) => broker.id)]);
    const portfolio = leads.filter((lead) => lead.assigned_to && ownerIds.has(lead.assigned_to));
    const won = portfolio.filter((lead) => normalize(lead.status) === "ganho").length;
    return { superintendentId: superintendent.id, superintendentName: superintendent.full_name || "Superintendente", managers: managers.length, brokers: brokers.length, leads: portfolio.length, activeLeads: portfolio.filter((lead) => !TERMINAL.has(normalize(lead.status))).length, won, conversionRate: portfolio.length ? Math.round(won / portfolio.length * 1000) / 10 : 0, conversionSampleSufficient: portfolio.length >= 50 };
  }).sort((a, b) => b.won - a.won || b.activeLeads - a.activeLeads);
  const hierarchyGaps = profiles.filter((profile) => ["superintendent", "manager", "broker"].includes(roleOf(profile)) && !profile.reports_to).length;
  const aiUsage = (aiResult.data ?? []).reduce((sum, item) => ({ calls: sum.calls + 1, tokens: sum.tokens + money(item.total_tokens), costUsd: sum.costUsd + money(item.estimated_cost_usd), latencyMs: sum.latencyMs + money(item.latency_ms) }), { calls: 0, tokens: 0, costUsd: 0, latencyMs: 0 });
  const risks = [
    firstContactOverdue ? { severity: "critical", area: "Comercial", reason: `${firstContactOverdue} leads sem primeiro contato no prazo`, action: "Cobrar plano de recuperação das lideranças" } : null,
    commissionOverdue ? { severity: "critical", area: "Financeiro", reason: `${commissionOverdue} comissões vencidas`, action: "Priorizar cobrança por incorporadora" } : null,
    followUpOverdue >= 5 ? { severity: "attention", area: "Execução", reason: `${followUpOverdue} follow-ups vencidos`, action: "Revisar capacidade e disciplina comercial" } : null,
    hierarchyGaps ? { severity: "attention", area: "Governança", reason: `${hierarchyGaps} perfis comerciais sem liderança definida`, action: "Corrigir a hierarquia antes de redistribuir leads" } : null,
    !campaignsWithSample.length && campaigns.length ? { severity: "attention", area: "Campanhas", reason: "Nenhuma campanha atingiu amostra mínima", action: "Aguardar base antes de escalar ou pausar" } : null,
  ].filter(Boolean).slice(0, 8);

  return apiSuccess({ scope: { role: "director", organizationWide: true, directSuperintendentsOnly: true }, commercial: { leads: leads.length, activeLeads: activeLeads.length, hotLeads: activeLeads.filter((lead) => normalize(lead.temperature) === "quente" || money(lead.score) >= 70).length, unassigned: leads.filter((lead) => !lead.assigned_to).length, won: wonLeads, conversionRate: leads.length ? Math.round(wonLeads / leads.length * 1000) / 10 : 0, firstContactOverdue, followUpOverdue, withoutNextAction }, financial: { pipelineGross, forecastWeighted, forecastMethod: "crm_probability_weighted", wonValue, commissionReceivable, commissionOverdue }, marketing: { campaigns: campaigns.length, campaignsWithSample: campaignsWithSample.length, spend: campaignSpend, attributedRevenue: campaignRevenue, roas: campaignSpend > 0 ? Math.round(campaignRevenue / campaignSpend * 100) / 100 : null, minimumLeadsForDecision: 30, ranking: campaignRanking }, developers, hierarchy: { superintendents: executives, gaps: hierarchyGaps, comparisonMinimumLeads: 50 }, ai: { calls30d: aiUsage.calls, tokens30d: aiUsage.tokens, estimatedCostUsd30d: Math.round(aiUsage.costUsd * 1_000_000) / 1_000_000, averageLatencyMs30d: aiUsage.calls ? Math.round(aiUsage.latencyMs / aiUsage.calls) : 0, measured: !aiResult.error }, risks, governance: { readOnly: true, humanApprovalRequired: true, noAutomaticBudgetChange: true, noAutomaticPeopleDecision: true }, generatedAt: new Date().toISOString() }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

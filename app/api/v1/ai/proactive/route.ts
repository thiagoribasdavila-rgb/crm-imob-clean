/**
 * Inteligência proativa por hierarquia — os "próximos passos" de cada papel,
 * compostos dos motores vivos: plano de eficiência (marketing-strategist),
 * saúde criativa + anomalias preditivas (Andromeda/forecast), aprovações
 * pendentes e sinais de time/carteira (best-effort do banco).
 *
 * É o que o command center consome ao trocar entre Diretor/Gestor/Corretor.
 * Papel vem do próprio perfil (o corretor só recebe o mundo dele); um papel
 * pode ser pedido via ?role= desde que ≤ o próprio nível (diretor pode ver
 * como um gestor veria, corretor não pode ver o do diretor).
 */

import { type NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/core";
import { cacheHeaders } from "@/lib/api/cache-headers";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { aggregate, budgetView, type ProductBudget } from "@/lib/marketing/cost-report";
import { marketingEfficiencyPlan } from "@/lib/ai/marketing-strategist";
import { fetchCampaignInsights, insightsToCostRows, fetchAdInsights } from "@/lib/meta/marketing/campaign-read";
import { analyzeCreativeHealth } from "@/lib/meta/marketing/andromeda-report";
import { anomalyForecast, type ForecastWeek } from "@/lib/meta/marketing/forecast";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { loadOrgCalibration } from "@/lib/ai/calibration-server";
import { proactiveNudges, nudgeDigest, type Role, type ProactiveInput } from "@/lib/ai/proactive-hierarchy";

export const dynamic = "force-dynamic";

const RANK: Record<string, number> = { director: 4, superintendent: 3, manager: 2, broker: 1 };
function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): Role {
  const r = access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
  return (["director", "superintendent", "manager", "broker"].includes(r) ? r : "broker") as Role;
}

// GET — nudges proativos do papel (ou de um papel ≤ o próprio, via ?role=).
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 40, scope: "ai-proactive" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const own = roleOf(identity.access);
  const asked = new URL(request.url).searchParams.get("role") as Role | null;
  const role: Role = asked && RANK[asked] && RANK[asked] <= RANK[own] ? asked : own;

  const org = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  // sinais de banco (best-effort — nada quebra sem tabela)
  const [cal, approvals] = await Promise.all([
    loadOrgCalibration(admin, org),
    admin.from("approval_requests").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "pending"),
  ]);
  const input: ProactiveInput = {};
  if (!approvals.error && typeof approvals.count === "number") input.pendingApprovals = approvals.count;

  // sinais de marketing/criativo/preditivo — só para papéis de liderança e
  // quando a Meta está configurada (o corretor não depende disso).
  if (role !== "broker") {
    const token = process.env.META_ADS_ACCESS_TOKEN;
    const account = process.env.META_AD_ACCOUNT_ID;
    if (token && account) {
      const [insights, adRows] = await Promise.all([
        cachedMetaRead(`campaign-insights:${account}:last_30d:7`, () => fetchCampaignInsights(account, token, { datePreset: "last_30d", timeIncrement: 7 })),
        cachedMetaRead(`ad-insights:${account}:last_30d`, () => fetchAdInsights(account, token, { datePreset: "last_30d" })),
      ]);
      if (Array.isArray(insights)) {
        const rows = insightsToCostRows(insights);
        const agg = aggregate(rows, "campaign");
        const bud = budgetView([] as ProductBudget[], rows);
        input.plan = { summary: marketingEfficiencyPlan(bud, agg, { salesKnown: false }).summary };
      }
      if (Array.isArray(adRows)) {
        input.creativeHealth = analyzeCreativeHealth(adRows, {
          freqLimit: cal.fatigue.freqLimit, ctrDropPct: cal.fatigue.ctrDropPct,
          cpmRisePct: cal.fatigue.cpmRisePct, diversityTarget: cal.diversity.targetAdsPerCampaign,
          maxActiveCampaignsSmall: cal.consolidation.maxActiveCampaignsSmall,
        }).map((h) => ({ campaignName: h.campaignName, andromedaScore: h.andromedaScore, fatigueCount: h.fatigue.length }));
        // anomalias preditivas → viram nudge do diretor
        const weekMap = new Map<string, { spend: number; leads: number }>();
        for (const r of adRows) { const c = weekMap.get(r.dateStart) ?? { spend: 0, leads: 0 }; c.spend += r.spend; c.leads += r.leads; weekMap.set(r.dateStart, c); }
        const weeks: ForecastWeek[] = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([weekStart, v]) => ({ weekStart, ...v }));
        input.forecast = { anomalies: anomalyForecast(weeks, { anomalyLeadDropPct: cal.forecast.anomalyLeadDropPct }) };
      }
    }
  }

  // sinais de time/carteira — best-effort (dependem de tabelas da Fase 0)
  if (role === "manager" || role === "superintendent") {
    const sla = await admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", org).eq("status", "novo").lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
    if (!sla.error && typeof sla.count === "number") input.teamSlaBreaches = sla.count;
  }
  if (role === "broker") {
    const brokerId = identity.access.profile.id;
    const [overdue, hot] = await Promise.all([
      admin.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", brokerId).not("status", "in", "(done,concluido,concluida,completed,cancelado,cancelled)").lt("due_at", new Date().toISOString()),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("assigned_to", brokerId).eq("temperature", "quente"),
    ]);
    if (!overdue.error && typeof overdue.count === "number") input.brokerOverdueTasks = overdue.count;
    if (!hot.error && typeof hot.count === "number") input.brokerHotLeads = hot.count;
  }

  const nudges = proactiveNudges(role, input);
  return apiSuccess({ role, nudges, digest: nudgeDigest(nudges) }, identity.meta, { headers: { ...limited.headers, ...cacheHeaders({ maxAge: 30, swr: 60 }) } });
}

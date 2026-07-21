/**
 * Briefing executivo do diretor — compõe, chamando as LIBS direto (nunca
 * fetch das próprias rotas): gasto de marketing (banco marketing_spend com
 * fallback Meta ao vivo, igual cost-report), plano de eficiência de verba,
 * saúde criativa pós-Andromeda e aprovações pendentes — com os limiares da
 * calibração central da organização.
 *
 * Best-effort por camada: cada fonte que falhar é omitida do briefing em vez
 * de derrubar a rota; sem NENHUMA fonte de gasto, 503 honesto. Read-only.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { aggregate, budgetView, type ProductBudget } from "@/lib/marketing/cost-report";
import { marketingEfficiencyPlan } from "@/lib/ai/marketing-strategist";
import { fetchCampaignInsights, insightsToCostRows, fetchAdInsights } from "@/lib/meta/marketing/campaign-read";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { analyzeCreativeHealth, type CreativeHealth } from "@/lib/meta/marketing/andromeda-report";
import { buildDirectorBriefing, type BriefingInput } from "@/lib/ai/director-briefing";
import { loadOrgCalibration } from "@/lib/ai/calibration-server";
import type { AiCalibration } from "@/lib/ai/calibration";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const isDirector = (role: string) => ["director", "superintendent"].includes(role);

// Cartões que o briefing espera — derivados do relatório Andromeda real.
function toHealthCards(health: CreativeHealth[]): BriefingInput["creativeHealth"] {
  return health.map((h) => ({
    campaignName: h.campaignName,
    andromedaScore: h.andromedaScore,
    fatigueCount: h.fatigue.length,
    activeAds: h.activeAds,
  }));
}

// GET — briefing executivo da manhã: gasto, verba, plano de eficiência, saúde
// criativa e pendências de aprovação. Diretor/superintendente APENAS.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 20, scope: "ai-director-briefing" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Briefing executivo é do diretor/superintendente.", identity.meta, { status: 403 });
  }
  const org = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  // tudo que é independente vai em paralelo (performance: eram 4 idas
  // sequenciais ao banco antes de qualquer decisão)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [cal, approvals, leads, spendResult] = await Promise.all([
    loadOrgCalibration(admin, org) as Promise<AiCalibration>,
    admin.from("approval_requests").select("id", { count: "exact", head: true })
      .eq("organization_id", org).eq("status", "pending"),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", org).gte("created_at", since),
    admin.from("marketing_spend").select("campaign_id,amount").eq("organization_id", org),
  ]);

  // aprovações pendentes — best-effort (tabela pode não existir; ignora erro)
  let pendingApprovals: number | undefined;
  if (!approvals.error && typeof approvals.count === "number") pendingApprovals = approvals.count;

  // leads da última semana — best-effort
  let weekLeads: number | undefined;
  if (!leads.error && typeof leads.count === "number") weekLeads = leads.count;

  // gasto — preferência: banco (marketing_spend), igual cost-report
  const { data: spend, error: spendErr } = spendResult;
  if (!spendErr) {
    const totalsSpend = (spend ?? []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const input: BriefingInput = { source: "db", totalsSpend, pendingApprovals, weekLeads };
    return apiSuccess({
      briefing: buildDirectorBriefing(input, { maxDecisions: cal.briefing.maxDecisions }),
      source: "db",
    }, identity.meta, { headers: limited.headers });
  }

  // fallback: Meta ao vivo (gasto 30d + verba + plano + saúde criativa)
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (token && account) {
    const insights = await cachedMetaRead(
      `campaign-insights:${account}:last_30d:7`,
      () => fetchCampaignInsights(account, token, { datePreset: "last_30d", timeIncrement: 7 }),
    );
    if (Array.isArray(insights)) {
      const rows = insightsToCostRows(insights);
      const agg = aggregate(rows, "campaign");
      const { data: budgets } = await admin
        .from("product_budgets").select("product,developer,weekly_budget,target_cac,active")
        .eq("organization_id", org).eq("active", true);
      const pb: ProductBudget[] = (budgets ?? []).map((b) => ({
        product: b.product,
        developer: b.developer,
        weeklyBudget: Number(b.weekly_budget) || 0,
        targetCac: b.target_cac != null ? Number(b.target_cac) : null,
      }));
      const bud = budgetView(pb, rows);
      const plan = marketingEfficiencyPlan(bud, agg, {
        salesKnown: false,
        minSpendToJudgeBrl: cal.marketing.minSpendToJudgeBrl,
        cplRatioReview: cal.marketing.cplRatioReview,
        minSpendCplReviewBrl: cal.marketing.minSpendCplReviewBrl,
      });
      // saúde criativa — best-effort (se a leitura ad-level falhar, omite)
      const adRows = await cachedMetaRead(
        `ad-insights:${account}:last_30d`,
        () => fetchAdInsights(account, token, { datePreset: "last_30d" }),
      );
      const creativeHealth = Array.isArray(adRows)
        ? toHealthCards(analyzeCreativeHealth(adRows, {
            freqLimit: cal.fatigue.freqLimit,
            ctrDropPct: cal.fatigue.ctrDropPct,
            cpmRisePct: cal.fatigue.cpmRisePct,
            diversityTarget: cal.diversity.targetAdsPerCampaign,
            maxActiveCampaignsSmall: cal.consolidation.maxActiveCampaignsSmall,
          }))
        : undefined;
      // "Investimento da semana" de verdade: só a última janela semanal —
      // coerente com weekLeads e com o CPL exibido (plan/agg seguem 30d).
      const lastWeek = rows.reduce((max, r) => ((r.date ?? "") > max ? (r.date ?? "") : max), "");
      const weekSpend = rows.filter((r) => r.date === lastWeek).reduce((sum, r) => sum + r.spend, 0);
      const input: BriefingInput = {
        source: "meta_live",
        totalsSpend: weekSpend,
        campaigns: agg,
        budget: bud,
        plan,
        creativeHealth,
        pendingApprovals,
        weekLeads,
      };
      return apiSuccess({
        briefing: buildDirectorBriefing(input, { maxDecisions: cal.briefing.maxDecisions }),
        source: "meta_live",
      }, identity.meta, { headers: limited.headers });
    }
  }

  return apiError("BRIEFING_UNAVAILABLE", "Briefing indisponível: banco sem marketing_spend e Meta não configurada/legível.", identity.meta, { status: 503 });
}

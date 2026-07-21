/**
 * Saúde criativa pós-Andromeda — lê anúncios reais da Meta (Insights API,
 * últimos 30 dias, nível ad) e devolve o relatório de fadiga/diversidade
 * criativa por campanha + a recomendação de consolidação da conta, com os
 * limiares vindos da calibração central da organização.
 *
 * Fonte VIVA obrigatória: sem META_ADS_ACCESS_TOKEN/META_AD_ACCOUNT_ID a rota
 * responde 503 honesto (nada de dado sintético). Leitura read-only na Meta;
 * qualquer ação derivada daqui é proposta com aprovação humana.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAdInsights } from "@/lib/meta/marketing/campaign-read";
import { analyzeCreativeHealth, accountConsolidation } from "@/lib/meta/marketing/andromeda-report";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { loadOrgCalibration } from "@/lib/ai/calibration-server";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

// GET — saúde criativa (fadiga, diversidade, score Andromeda) por campanha e
// recomendação de consolidação da conta. Liderança comercial.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "marketing-andromeda" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = roleOf(identity.access);
  if (!["director", "superintendent", "manager"].includes(role)) {
    return apiError("FORBIDDEN", "Saúde criativa pertence à liderança.", identity.meta, { status: 403 });
  }

  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return apiError("META_NOT_CONFIGURED", "Meta não configurada: defina META_ADS_ACCESS_TOKEN e META_AD_ACCOUNT_ID.", identity.meta, { status: 503 });
  }

  // leitura cacheada (TTL 5 min) + calibração em paralelo — nada sequencial
  const [rows, cal] = await Promise.all([
    cachedMetaRead(`ad-insights:${account}:last_30d`, () => fetchAdInsights(account, token, { datePreset: "last_30d" })),
    loadOrgCalibration(getSupabaseAdmin(), identity.access.organization.id),
  ]);
  if (!Array.isArray(rows)) {
    // MetaReadError estruturado — repassa a mensagem, nunca o token
    return apiError("META_READ_FAILED", `Meta recusou a leitura: ${rows.message}`, identity.meta, { status: 502 });
  }

  // consolidação: só campanhas VIVAS (última janela) contam — o período de
  // 30 dias inclui campanhas pausadas antigas, que não fragmentam nada hoje.
  const lastWindow = rows.reduce((max, r) => (r.dateStart > max ? r.dateStart : max), "");
  const liveCampaigns = new Set(rows.filter((r) => r.dateStart === lastWindow).map((r) => r.campaignId)).size;
  const monthlySpend = rows.reduce((sum, r) => sum + r.spend, 0);

  return apiSuccess({
    source: "meta_live",
    health: analyzeCreativeHealth(rows, {
      freqLimit: cal.fatigue.freqLimit,
      ctrDropPct: cal.fatigue.ctrDropPct,
      cpmRisePct: cal.fatigue.cpmRisePct,
      diversityTarget: cal.diversity.targetAdsPerCampaign,
      maxActiveCampaignsSmall: cal.consolidation.maxActiveCampaignsSmall,
    }),
    consolidation: accountConsolidation(liveCampaigns, monthlySpend),
  }, identity.meta, { headers: limited.headers });
}

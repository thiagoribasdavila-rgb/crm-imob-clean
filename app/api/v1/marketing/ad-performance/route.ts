/**
 * Desempenho por ANÚNCIO — a leitura que fechava o ciclo até a venda e não
 * existia: lead_attribution_touches.ad_external_id só era lido no detalhe de um
 * lead por vez (app/api/v1/leads/[id]/attribution). Aqui os toques são
 * agrupados por anúncio e cruzados com leads.status para responder "qual
 * anúncio virou venda", com custo quando marketing_spend existir.
 *
 * Somente leitura: nenhuma proposta, nenhuma ação. A regra de amostra e o que é
 * medido × rateado vivem no helper puro lib/marketing/ad-performance.ts e são
 * publicados em `policy` para ninguém ler um número sem saber como nasceu.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { logger } from "@/lib/observability/logger";
import {
  AD_PERFORMANCE_MINIMUM_LEADS,
  AD_PERFORMANCE_POLICY,
  buildAdPerformance,
  type AdPerformanceCampaign,
  type AdPerformanceLead,
  type AdPerformanceSpendRow,
  type AdPerformanceTouch,
} from "@/lib/marketing/ad-performance";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

function clampDays(value: string | null) {
  // Number(null) e Number("") valem 0 — sem esta guarda a chamada padrão viraria
  // janela de 1 dia. Mesma guarda do campaign-quality.
  if (value === null || value.trim() === "") return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.round(parsed)));
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 40, scope: "marketing-ad-performance" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const since = start.toISOString();
  const admin = getSupabaseAdmin();

  // Paginação exaustiva (lição F1: o PostgREST corta em 1000 linhas sem erro —
  // aqui isso significaria venda sumindo do anúncio que a gerou) e tenant
  // scoping explícito em todas as leituras.
  const [campaignFetch, leadFetch, touchFetch, spendFetch] = await Promise.all([
    fetchAllRows<AdPerformanceCampaign>((from, to) => admin
      .from("marketing_campaigns")
      .select("id,name,external_campaign_id")
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchAllRows<AdPerformanceLead>((from, to) => admin
      .from("leads")
      .select("id,campaign_id,status,score_ia,temperature,source,created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
    fetchAllRows<AdPerformanceTouch>((from, to) => admin
      .from("lead_attribution_touches")
      .select("lead_id,ad_external_id,adset_external_id,campaign_external_id,occurred_at")
      .eq("organization_id", organizationId)
      .not("ad_external_id", "is", null)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
    fetchAllRows<AdPerformanceSpendRow>((from, to) => admin
      .from("marketing_spend")
      .select("campaign_id,spend_date,amount")
      .eq("organization_id", organizationId)
      .gte("spend_date", since.slice(0, 10))
      .order("spend_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)),
  ]);

  // Sem a tabela de toques não existe leitura por anúncio — nem parcial, nem
  // degradada. 503 explicando, em vez de um relatório vazio que pareceria "esta
  // conta não vendeu nada".
  if (touchFetch.error) {
    logger.warn("marketing.ad_performance.touches_unavailable", {
      organizationId,
      code: touchFetch.error.code,
    });
    return apiError(
      "AD_ATTRIBUTION_UNAVAILABLE",
      "Desempenho por anúncio depende de lead_attribution_touches (migration da Fase 74), ausente neste banco.",
      identity.meta,
      { status: 503 },
    );
  }
  if (leadFetch.error || campaignFetch.error) {
    logger.warn("marketing.ad_performance.read_failed", {
      organizationId,
      leadCode: leadFetch.error?.code,
      campaignCode: campaignFetch.error?.code,
    });
    return apiError(
      "AD_PERFORMANCE_LOAD_FAILED",
      "O desempenho por anúncio está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }
  if (spendFetch.error) {
    // Degradação graciosa: sem marketing_spend as contagens por anúncio seguem
    // válidas; custo vira null e policy.spendMeasured sinaliza o motivo.
    logger.warn("marketing.ad_performance.spend_unavailable", {
      organizationId,
      code: spendFetch.error.code,
    });
  }

  const anyReadError = Boolean(
    leadFetch.error || touchFetch.error || campaignFetch.error || spendFetch.error,
  );

  const { ranking, totals } = buildAdPerformance({
    touches: touchFetch.rows,
    leads: leadFetch.rows,
    campaigns: campaignFetch.rows,
    spendRows: spendFetch.error ? [] : spendFetch.rows,
  });

  return apiSuccess(
    {
      scope: {
        organizationId,
        actorId: identity.access.profile.id,
        readOnly: true,
        minimumRole: "manager",
      },
      period: { start: since, end: end.toISOString(), days },
      totals,
      ranking,
      policy: {
        ...AD_PERFORMANCE_POLICY,
        minimumLeadsForDecision: AD_PERFORMANCE_MINIMUM_LEADS,
        spendMeasured: !spendFetch.error,
        spendMeasuredAtAdLevel: false,
        crmIsConversionTruth: true,
        // Cobertura honesta: false quando alguma dimensão bateu o teto de
        // paginação OU falhou. fetchAllRows devolve truncated: false quando há
        // erro, então só olhar truncated declarava "janela completa" justamente
        // quando a dimensão de gasto sumiu inteira.
        windowComplete:
          !anyReadError
          && !leadFetch.truncated
          && !touchFetch.truncated
          && !spendFetch.truncated
          && !campaignFetch.truncated,
      },
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}

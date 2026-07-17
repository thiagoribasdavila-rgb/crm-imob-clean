import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { fetchMetaCampaignInsights, type MetaInsightPeriod } from "@/lib/meta/insights";

export const dynamic = "force-dynamic";

type Reference = { spend?: number; impressions?: number; clicks?: number };
type Body = { periods?: Partial<Record<"day" | "week" | "month", Reference>> };

function validReference(value: Reference | undefined) {
  return value && [value.spend, value.impressions, value.clicks].every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0);
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 6, windowMs: 60 * 60_000, scope: "meta-insights-test" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Comparação do Meta Insights é exclusiva da diretoria.", identity.meta, { status: 403 });
  if (!process.env.META_ADS_ACCESS_TOKEN || !process.env.META_AD_ACCOUNT_ID) return apiError("META_INSIGHTS_NOT_READY", "Configure conta e token de leitura do Meta Ads na Hostinger.", identity.meta, { status: 503 });
  const body = await request.json().catch(() => null) as Body | null;
  if (!validReference(body?.periods?.day) || !validReference(body?.periods?.week) || !validReference(body?.periods?.month)) return apiError("INVALID_REFERENCE", "Informe gasto, impressões e cliques exibidos no Ads Manager para os três períodos.", identity.meta, { status: 400 });

  try {
    const definitions: Array<{ key: "day" | "week" | "month"; days: MetaInsightPeriod }> = [{ key: "day", days: 1 }, { key: "week", days: 7 }, { key: "month", days: 30 }];
    const results = await Promise.all(definitions.map(async ({ key, days }) => {
      const rows = await fetchMetaCampaignInsights(days);
      const actual = rows.reduce((total, row) => ({ spend: total.spend + row.spend, impressions: total.impressions + row.impressions, clicks: total.clicks + row.clicks }), { spend: 0, impressions: 0, clicks: 0 });
      actual.spend = Math.round(actual.spend * 100) / 100;
      const reference = body!.periods![key]! as Required<Reference>;
      const difference = { spend: Math.round((actual.spend - reference.spend) * 100) / 100, impressions: actual.impressions - reference.impressions, clicks: actual.clicks - reference.clicks };
      return { key, days, datePreset: days === 1 ? "today" : days === 7 ? "last_7d" : "last_30d", actual, reference, difference, matches: Math.abs(difference.spend) <= 0.02 && difference.impressions === 0 && difference.clicks === 0, campaigns: rows.length };
    }));
    return apiSuccess({ status: results.every((period) => period.matches) ? "passed" : "mismatch", accountIdMasked: `••••${String(process.env.META_AD_ACCOUNT_ID).replace(/^act_/, "").slice(-4)}`, readOnly: true, comparedAt: new Date().toISOString(), periods: results }, identity.meta, { headers: rate.headers });
  } catch (error) {
    return apiError("META_INSIGHTS_TEST_FAILED", "Não foi possível comparar os dados com a Meta. Consulte os logs seguros.", identity.meta, { status: 502, details: error instanceof Error ? error.message.slice(0, 160) : "Falha" });
  }
}

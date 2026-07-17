import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { REAL_ESTATE_MARKET_SOURCES } from "@/lib/ai/real-estate-knowledge";
import { aiModelProfiles, aiProviderReadiness, aiPricingReadiness } from "@/lib/ai/provider-router";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const providers = aiProviderReadiness();
  const models = aiModelProfiles();
  const gatewayConfigured = providers.openai;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: usageRows } = await access.supabase
    .from("ai_usage_events")
    .select("provider,total_tokens,latency_ms,estimated_cost_usd")
    .gte("created_at", since)
    .limit(5_000);
  const usage = (usageRows ?? []).reduce(
    (total, row) => ({
      calls: total.calls + 1,
      tokens: total.tokens + Number(row.total_tokens || 0),
      estimatedCostUsd:
        total.estimatedCostUsd + Number(row.estimated_cost_usd || 0),
      latencyMs: total.latencyMs + Number(row.latency_ms || 0),
      openaiCalls: total.openaiCalls + (row.provider === "openai" ? 1 : 0),
      perplexityCalls:
        total.perplexityCalls + (row.provider === "perplexity" ? 1 : 0),
      economyCalls: total.economyCalls + (["deepseek", "qwen", "kimi", "glm"].includes(row.provider) ? 1 : 0),
      localCalls: total.localCalls + (row.provider === "local" ? 1 : 0),
    }),
    {
      calls: 0,
      tokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
      openaiCalls: 0,
      perplexityCalls: 0,
      economyCalls: 0,
      localCalls: 0,
    },
  );
  return NextResponse.json({
    status: gatewayConfigured ? "ready" : "degraded",
    gatewayConfigured,
    fallbackAvailable: true,
    model: models.commercial,
    models,
    pricing: aiPricingReadiness(),
    providers,
    usage: {
      ...usage,
      averageLatencyMs: usage.calls
        ? Math.round(usage.latencyMs / usage.calls)
        : 0,
      periodDays: 30,
    },
    domain: "mercado-imobiliario-brasileiro",
    calibrationVerifiedAt: "2026-07-16",
    marketSources: REAL_ESTATE_MARKET_SOURCES.map(
      ({ id, title, publisher, url, verifiedAt }) => ({
        id,
        title,
        publisher,
        url,
        verifiedAt,
      }),
    ),
    controls: {
      operationalContext: true,
      hierarchyAware: true,
      personalDataProtection: true,
      promptInjectionGuard: true,
      financialDisclaimer: true,
      localFallback: true,
    },
  });
}

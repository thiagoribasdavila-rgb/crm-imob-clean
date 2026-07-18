import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { REAL_ESTATE_MARKET_SOURCES } from "@/lib/ai/real-estate-knowledge";
import { aiModelProfiles, aiProviderReadiness, aiPricingReadiness } from "@/lib/ai/provider-router";
import { resolveAtlasAIOS } from "@/lib/ai/operating-system";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const providers = aiProviderReadiness();
  const models = aiModelProfiles();
  const gatewayConfigured = providers.openai;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: usageRows }, memoryResult, knowledgeResult, learningResult] = await Promise.all([access.supabase
    .from("ai_usage_events")
    .select("provider,model,total_tokens,latency_ms,estimated_cost_usd,created_at")
    .gte("created_at", since)
    .limit(5_000), access.supabase.from("lead_commercial_memory_states").select("id", { count: "exact", head: true }), access.supabase.from("project_materials").select("id", { count: "exact", head: true }).eq("is_current", true).eq("review_status", "verified"), access.supabase.from("ai_orchestration_decisions").select("id", { count: "exact", head: true }).gte("created_at", since)]);
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
  const lastSuccess = new Map<string, { model: string | null; createdAt: string; latencyMs: number }>();
  for (const row of usageRows ?? []) {
    if (!lastSuccess.has(row.provider)) lastSuccess.set(row.provider, { model: row.model || null, createdAt: row.created_at, latencyMs: Number(row.latency_ms || 0) });
  }
  const providerHealth = Object.entries(providers).filter(([name]) => !["localFallback", "host"].includes(name)).map(([name, configured]) => {
    const success = lastSuccess.get(name);
    return { name, configured: Boolean(configured), validated: Boolean(success), status: !configured ? "not_configured" : success ? "operational" : "awaiting_live_test", model: success?.model || null, lastSuccessfulAt: success?.createdAt || null, latencyMs: success?.latencyMs || null };
  });
  const generativeOperational = providerHealth.some((item) => item.name !== "perplexity" && item.status === "operational");
  const researchOperational = providerHealth.some((item) => item.name === "perplexity" && item.status === "operational");
  const memoryOperational = Boolean((usageRows ?? []).length);
  const operatingSystem = resolveAtlasAIOS({ generativeConfigured: gatewayConfigured, generativeOperational, researchOperational, marketingConnected: Boolean(process.env.META_ADS_ACCESS_TOKEN) && Boolean(process.env.META_CONVERSIONS_ACCESS_TOKEN), memoryRecords: memoryResult.count ?? 0, knowledgeDocuments: knowledgeResult.count ?? 0, learningEvents: learningResult.count ?? 0 });
  const agents = operatingSystem.agents.map(({ id, name, status, capabilities }) => ({ id, name, status, functions: capabilities }));
  return NextResponse.json({
    status: generativeOperational ? "ready" : "degraded",
    gatewayConfigured,
    fallbackAvailable: true,
    model: models.commercial,
    models,
    pricing: aiPricingReadiness(),
    providers,
    providerHealth,
    agents,
    operatingSystem,
    activationPolicy: { mode: "supervised", autonomousExternalActions: false, humanApprovalRequired: true, memoryOperational, rawPromptsStored: false, personalDataRestrictedToTrustedProvider: true },
    usage: {
      ...usage,
      averageLatencyMs: usage.calls
        ? Math.round(usage.latencyMs / usage.calls)
        : 0,
      periodDays: 30,
    },
    domain: "mercado-imobiliario-brasileiro",
    calibrationVerifiedAt: "2026-07-17",
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
      adaptiveComplexityRouting: true,
      humanReviewEscalation: true,
    },
  });
}

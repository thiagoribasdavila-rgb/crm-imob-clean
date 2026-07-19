import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { aiPricingReadiness, testAICostRouting } from "@/lib/ai/provider-router";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 2, windowMs: 60 * 60_000, scope: "ai-cost-routing-test" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Ensaio de custo da IA é exclusivo da diretoria.", identity.meta, { status: 403 });
  const pricing = aiPricingReadiness();
  if (!pricing.fast || !pricing.commercial || !pricing.reasoning) return apiError("AI_PRICING_NOT_CONFIGURED", "Configure os preços por milhão de tokens das rotas rápida, comercial e complexa na Hostinger.", identity.meta, { status: 503 });
  try {
    const results = await testAICostRouting({ organizationId: identity.access.organization.id, userId: identity.access.profile.id });
    if (results.some((result) => result.provider !== "openai" || !result.providerRequestId || result.usage.totalTokens <= 0)) throw new Error("Uma das rotas não retornou telemetria real.");
    return apiSuccess({ status: "passed", containsPersonalData: false, routes: results.map((result) => ({ task: result.task, provider: result.provider, model: result.model, latencyMs: result.latencyMs, tokens: result.usage, estimatedCostUsd: result.cost?.estimatedUsd || 0, providerRequestId: result.providerRequestId })), totalEstimatedCostUsd: results.reduce((sum, result) => sum + (result.cost?.estimatedUsd || 0), 0), testedAt: new Date().toISOString() }, identity.meta, { headers: rate.headers });
  } catch (error) {
    return apiError("AI_COST_ROUTING_TEST_FAILED", "Não foi possível comprovar as três rotas reais de IA.", identity.meta, { status: 502, details: error instanceof Error ? error.message.slice(0, 160) : "Falha" });
  }
}

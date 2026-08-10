import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  aiProviderReadiness,
  testEconomyProviderConnection,
  type EconomyProvider,
} from "@/lib/ai/provider-router";

export const dynamic = "force-dynamic";

const supported = new Set<EconomyProvider>(["deepseek", "qwen", "kimi", "glm"]);

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 8,
    windowMs: 15 * 60_000,
    scope: "economy-ai-homologation",
  });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) {
    return apiError("FORBIDDEN", "Teste de provedores é exclusivo da diretoria.", identity.meta, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { provider?: string } | null;
  const provider = body?.provider?.toLowerCase() as EconomyProvider | undefined;
  if (!provider || !supported.has(provider)) {
    return apiError("INVALID_PROVIDER", "Selecione Kimi, Qwen, DeepSeek ou GLM.", identity.meta, { status: 400 });
  }
  if (!aiProviderReadiness()[provider]) {
    return apiError(
      "PROVIDER_NOT_CONFIGURED",
      `Configure a chave e o modelo de ${provider.toUpperCase()} na Hostinger.`,
      identity.meta,
      { status: 503 },
    );
  }

  try {
    const result = await testEconomyProviderConnection(provider, {
      organizationId: identity.access.organization.id,
      userId: identity.access.profile.id,
    });
    const expected = `ATLAS_${provider.toUpperCase()}_OK`;
    if (result.provider !== provider || result.text.trim() !== expected || result.usage.totalTokens <= 0) {
      return apiError(
        "PROVIDER_UNEXPECTED_RESPONSE",
        `${provider.toUpperCase()} respondeu, mas o teste de integridade não conferiu.`,
        identity.meta,
        { status: 502 },
      );
    }
    return apiSuccess(
      {
        status: "passed",
        provider,
        model: result.model,
        providerRequestId: result.providerRequestId || null,
        latencyMs: result.latencyMs,
        usage: result.usage,
        measured: true,
        containsPersonalData: false,
        fallbackUsed: false,
        testedAt: new Date().toISOString(),
      },
      identity.meta,
      { headers: rate.headers },
    );
  } catch (error) {
    return apiError(
      "PROVIDER_TEST_FAILED",
      `A chamada real de ${provider.toUpperCase()} falhou. Consulte os logs seguros da Hostinger.`,
      identity.meta,
      { status: 502, details: error instanceof Error ? error.name : "Error" },
    );
  }
}

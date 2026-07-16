import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { REAL_ESTATE_MARKET_SOURCES } from "@/lib/ai/real-estate-knowledge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const gatewayConfigured = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  return NextResponse.json({
    status: gatewayConfigured ? "ready" : "degraded",
    gatewayConfigured,
    fallbackAvailable: true,
    model: process.env.ATLAS_AI_MODEL || "openai/gpt-5.6-terra",
    domain: "mercado-imobiliario-brasileiro",
    calibrationVerifiedAt: "2026-07-16",
    marketSources: REAL_ESTATE_MARKET_SOURCES.map(({ id, title, publisher, url, verifiedAt }) => ({ id, title, publisher, url, verifiedAt })),
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

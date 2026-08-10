import { type NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 3, windowMs: 60 * 60_000, scope: "meta-conversion-test" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { accessRoles: ["admin", "director_decisor", "director"] });
  if (!identity.ok) return identity.response;
  return NextResponse.json({
    error: {
      code: "LEGACY_META_TEST_ROUTE_RETIRED",
      message: "Use o fluxo governado: aprovação, payload congelado, gate e entrega única.",
      replacement: "/api/v1/integrations/meta/test-deliveries",
    },
  }, { headers: rate.headers, status: 410 });
}

import type { NextRequest } from "next/server";
import { apiSuccess, createRequestContext, structuredApiLog } from "@/lib/api/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  structuredApiLog("info", "api.health.checked", request, meta, { healthy: true });

  return apiSuccess(
    {
      service: "atlas-api-platform",
      status: "ok",
      checks: { application: "ok" },
    },
    meta,
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

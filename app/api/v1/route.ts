import type { NextRequest } from "next/server";
import {
  ATLAS_API_SERVICE,
  ATLAS_API_VERSION,
  apiSuccess,
  createRequestContext,
  methodNotAllowed,
  structuredApiLog,
} from "@/lib/api/core";

export const dynamic = "force-dynamic";

const resources = {
  system: ["/api/v1", "/api/v1/health", "/api/v1/ready", "/api/v1/openapi"],
  auth: ["/api/v1/auth/me"],
  crm: ["/api/v1/crm/dashboard", "/api/v1/crm/leads", "/api/v1/crm/leads/:id", "/api/v1/crm/leads/:id/360"],
  pipeline: ["/api/v1/pipeline", "/api/v1/pipeline/move"],
  developments: ["/api/v1/developments", "/api/v1/developments/:id/units"],
  inventory: ["/api/v1/inventory", "/api/v1/inventory/reserve"],
  ai: ["/api/v1/ai/copilot"],
  analytics: ["/api/v1/analytics/dashboard"],
  search: ["/api/v1/search"],
};

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  structuredApiLog("info", "api.gateway.discovery", request, meta);

  return apiSuccess(
    {
      service: ATLAS_API_SERVICE,
      version: ATLAS_API_VERSION,
      status: "operational",
      architecture: "api-first",
      documentation: {
        openapi: "/api/v1/openapi",
        docs: "/api/docs",
      },
      standards: {
        tracing: ["X-Request-Id", "X-Correlation-Id"],
        writeSafety: ["Idempotency-Key"],
        rateLimit: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
      },
      resources,
    },
    meta,
  );
}

export async function POST(request: NextRequest) {
  return methodNotAllowed(request, ["GET", "OPTIONS"]);
}

export async function PUT(request: NextRequest) {
  return methodNotAllowed(request, ["GET", "OPTIONS"]);
}

export async function PATCH(request: NextRequest) {
  return methodNotAllowed(request, ["GET", "OPTIONS"]);
}

export async function DELETE(request: NextRequest) {
  return methodNotAllowed(request, ["GET", "OPTIONS"]);
}

export async function OPTIONS(request: NextRequest) {
  const meta = createRequestContext(request);
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id, X-Correlation-Id, Idempotency-Key",
      "Access-Control-Max-Age": "86400",
      "X-Request-Id": meta.requestId,
      "X-Correlation-Id": meta.correlationId,
      "X-Atlas-Api-Version": meta.version,
    },
  });
}

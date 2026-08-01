import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl = process.env.ATLAS_BASE_URL || "http://localhost:3000";

  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Atlas AI API",
      version: "1.0.0",
      description: "API versionada do Atlas AI Real Estate Operating System.",
    },
    servers: [{ url: `${baseUrl}/api/v1` }],
    paths: {
      "/": { get: { summary: "API manifest", responses: { "200": { description: "OK" } } } },
      "/health": { get: { summary: "Liveness", responses: { "200": { description: "OK" }, "503": { description: "Degraded" } } } },
      "/ready": { get: { summary: "Readiness", responses: { "200": { description: "Ready" }, "503": { description: "Not ready" } } } },
      "/auth/me": {
        get: {
          summary: "Authenticated user profile",
          responses: {
            "200": { description: "Authenticated identity" },
            "401": { description: "Authentication required" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
    },
  }, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

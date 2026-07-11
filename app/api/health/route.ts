import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const healthy = hasSupabaseUrl && hasSupabaseAnonKey;

  return NextResponse.json(
    {
      service: "atlas-ai-real-estate-os",
      version: process.env.npm_package_version ?? "unknown",
      status: healthy ? "ok" : "degraded",
      checks: {
        application: "ok",
        supabaseConfiguration: healthy ? "ok" : "missing",
      },
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

import { NextResponse } from "next/server";
import { featureSnapshot } from "@/lib/platform/feature-flags";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(process.env.ATLAS_CRON_SECRET && token === process.env.ATLAS_CRON_SECRET);
}

const configured = (name: string) => Boolean(process.env[name]);
const publicSupabaseKeyConfigured = () =>
  configured("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || configured("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const checks = {
    supabasePublic: configured("NEXT_PUBLIC_SUPABASE_URL") && publicSupabaseKeyConfigured(),
    supabaseAdmin: configured("SUPABASE_SERVICE_ROLE_KEY"),
    cronWorker: configured("ATLAS_CRON_SECRET"),
    metaWebhook: configured("META_APP_SECRET") && configured("META_WEBHOOK_VERIFY_TOKEN"),
    whatsapp: configured("WHATSAPP_PHONE_NUMBER_ID") && configured("WHATSAPP_ACCESS_TOKEN"),
  };

  const requiredForV1 = [checks.supabasePublic, checks.supabaseAdmin];
  const requiredForV2 = [checks.supabasePublic, checks.supabaseAdmin, checks.cronWorker];

  const body = {
    service: "atlas-ai-os",
    release: "v1-v2",
    status: requiredForV1.every(Boolean) ? "operational" : "configuration_required",
    v1: {
      ready: requiredForV1.every(Boolean),
      modules: ["auth", "crm", "pipeline", "customers", "properties", "developments", "tasks", "dashboard"],
    },
    v2: {
      ready: requiredForV2.every(Boolean),
      externalChannelsReady: checks.metaWebhook && checks.whatsapp,
      modules: ["marketing", "attribution", "conversations", "creatives", "approvals", "automations", "outbox"],
    },
    checks,
    features: featureSnapshot(),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: requiredForV1.every(Boolean) ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildMetaCampaignIntelligence } from "@/lib/meta/campaign-intelligence";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
function authorized(request: Request) { const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); return Boolean(process.env.ATLAS_CRON_SECRET && token === process.env.ATLAS_CRON_SECRET); }
function reportDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const admin = getSupabaseAdmin();
  const { data: organizations, error } = await admin.from("organizations").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let generated = 0;
  for (const organization of organizations ?? []) {
    try {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const [{ data: leads }, { data: recentEvents }, { data: followUps }] = await Promise.all([
        admin.from("leads").select("status,score,metadata").eq("organization_id", organization.id).eq("source", "Meta Lead Ads").limit(2000),
        admin.from("meta_conversion_events").select("status,event_name").eq("organization_id", organization.id).gte("created_at", since).limit(1000),
        admin.from("campaign_events").select("payload").eq("organization_id", organization.id).in("source", ["crm-funnel", "crm-followup"]).gte("occurred_at", since).limit(1000),
      ]);
      const campaigns = buildMetaCampaignIntelligence(leads ?? []);
      const signalCounts: Record<string, number> = {};
      for (const event of followUps ?? []) { const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {}; for (const signal of Array.isArray(payload.decision_signals) ? payload.decision_signals : []) if (typeof signal === "string" && signal !== "motivo_nao_classificado") signalCounts[signal] = (signalCounts[signal] || 0) + 1; }
      const recommendations = campaigns.filter((campaign) => campaign.sampleStatus !== "insufficient").slice(0, 10).map((campaign) => ({ campaignId: campaign.campaignId, recommendation: campaign.recommendation, qualityRate: campaign.qualityRate, conversionRate: campaign.conversionRate, decisionRequired: true }));
      const payload = { generatedAt: new Date().toISOString(), windowHours: 24, campaigns, recommendations, topSignals: Object.entries(signalCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([signal, count]) => ({ signal, count })), delivery: (recentEvents ?? []).reduce((total, event) => ({ ...total, [event.status]: (total[event.status] || 0) + 1 }), {} as Record<string, number>), governance: { decisionRole: "director", automaticCampaignChanges: false } };
      const { error: upsertError } = await admin.from("meta_daily_reports").upsert({ organization_id: organization.id, report_date: reportDate(), status: "ready", payload, updated_at: new Date().toISOString() }, { onConflict: "organization_id,report_date" });
      if (upsertError) throw upsertError;
      generated += 1;
    } catch (reportError) { logger.error("meta.daily_report_failed", reportError, { organizationId: organization.id }); }
  }
  return NextResponse.json({ reportDate: reportDate(), organizations: (organizations ?? []).length, generated });
}

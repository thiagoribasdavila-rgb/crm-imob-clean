import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchMetaCampaignInsights } from "@/lib/meta/insights";
import { buildWeeklyAcquisitionReport } from "@/lib/analytics/weekly-acquisition-report";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "analytics.weekly-acquisition" }); if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, { roles: ["admin", "director"] }); if (!access.ok) return access.response;
  const organizationId = access.access.organization.id; const admin = getSupabaseAdmin();
  const end = new Date(); const start = new Date(end.getTime() - 7 * 86_400_000);
  const [{ data: leads, error: leadError }, { data: developments, error: developmentError }] = await Promise.all([
    admin.from("leads").select("id,campaign_id,development_id,status,score,metadata,created_at").eq("organization_id", organizationId).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).limit(10000),
    admin.from("developments").select("id,name,developer_name").eq("organization_id", organizationId).limit(1000),
  ]);
  if (leadError || developmentError) return NextResponse.json({ error: "Não foi possível consolidar o relatório semanal." }, { status: 500 });
  let paid: Awaited<ReturnType<typeof fetchMetaCampaignInsights>> = [];
  let paidError: string | null = null;
  try { paid = await fetchMetaCampaignInsights(7); } catch { paidError = "Meta Ads ainda não forneceu o custo semanal."; }
  const report = buildWeeklyAcquisitionReport(leads ?? [], developments ?? [], paid);
  return NextResponse.json({ ...report, period: { start: start.toISOString(), end: end.toISOString(), timezone: "America/Sao_Paulo" }, warnings: paidError ? [paidError] : [], generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}

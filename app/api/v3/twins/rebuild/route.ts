import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildBuyerTwin, buildCampaignTwin, buildPropertyTwin, type TwinSnapshot } from "@/lib/atlas/digital-twin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && token === expected);
}

async function persistTwin(organizationId: string, twin: TwinSnapshot) {
  const admin = getSupabaseAdmin();
  const { data: latest } = await admin
    .from("digital_twin_snapshots")
    .select("version")
    .eq("organization_id", organizationId)
    .eq("twin_type", twin.twinType)
    .eq("entity_id", twin.entityId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("digital_twin_snapshots").insert({
    organization_id: organizationId,
    twin_type: twin.twinType,
    entity_id: twin.entityId,
    version: Number(latest?.version ?? 0) + 1,
    state: twin.state,
    signals: twin.signals,
    quality_score: twin.qualityScore,
    expires_at: twin.expiresAt,
  });
  if (error) throw error;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const { data: organizations, error: orgError } = await admin.from("organizations").select("id").eq("status", "active");
    if (orgError) throw orgError;

    let rebuilt = 0;
    for (const organization of organizations ?? []) {
      const [leads, properties, campaigns] = await Promise.all([
        admin.from("leads").select("id,name,score,temperature,budget_min,budget_max,bedrooms,preferred_regions,status,source").eq("organization_id", organization.id).limit(200),
        admin.from("properties").select("id,title,status,price,area,bedrooms,neighborhood,city,development_id").eq("organization_id", organization.id).limit(200),
        admin.from("campaigns").select("id,name,channel,status,spend,leads_count,sales_count,revenue").eq("organization_id", organization.id).limit(100),
      ]);

      const twins = [
        ...(leads.data ?? []).map(buildBuyerTwin),
        ...(properties.data ?? []).map(buildPropertyTwin),
        ...(campaigns.data ?? []).map(buildCampaignTwin),
      ];

      for (const twin of twins) {
        await persistTwin(organization.id, twin);
        rebuilt += 1;
      }
    }

    logger.info("v3.twins_rebuilt", { rebuilt, organizations: organizations?.length ?? 0 });
    return NextResponse.json({ rebuilt, organizations: organizations?.length ?? 0 });
  } catch (error) {
    logger.error("v3.twins_rebuild_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao reconstruir Digital Twins." }, { status: 500 });
  }
}

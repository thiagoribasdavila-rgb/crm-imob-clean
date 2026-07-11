import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { recommendCampaignAction, recommendProperties } from "@/lib/atlas2030/recommendation-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.ATLAS_CRON_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(secret && token === secret);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const { data: organizations, error: organizationError } = await admin.from("organizations").select("id").eq("status", "active");
    if (organizationError) throw organizationError;

    let created = 0;
    let skipped = 0;

    for (const organization of organizations ?? []) {
      const [buyersResult, propertiesResult, campaignsResult] = await Promise.all([
        admin.from("leads").select("id,name,budget_max,bedrooms,preferred_regions,status,score").eq("organization_id", organization.id).order("score", { ascending: false }).limit(150),
        admin.from("properties").select("id,title,price,bedrooms,neighborhood,city,status").eq("organization_id", organization.id).in("status", ["available", "disponivel", "active", "ativo"]).limit(300),
        admin.from("campaigns").select("id,name,spend,leads_count,revenue,status").eq("organization_id", organization.id).limit(100),
      ]);

      const recommendations = [
        ...(buyersResult.data ?? []).flatMap((buyer) => recommendProperties(buyer, propertiesResult.data ?? [], 3)),
        ...(campaignsResult.data ?? []).map((campaign) => recommendCampaignAction(campaign)).filter((item) => item !== null),
      ];

      for (const recommendation of recommendations) {
        const fingerprint = [recommendation.type, recommendation.subjectType, recommendation.subjectId ?? "global", recommendation.title].join(":");
        const { error } = await admin.from("atlas_recommendations").insert({
          organization_id: organization.id,
          recommendation_key: fingerprint,
          recommendation_type: recommendation.type,
          subject_type: recommendation.subjectType,
          subject_id: recommendation.subjectId ?? null,
          title: recommendation.title,
          rationale: recommendation.rationale,
          recommendation: recommendation.recommendation,
          evidence: recommendation.evidence,
          expected_impact: recommendation.expectedImpact,
          confidence: recommendation.confidence,
          status: "active",
          expires_at: recommendation.expiresAt ?? null,
        });

        if (error?.code === "23505") skipped += 1;
        else if (error) throw error;
        else created += 1;
      }
    }

    logger.info("atlas2030.recommendations_generated", { created, skipped, organizations: organizations?.length ?? 0 });
    return NextResponse.json({ created, skipped, organizations: organizations?.length ?? 0 });
  } catch (error) {
    logger.error("atlas2030.recommendations_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao gerar recomendações." }, { status: 500 });
  }
}

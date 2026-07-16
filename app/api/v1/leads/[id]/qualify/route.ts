import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { qualifyRealEstateLead } from "@/lib/ai/lead-qualification";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const rate = checkRateLimit(clientKey(request, "lead-ai-qualification"), { limit: 30, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Aguarde antes de recalibrar novamente." }, { status: 429 });

  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const admin = getSupabaseAdmin();
    const [leadResult, activitiesResult, opportunitiesResult, propertiesResult] = await Promise.all([
      admin.from("leads").select("id,email,phone,status,source,budget_min,budget_max,preferred_regions,bedrooms,purpose,next_action_at,last_interaction_at,created_at,metadata").eq("id", id).eq("organization_id", identity.organizationId).single(),
      admin.from("activities").select("id", { count: "exact", head: true }).eq("lead_id", id).eq("organization_id", identity.organizationId),
      admin.from("opportunities").select("id", { count: "exact", head: true }).eq("lead_id", id).eq("organization_id", identity.organizationId),
      admin.from("properties").select("id,price,city,bedrooms,status").eq("organization_id", identity.organizationId).limit(500),
    ]);
    if (leadResult.error || !leadResult.data) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const lead = leadResult.data;
    const matches = (propertiesResult.data ?? []).filter((property) => {
      const available = ["available", "ativo", "disponivel", "disponível"].includes(String(property.status ?? "").toLowerCase());
      const budgetFit = !lead.budget_max || !property.price || Number(property.price) <= Number(lead.budget_max) * 1.1;
      const bedroomFit = !lead.bedrooms || !property.bedrooms || Number(property.bedrooms) === Number(lead.bedrooms);
      const regionFit = !lead.preferred_regions?.length || !property.city || lead.preferred_regions.some((region: string) => property.city?.toLowerCase().includes(region.toLowerCase()));
      return available && budgetFit && bedroomFit && regionFit;
    });
    const qualification = qualifyRealEstateLead({
      lead,
      activityCount: activitiesResult.count ?? 0,
      opportunityCount: opportunitiesResult.count ?? 0,
      propertyMatchCount: matches.length,
    });

    const metadata = typeof lead.metadata === "object" && lead.metadata ? lead.metadata : {};
    const { error } = await admin.from("leads").update({
      score: qualification.score,
      temperature: qualification.temperature,
      metadata: { ...metadata, aiQualification: qualification },
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_id", identity.organizationId);
    if (error) return NextResponse.json({ error: "Não foi possível salvar a qualificação." }, { status: 500 });

    await admin.from("activities").insert({
      organization_id: identity.organizationId,
      lead_id: id,
      user_id: identity.userId,
      type: "ai_qualification",
      title: `Qualificação recalibrada: ${qualification.score}/100`,
      description: qualification.nextBestAction,
      metadata: { score: qualification.score, confidence: qualification.confidence, temperature: qualification.temperature },
      occurred_at: new Date().toISOString(),
    });
    return NextResponse.json({ qualification });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na qualificação.";
    const status = /sessão|token|autenticação/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

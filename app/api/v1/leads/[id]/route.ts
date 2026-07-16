import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized(error: unknown) {
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação/i.test(message) ? 401 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const admin = getSupabaseAdmin();

    const [leadResult, activityResult, propertyResult, opportunityResult] = await Promise.all([
      admin.from("leads").select("*").eq("id", id).eq("organization_id", identity.organizationId).single(),
      admin.from("activities").select("id,title,description,type,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(50),
      admin.from("properties").select("id,title,price,city,state,bedrooms,bathrooms,parking_spaces,area,status").eq("organization_id", identity.organizationId).limit(150),
      admin.from("opportunities").select("id,stage,value,probability,expected_close_at,property_id,created_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(20),
    ]);

    if (leadResult.error || !leadResult.data) {
      return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      lead: leadResult.data,
      activities: activityResult.data ?? [],
      properties: propertyResult.data ?? [],
      opportunities: opportunityResult.data ?? [],
    });
  } catch (error) {
    logger.warn("lead.intelligence.read_failed", { error: error instanceof Error ? error.message : String(error) });
    return unauthorized(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json();
    const admin = getSupabaseAdmin();

    const allowed = {
      name: body.name ?? null,
      email: body.email || null,
      phone: body.phone || null,
      source: body.source || null,
      status: body.status || "novo",
      temperature: body.temperature || "frio",
      score: Number.isFinite(Number(body.score)) ? Number(body.score) : 0,
      budget_min: body.budget_min === null || body.budget_min === "" ? null : Number(body.budget_min),
      budget_max: body.budget_max === null || body.budget_max === "" ? null : Number(body.budget_max),
      bedrooms: body.bedrooms === null || body.bedrooms === "" ? null : Number(body.bedrooms),
      purpose: body.purpose || null,
      preferred_regions: Array.isArray(body.preferred_regions) ? body.preferred_regions.filter(Boolean) : [],
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await admin
      .from("leads")
      .update(allowed)
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .select("*")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || "Lead não encontrado." }, { status: 404 });

    await admin.from("activities").insert({
      organization_id: identity.organizationId,
      lead_id: id,
      user_id: identity.userId,
      title: "Dados do lead atualizados",
      description: "Perfil comercial revisado no Lead Intelligence.",
      type: "system",
      occurred_at: new Date().toISOString(),
    });

    return NextResponse.json({ lead: data });
  } catch (error) {
    logger.warn("lead.intelligence.update_failed", { error: error instanceof Error ? error.message : String(error) });
    return unauthorized(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json();
    const admin = getSupabaseAdmin();

    const { data: lead } = await admin.from("leads").select("id,budget_max").eq("id", id).eq("organization_id", identity.organizationId).single();
    if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    if (body.action === "activity") {
      const title = String(body.title || "").trim();
      if (!title) return NextResponse.json({ error: "Informe a atividade." }, { status: 400 });
      const { data, error } = await admin.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: id,
        user_id: identity.userId,
        title,
        description: body.description || null,
        type: body.type || "note",
        occurred_at: new Date().toISOString(),
      }).select("id,title,description,type,occurred_at").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ activity: data }, { status: 201 });
    }

    if (body.action === "opportunity") {
      let propertyPrice: number | null = null;
      if (body.propertyId) {
        const { data: property } = await admin.from("properties").select("price").eq("id", body.propertyId).eq("organization_id", identity.organizationId).single();
        propertyPrice = property?.price ?? null;
      }
      const { data, error } = await admin.from("opportunities").insert({
        organization_id: identity.organizationId,
        lead_id: id,
        property_id: body.propertyId || null,
        stage: "qualificacao",
        probability: 25,
        value: propertyPrice ?? lead.budget_max ?? null,
      }).select("id,stage,value,probability,expected_close_at,property_id,created_at").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ opportunity: data }, { status: 201 });
    }

    if (body.action === "property_presentation") {
      const idPattern = /^[0-9a-f-]{36}$/i;
      const propertyIds = Array.isArray(body.propertyIds)
        ? [...new Set(body.propertyIds.filter((value: unknown): value is string => typeof value === "string" && idPattern.test(value)))].slice(0, 3)
        : [];
      if (!propertyIds.length) return NextResponse.json({ error: "Selecione de um a três imóveis." }, { status: 400 });
      const { data: properties, error: propertyError } = await admin
        .from("properties")
        .select("id,title,status")
        .eq("organization_id", identity.organizationId)
        .in("id", propertyIds);
      if (propertyError || properties?.length !== propertyIds.length) return NextResponse.json({ error: "Um ou mais imóveis não pertencem ao portfólio acessível." }, { status: 400 });
      const channel = body.channel === "email" ? "email" : "whatsapp";
      const titles = propertyIds.map((propertyId) => properties.find((property) => property.id === propertyId)?.title || "Imóvel sem título");
      const { data, error } = await admin.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: id,
        user_id: identity.userId,
        title: `Apresentação de ${properties.length} ${properties.length === 1 ? "imóvel" : "imóveis"}`,
        description: `Opções apresentadas via ${channel}: ${titles.join(", ")}.`,
        type: "property_presentation",
        metadata: { propertyIds, channel, source: "ai_matching_studio", requiresHumanApproval: true },
        occurred_at: new Date().toISOString(),
      }).select("id,title,description,type,occurred_at").single();
      if (error) return NextResponse.json({ error: "Não foi possível registrar a apresentação." }, { status: 400 });
      return NextResponse.json({ activity: data }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    logger.warn("lead.intelligence.action_failed", { error: error instanceof Error ? error.message : String(error) });
    return unauthorized(error);
  }
}

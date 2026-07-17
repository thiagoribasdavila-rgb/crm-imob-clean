import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";
import { recordFollowUpIntelligence } from "@/lib/atlas/follow-up-intelligence";
import { isPropertyAvailable } from "@/lib/atlas/property-availability";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized(error: unknown) {
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const admin = getSupabaseAdmin();

    const leadResult = await identity.supabase.from("leads").select("*").eq("id", id).eq("organization_id", identity.organizationId).maybeSingle();
    if (leadResult.error || !leadResult.data) {
      return NextResponse.json({ error: "Lead fora do seu escopo comercial." }, { status: 403 });
    }

    const [activityResult, propertyResult, opportunityResult, experienceResult] = await Promise.all([
      identity.supabase.from("activities").select("id,title,description,type,metadata,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(100),
      admin.from("properties").select("id,title,price,city,state,bedrooms,bathrooms,parking_spaces,area,status").eq("organization_id", identity.organizationId).limit(150),
      identity.supabase.from("opportunities").select("id,stage,value,probability,expected_close_at,property_id,created_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(20),
      identity.supabase.from("lead_experience_signals").select("id,signal_type,severity,confidence,evidence,recommendation,suggested_reply,status,created_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(20),
    ]);

    return NextResponse.json({
      lead: leadResult.data,
      activities: activityResult.data ?? [],
      properties: propertyResult.data ?? [],
      opportunities: opportunityResult.data ?? [],
      experienceSignals: experienceResult.data ?? [],
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
    const { data: currentLead } = await admin.from("leads").select("status").eq("id", id).eq("organization_id", identity.organizationId).single();
    if (!currentLead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });
    const followUpDescription = String(body.notes || "").trim().slice(0, 4000);
    if (body.status === "comprou_outro" && followUpDescription.length < 10) return NextResponse.json({ error: "Descreva o acompanhamento da compra em outro lugar no campo de observações." }, { status: 400 });

    const allowed = {
      name: body.name ?? null,
      email: body.email || null,
      phone: body.phone || null,
      source: body.source || null,
      status: body.status || currentLead.status || "novo",
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

    await Promise.allSettled([recordFunnelLearning({ organizationId: identity.organizationId, leadId: id, previousStage: currentLead.status || "novo", stage: data.status || "novo", occurredAt: allowed.updated_at, description: followUpDescription })]);

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

    const { data: lead } = await admin.from("leads").select("id,budget_max,source,metadata,created_at,last_interaction_at").eq("id", id).eq("organization_id", identity.organizationId).single();
    if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    if (body.action === "activity") {
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim().slice(0, 4000);
      if (!title) return NextResponse.json({ error: "Informe a atividade." }, { status: 400 });
      const occurredAt = new Date().toISOString();
      const { data, error } = await admin.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: id,
        user_id: identity.userId,
        title,
        description: description || null,
        type: body.type || "note",
        occurred_at: occurredAt,
      }).select("id,title,description,type,occurred_at").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      const firstResponse = !lead.last_interaction_at;
      const meta = lead.metadata && typeof lead.metadata === "object" ? (lead.metadata as { meta?: Record<string, unknown> }).meta || {} : {};
      const responseMinutes = lead.created_at ? Math.max(0, Math.round((new Date(occurredAt).getTime() - new Date(lead.created_at).getTime()) / 60_000)) : null;
      await Promise.allSettled([
        admin.from("leads").update({ last_interaction_at: occurredAt, next_action_at: null, updated_at: occurredAt }).eq("id", id).eq("organization_id", identity.organizationId),
        recordFollowUpIntelligence({ organizationId: identity.organizationId, leadId: id, activityId: data.id, description, occurredAt: data.occurred_at }),
        ...(firstResponse && lead.source === "Meta Lead Ads" ? [admin.from("campaign_events").upsert({ organization_id: identity.organizationId, lead_id: id, event_type: "first_response", source: "crm-response", external_event_id: `first-response-${id}`, payload: { response_minutes: responseMinutes, campaign_id: meta.campaignId || null }, occurred_at: occurredAt }, { onConflict: "organization_id,source,external_event_id", ignoreDuplicates: true })] : []),
      ]);
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
      if (properties.some((property) => !isPropertyAvailable(property.status))) return NextResponse.json({ error: "O estoque mudou. Atualize a seleção e remova unidades indisponíveis." }, { status: 409 });
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

    if (body.action === "property_feedback") {
      const propertyId = typeof body.propertyId === "string" && /^[0-9a-f-]{36}$/i.test(body.propertyId) ? body.propertyId : null;
      const signal = body.signal === "interested" || body.signal === "rejected" ? body.signal : null;
      if (!propertyId || !signal) return NextResponse.json({ error: "Retorno de imóvel inválido." }, { status: 400 });
      const { data: property } = await admin.from("properties").select("id,title").eq("id", propertyId).eq("organization_id", identity.organizationId).maybeSingle();
      if (!property) return NextResponse.json({ error: "Imóvel fora do portfólio acessível." }, { status: 404 });
      const interested = signal === "interested";
      const { data, error } = await admin.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: id,
        user_id: identity.userId,
        title: interested ? "Cliente demonstrou interesse" : "Imóvel sem aderência para o cliente",
        description: `${property.title || "Imóvel"}: ${interested ? "manter entre as prioridades" : "não reapresentar sem mudança de contexto"}.`,
        type: "property_feedback",
        metadata: { propertyId, signal, source: "ai_matching_studio" },
        occurred_at: new Date().toISOString(),
      }).select("id,title,description,type,metadata,occurred_at").single();
      if (error) return NextResponse.json({ error: "Não foi possível registrar o retorno." }, { status: 400 });
      return NextResponse.json({ activity: data }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    logger.warn("lead.intelligence.action_failed", { error: error instanceof Error ? error.message : String(error) });
    return unauthorized(error);
  }
}

import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";
import { recordFollowUpIntelligence } from "@/lib/atlas/follow-up-intelligence";
import { isPropertyAvailable } from "@/lib/atlas/property-availability";
import { assessLeadCompleteness } from "@/lib/ai/data-completeness";

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

    const [activityResult, propertyResult, opportunityResult, experienceResult, conversationResult, taskResult, campaignResult, sourceMemoryResult] = await Promise.all([
      identity.supabase.from("activities").select("id,user_id,title,description,type,metadata,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(100),
      admin.from("properties").select("id,title,price,city,state,bedrooms,bathrooms,parking_spaces,area,status").eq("organization_id", identity.organizationId).limit(150),
      identity.supabase.from("opportunities").select("id,stage,value,probability,expected_close_at,property_id,created_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(20),
      identity.supabase.from("lead_experience_signals").select("id,signal_type,severity,confidence,evidence,recommendation,suggested_reply,status,created_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(20),
      identity.supabase.from("conversations").select("id,status,channel,last_message_at,unread_count").eq("lead_id", id).eq("organization_id", identity.organizationId).order("last_message_at", { ascending: false }).limit(50),
      identity.supabase.from("tasks").select("id,status,due_at,priority").eq("lead_id", id).eq("organization_id", identity.organizationId).limit(100),
      identity.supabase.from("campaign_events").select("id,event_type,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(100),
      identity.supabase.from("lead_source_memories").select("id,source_file,source_sheet,source_row,commercial_facts,excluded_sensitive_fields,memory_role,created_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(100),
    ]);

    const lead = leadResult.data;
    const conversationIds = (conversationResult.data ?? []).map((conversation) => conversation.id);
    const [ownerResult, developmentResult, campaignLookupResult, messageResult] = await Promise.all([
      lead.assigned_to ? admin.from("profiles").select("id,full_name,commercial_role,role").eq("id", lead.assigned_to).eq("organization_id", identity.organizationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      lead.development_id ? admin.from("developments").select("id,name,developer_name,status,city").eq("id", lead.development_id).eq("organization_id", identity.organizationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      lead.campaign_id ? admin.from("campaigns").select("id,name,channel,status").eq("id", lead.campaign_id).eq("organization_id", identity.organizationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      conversationIds.length ? identity.supabase.from("messages").select("id,conversation_id,direction,channel,status,created_at").eq("organization_id", identity.organizationId).in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
    ]);
    const completeness = assessLeadCompleteness(lead, (activityResult.data?.length ?? 0) > 0);
    const fields = completeness.fields;
    const inconsistencies = [
      lead.budget_min != null && lead.budget_max != null && Number(lead.budget_min) > Number(lead.budget_max) ? "Orçamento mínimo maior que o máximo" : null,
      lead.status === "ganho" && !(opportunityResult.data ?? []).some((item) => item.stage === "ganho") ? "Lead ganho sem oportunidade ganha vinculada" : null,
      !lead.phone && !lead.email ? "Cliente sem canal de contato" : null,
    ].filter((value): value is string => Boolean(value));
    const completedFields = completeness.completedFields;
    const activityUserIds = [...new Set((activityResult.data ?? []).map((item) => item.user_id).filter((value): value is string => Boolean(value)))];
    const { data: activityUsers } = activityUserIds.length ? await admin.from("profiles").select("id,full_name").eq("organization_id", identity.organizationId).in("id", activityUserIds) : { data: [] as Array<{ id: string; full_name: string | null }> };
    const activityUserMap = new Map((activityUsers ?? []).map((profile) => [profile.id, profile.full_name || "Equipe Atlas"]));
    const activities = (activityResult.data ?? []).map((activity) => ({ ...activity, authorName: activity.user_id ? activityUserMap.get(activity.user_id) || "Equipe Atlas" : "Automação Atlas" }));
    const openTasks = (taskResult.data ?? []).filter((task) => !["done", "concluida", "completed", "cancelado"].includes(String(task.status || "").toLowerCase()));
    const unreadMessages = (conversationResult.data ?? []).reduce((total, conversation) => total + Number(conversation.unread_count || 0), 0);
    const activeOpportunities = (opportunityResult.data ?? []).filter((opportunity) => !["ganho", "perdido", "won", "lost"].includes(String(opportunity.stage || "").toLowerCase()));
    const briefingActions = [
      unreadMessages ? `Responder ${unreadMessages} ${unreadMessages === 1 ? "mensagem pendente" : "mensagens pendentes"}.` : null,
      inconsistencies[0] ? `Revisar: ${inconsistencies[0]}.` : null,
      fields.find((field) => !field.complete) ? `Confirmar ${fields.find((field) => !field.complete)!.label}.` : null,
      openTasks[0]?.due_at ? `Concluir a próxima tarefa prevista para ${new Date(openTasks[0].due_at).toLocaleDateString("pt-BR")}.` : null,
    ].filter((value): value is string => Boolean(value)).slice(0, 3);

    return NextResponse.json({
      lead,
      activities,
      properties: propertyResult.data ?? [],
      opportunities: opportunityResult.data ?? [],
      experienceSignals: experienceResult.data ?? [],
      unifiedProfile: { conversations: conversationResult.data ?? [], tasks: taskResult.data ?? [], campaignEvents: campaignResult.data ?? [], historicalMemories: sourceMemoryResult.data ?? [], sources: ["CRM", ...(sourceMemoryResult.data?.length ? ["Bases históricas"] : []), ...(conversationResult.data?.length ? ["Atendimento"] : []), ...(campaignResult.data?.length ? ["Marketing"] : []), ...(opportunityResult.data?.length ? ["Vendas"] : [])] },
      relationshipContext: { owner: ownerResult.data, development: developmentResult.data, campaign: campaignLookupResult.data, communications: { conversations: conversationResult.data?.length ?? 0, messages: messageResult.data?.length ?? 0, inbound: (messageResult.data ?? []).filter((message) => message.direction === "inbound").length, outbound: (messageResult.data ?? []).filter((message) => message.direction === "outbound").length, unread: unreadMessages, channels: [...new Set((messageResult.data ?? []).map((message) => message.channel).filter(Boolean))], lastMessageAt: messageResult.data?.[0]?.created_at || null }, origin: { source: lead.source || "Não informada", createdAt: lead.created_at, campaignEvents: campaignResult.data?.length ?? 0, historicalMemories: sourceMemoryResult.data?.length ?? 0 } },
      dataQuality: { completeness: completeness.completeness, completedFields, totalFields: completeness.totalFields, missing: fields.filter((field) => !field.complete).map(({ key, label }) => ({ key, label })), inconsistencies, status: inconsistencies.length ? "review" : completedFields === completeness.totalFields ? "complete" : "enrich", recommendation: inconsistencies[0] || completeness.nextQuestion?.question || "Perfil consistente e pronto para personalização.", nextQuestion: completeness.nextQuestion, questions: completeness.questions, calculation: "weighted_commercial_completeness_v1" },
      contactBriefing: { unreadMessages, openTasks: openTasks.length, activeOpportunities: activeOpportunities.length, lastInteractionAt: activities[0]?.occurred_at || null, context: activities[0]?.description || activities[0]?.title || "Ainda não há interação registrada com este cliente.", actions: briefingActions.length ? briefingActions : ["Validar interesse atual e combinar a próxima ação com data."], generatedBy: "Atlas Intelligence local", requiresApproval: true },
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
      const reasons: Record<string, string> = { price: "preço", location: "localização", typology: "tipologia", payment: "condição de pagamento", delivery: "prazo de entrega", product: "produto ou diferenciais", other: "outro motivo" };
      const reason = typeof body.reason === "string" && body.reason in reasons ? body.reason : null;
      if (!propertyId || !signal || (signal === "rejected" && !reason)) return NextResponse.json({ error: "Retorno inválido. Informe o principal motivo da não aderência." }, { status: 400 });
      const { data: property } = await admin.from("properties").select("id,title").eq("id", propertyId).eq("organization_id", identity.organizationId).maybeSingle();
      if (!property) return NextResponse.json({ error: "Imóvel fora do portfólio acessível." }, { status: 404 });
      const { data: presentation } = await admin.from("activities").select("id").eq("organization_id", identity.organizationId).eq("lead_id", id).eq("type", "property_presentation").contains("metadata", { propertyIds: [propertyId] }).limit(1).maybeSingle();
      if (!presentation) return NextResponse.json({ error: "Registre a apresentação deste imóvel antes do retorno do cliente." }, { status: 409 });
      const interested = signal === "interested";
      const { data, error } = await admin.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: id,
        user_id: identity.userId,
        title: interested ? "Cliente demonstrou interesse" : "Imóvel sem aderência para o cliente",
        description: `${property.title || "Imóvel"}: ${interested ? "manter entre as prioridades" : `não aderiu por ${reasons[reason!]}`}.`,
        type: "property_feedback",
        metadata: { propertyId, signal, reason, source: "ai_matching_studio" },
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

import { NextResponse } from "next/server";
import { assessLeadCompleteness } from "@/lib/ai/data-completeness";
import {
  buildGovernedLeadContextAuditMetadata,
  normalizeCommercialContextText,
  normalizeCommercialProjectId,
  sameGovernedLeadCommercialContext,
  validateGovernedLeadContextCorrection,
} from "@/lib/atlas/governed-lead-context-correction";
import { LIVE_LEAD_SELECT, canonicalLeadStatus, mapLegacyLead, mapLegacyProfile } from "@/lib/compat/legacy-v2";
import { liveLeadUpdatePayload, mapLiveLeadEvent, recordLiveLeadEvent } from "@/lib/compat/live-writes";
import { computeAttentionSignalsForLead } from "@/lib/atlas/attention-signals";
import { logger } from "@/lib/observability/logger";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type JsonRow = Record<string, unknown>;

function requestError(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  const status = /sessão|token|autenticação/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

function completenessInput(lead: JsonRow) {
  return {
    name: typeof lead.name === "string" ? lead.name : null,
    phone: typeof lead.phone === "string" ? lead.phone : null,
    email: typeof lead.email === "string" ? lead.email : null,
    purpose: typeof lead.purpose === "string" ? lead.purpose : null,
    budget_min: typeof lead.budget_min === "number" ? lead.budget_min : null,
    budget_max: typeof lead.budget_max === "number" ? lead.budget_max : null,
    preferred_regions: Array.isArray(lead.preferred_regions) ? lead.preferred_regions.map(String) : [],
    bedrooms: typeof lead.bedrooms === "number" ? lead.bedrooms : null,
    development_id: typeof lead.development_id === "string" ? lead.development_id : null,
    next_action_at: typeof lead.next_action_at === "string" ? lead.next_action_at : null,
    metadata: lead.metadata,
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const admin = getSupabaseAdmin();

    const { data: storedLead, error: leadError } = await admin
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .maybeSingle();
    if (leadError || !storedLead) return NextResponse.json({ error: "Lead fora do seu escopo comercial." }, { status: 403 });

    const lead = mapLegacyLead(storedLead as unknown as JsonRow);
    const [eventResult, taskResult, ownerResult, projectResult, projectOptionsResult] = await Promise.all([
      admin
        .from("lead_events")
        .select("id,lead_id,event_type,type,description,metadata,created_by,created_at")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("tasks")
        .select("id,title,description,status,due_date,priority,user_id,created_at")
        .eq("lead_id", id)
        .eq("organization_id", identity.organizationId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(100),
      lead.assigned_to
        ? admin.from("profiles").select("id,name,role,team").eq("id", lead.assigned_to).eq("organization_id", identity.organizationId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      lead.development_id
        ? admin.from("crm_projects").select("id,name,developer_name,status,city").eq("id", lead.development_id).eq("organization_id", identity.organizationId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin
        .from("crm_projects")
        .select("id,name,developer_name,status,city")
        .eq("organization_id", identity.organizationId)
        .order("name", { ascending: true })
        .limit(500),
    ]);

    const eventRows = (eventResult.data ?? []) as JsonRow[];
    const authorIds = [...new Set(eventRows.map((row) => String(row.created_by || "")).filter(Boolean))];
    const { data: authors } = authorIds.length
      ? await admin.from("profiles").select("id,name").eq("organization_id", identity.organizationId).in("id", authorIds)
      : { data: [] as Array<{ id: string; name: string | null }> };
    const authorNames = new Map((authors ?? []).map((profile) => [profile.id, profile.name || "Equipe Atlas"]));
    const activities = eventRows.map((row) => ({
      ...mapLiveLeadEvent(row),
      authorName: row.created_by ? authorNames.get(String(row.created_by)) || "Equipe Atlas" : "Automação Atlas",
    }));
    const tasks = (taskResult.data ?? []).map((task) => ({
      ...task,
      due_at: task.due_date ?? task.created_at ?? null,
      assigned_to: task.user_id ?? null,
    }));
    const openTasks = tasks.filter((task) => !["done", "concluida", "concluído", "completed", "cancelado"].includes(String(task.status || "").toLowerCase()));
    const completeness = assessLeadCompleteness(completenessInput(lead), activities.length > 0);
    const inconsistencies = [
      lead.budget_min != null && lead.budget_max != null && Number(lead.budget_min) > Number(lead.budget_max) ? "Orçamento mínimo maior que o máximo" : null,
      !lead.phone && !lead.email ? "Cliente sem canal de contato" : null,
    ].filter((value): value is string => Boolean(value));
    const missing = completeness.fields.filter((field) => !field.complete).map(({ key, label }) => ({ key, label }));
    const owner = ownerResult.data ? mapLegacyProfile(ownerResult.data as JsonRow) : null;
    const project = projectResult.data ?? null;
    const nextTask = openTasks[0];
    const nextAction = typeof lead.next_action_label === "string" ? lead.next_action_label : "Validar interesse atual e combinar a próxima ação com data.";

    // Fase 100 · Sinais de atenção proativos para este lead específico (etapa
    // parada, follow-up vencido, quente sem contato recente). Mesma função
    // usada em broker-daily e no contexto do Copilot — nada duplicado aqui.
    const attentionSignals = await computeAttentionSignalsForLead(admin, identity.organizationId, {
      id: String(lead.id),
      status: String(lead.status || "novo"),
      score: Number(lead.score || 0),
      temperature: typeof lead.temperature === "string" ? lead.temperature : null,
      createdAt: typeof lead.created_at === "string" ? lead.created_at : null,
    });

    return NextResponse.json({
      lead,
      activities,
      properties: [],
      opportunities: [],
      experienceSignals: [],
      attentionSignals: attentionSignals.map((signal) => ({
        kind: signal.kind,
        severity: signal.severity,
        reason: signal.reason,
        detail: signal.detail,
        since: signal.since,
        metric: signal.metric,
      })),
      proposals: [],
      unifiedProfile: {
        conversations: [],
        tasks,
        campaignEvents: [],
        historicalMemories: [],
        sources: ["CRM", ...(lead.import_batch_id ? ["Base histórica"] : []), ...(activities.length ? ["Histórico comercial"] : [])],
      },
      relationshipContext: {
        owner,
        development: project,
        campaign: null,
        communications: { conversations: 0, messages: 0, inbound: 0, outbound: 0, unread: 0, channels: [], lastMessageAt: null },
        origin: { source: lead.source || "Não informada", createdAt: lead.created_at || null, campaignEvents: 0, historicalMemories: lead.import_batch_id ? 1 : 0 },
      },
      dataQuality: {
        completeness: completeness.completeness,
        completedFields: completeness.completedFields,
        totalFields: completeness.totalFields,
        missing,
        inconsistencies,
        status: inconsistencies.length ? "review" : completeness.completedFields === completeness.totalFields ? "complete" : "enrich",
        recommendation: inconsistencies[0] || completeness.nextQuestion?.question || "Perfil consistente e pronto para personalização.",
        nextQuestion: completeness.nextQuestion,
        questions: completeness.questions,
        calculation: "weighted_commercial_completeness_live_v2",
      },
      contactBriefing: {
        unreadMessages: 0,
        openTasks: openTasks.length,
        activeOpportunities: 0,
        lastInteractionAt: activities[0]?.occurred_at || lead.last_interaction_at || null,
        context: activities[0]?.description || activities[0]?.title || "Ainda não há interação registrada com este cliente.",
        actions: [nextTask?.due_at ? `Concluir a próxima tarefa prevista para ${new Date(String(nextTask.due_at)).toLocaleDateString("pt-BR")}.` : null, nextAction].filter((value): value is string => Boolean(value)).slice(0, 3),
        generatedBy: "Atlas Intelligence local",
        requiresApproval: true,
      },
      assignmentReservation: null,
      projectOptions: projectOptionsResult.data ?? [],
      compatibility: { source: "live_v2", history: "lead_events", projects: "crm_projects" },
    });
  } catch (error) {
    logger.warn("lead.intelligence.read_failed", { error: error instanceof Error ? error.message : String(error) });
    return requestError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json() as JsonRow;
    const admin = getSupabaseAdmin();
    const { data: currentLead } = await admin
      .from("leads")
      .select("status,source")
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .maybeSingle();
    if (!currentLead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const nextStatus = canonicalLeadStatus(body.status || currentLead.status);
    const notes = String(body.notes || "").trim();
    if (nextStatus === "comprou_outro" && notes.length < 10) {
      return NextResponse.json({ error: "Descreva o acompanhamento da compra em outro lugar no campo de observações." }, { status: 400 });
    }
    const update = liveLeadUpdatePayload(
      { ...body, source: currentLead.source, status: nextStatus },
      currentLead.status,
    );
    if (!update.name || String(update.name).length < 2) return NextResponse.json({ error: "Informe um nome válido." }, { status: 400 });
    if (!update.phone && !update.email) return NextResponse.json({ error: "Informe pelo menos telefone ou e-mail." }, { status: 400 });
    if (update.budget_min != null && update.budget_max != null && update.budget_min > update.budget_max) {
      return NextResponse.json({ error: "O orçamento mínimo não pode superar o máximo." }, { status: 400 });
    }

    const { data: stored, error } = await admin
      .from("leads")
      .update(update)
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .select(LIVE_LEAD_SELECT)
      .single();
    if (error || !stored) return NextResponse.json({ error: "Não foi possível salvar este lead agora." }, { status: 400 });
    const lead = mapLegacyLead(stored as unknown as JsonRow);
    const event = await recordLiveLeadEvent(admin, {
      organizationId: identity.organizationId,
      leadId: id,
      actorId: identity.userId,
      type: "lead_updated",
      title: "Dados do lead atualizados",
      description: "Perfil comercial revisado no Lead 360.",
      metadata: { previousStatus: canonicalLeadStatus(currentLead.status), status: lead.status },
    });
    if (event.error) logger.warn("lead.update_event_failed", { leadId: id, message: event.error.message });
    return NextResponse.json({ lead });
  } catch (error) {
    logger.warn("lead.intelligence.update_failed", { error: error instanceof Error ? error.message : String(error) });
    return requestError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json() as JsonRow;
    const admin = getSupabaseAdmin();
    const { data: lead } = await admin
      .from("leads")
      .select("id,name,status,assigned_user_id,project_id,source")
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .maybeSingle();
    if (!lead) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    if (body.action === "correct_commercial_context") {
      const hasExpectedProject = Object.prototype.hasOwnProperty.call(body, "expectedProjectId");
      const hasExpectedSource = Object.prototype.hasOwnProperty.call(body, "expectedSource");
      if (!hasExpectedProject || !hasExpectedSource) {
        return NextResponse.json({
          code: "LEAD_CONTEXT_EXPECTATION_REQUIRED",
          error: "Recarregue a Lead 360 antes de corrigir projeto ou origem.",
        }, { status: 409 });
      }

      const validated = validateGovernedLeadContextCorrection({
        projectId: body.projectId,
        source: body.source,
        reason: body.reason,
        humanConfirmed: body.humanConfirmed,
      });
      if (!validated.ok) {
        return NextResponse.json({ code: "LEAD_CONTEXT_CORRECTION_INVALID", error: validated.error }, { status: 422 });
      }

      const currentContext = {
        projectId: normalizeCommercialProjectId(lead.project_id),
        source: normalizeCommercialContextText(lead.source),
      };
      const expectedContext = {
        projectId: normalizeCommercialProjectId(body.expectedProjectId),
        source: normalizeCommercialContextText(body.expectedSource),
      };
      if (!sameGovernedLeadCommercialContext(currentContext, expectedContext)) {
        return NextResponse.json({
          code: "LEAD_CONTEXT_CORRECTION_CONFLICT",
          error: "Projeto ou origem mudou desde a última leitura. Revise os valores atuais antes de confirmar.",
          currentContext,
        }, { status: 409 });
      }

      const nextContext = {
        projectId: validated.correction.projectId,
        source: validated.correction.source,
      };
      const projectIds = [...new Set([currentContext.projectId, nextContext.projectId].filter((value): value is string => Boolean(value)))];
      const { data: contextProjects, error: projectLookupError } = projectIds.length
        ? await admin
          .from("crm_projects")
          .select("id,name,developer_name,status,city")
          .eq("organization_id", identity.organizationId)
          .in("id", projectIds)
        : { data: [], error: null };
      if (projectLookupError) {
        return NextResponse.json({ error: "Não foi possível validar os projetos desta organização." }, { status: 503 });
      }
      const projectMap = new Map((contextProjects ?? []).map((project) => [project.id, project]));
      if (nextContext.projectId && !projectMap.has(nextContext.projectId)) {
        return NextResponse.json({ code: "LEAD_CONTEXT_PROJECT_OUT_OF_SCOPE", error: "O projeto selecionado não pertence a esta organização." }, { status: 422 });
      }

      if (sameGovernedLeadCommercialContext(currentContext, nextContext)) {
        return NextResponse.json({
          lead: mapLegacyLead(lead as unknown as JsonRow),
          context: {
            ...currentContext,
            project: currentContext.projectId ? projectMap.get(currentContext.projectId) ?? null : null,
          },
          unchanged: true,
        });
      }

      let updateQuery = admin
        .from("leads")
        .update({ project_id: nextContext.projectId, source: nextContext.source })
        .eq("id", id)
        .eq("organization_id", identity.organizationId);
      updateQuery = lead.project_id
        ? updateQuery.eq("project_id", lead.project_id)
        : updateQuery.is("project_id", null);
      updateQuery = lead.source
        ? updateQuery.eq("source", lead.source)
        : updateQuery.is("source", null);
      const { data: correctedLead, error: updateError } = await updateQuery
        .select(LIVE_LEAD_SELECT)
        .maybeSingle();
      if (updateError) {
        return NextResponse.json({ error: "Não foi possível corrigir o contexto comercial agora." }, { status: 400 });
      }
      if (!correctedLead) {
        const { data: latest } = await admin
          .from("leads")
          .select("project_id,source")
          .eq("id", id)
          .eq("organization_id", identity.organizationId)
          .maybeSingle();
        return NextResponse.json({
          code: "LEAD_CONTEXT_CORRECTION_CONFLICT",
          error: "Projeto ou origem mudou durante a correção. Recarregue e confirme novamente.",
          currentContext: {
            projectId: normalizeCommercialProjectId(latest?.project_id),
            source: normalizeCommercialContextText(latest?.source),
          },
        }, { status: 409 });
      }

      const previousProject = currentContext.projectId ? projectMap.get(currentContext.projectId) ?? null : null;
      const currentProject = nextContext.projectId ? projectMap.get(nextContext.projectId) ?? null : null;
      const auditEvent = await recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId: id,
        actorId: identity.userId,
        type: "commercial_context_corrected",
        title: "Projeto e origem revisados",
        description: validated.correction.reason,
        metadata: buildGovernedLeadContextAuditMetadata({
          previous: { ...currentContext, projectName: previousProject?.name ?? null },
          current: { ...nextContext, projectName: currentProject?.name ?? null },
          reason: validated.correction.reason,
        }),
      });
      if (auditEvent.error) {
        let rollbackQuery = admin
          .from("leads")
          .update({ project_id: lead.project_id ?? null, source: lead.source ?? null })
          .eq("id", id)
          .eq("organization_id", identity.organizationId);
        rollbackQuery = nextContext.projectId
          ? rollbackQuery.eq("project_id", nextContext.projectId)
          : rollbackQuery.is("project_id", null);
        rollbackQuery = nextContext.source
          ? rollbackQuery.eq("source", nextContext.source)
          : rollbackQuery.is("source", null);
        const { error: rollbackError } = await rollbackQuery;
        logger.error("lead.context_correction_audit_failed", auditEvent.error, {
          leadId: id,
          auditError: auditEvent.error.message,
          rollbackError: rollbackError?.message ?? null,
        });
        return NextResponse.json({
          code: rollbackError ? "LEAD_CONTEXT_AUDIT_RECOVERY_REQUIRED" : "LEAD_CONTEXT_AUDIT_FAILED",
          error: rollbackError
            ? "A correção exige revisão administrativa. Nenhuma nova tentativa deve ser feita agora."
            : "A auditoria não pôde ser registrada; a alteração foi desfeita com segurança.",
        }, { status: rollbackError ? 500 : 503 });
      }

      logger.info("lead.context_corrected", {
        leadId: id,
        actorId: identity.userId,
        projectChanged: currentContext.projectId !== nextContext.projectId,
        sourceChanged: currentContext.source !== nextContext.source,
      });
      return NextResponse.json({
        lead: mapLegacyLead(correctedLead as unknown as JsonRow),
        context: { ...nextContext, project: currentProject },
        auditEventId: auditEvent.data?.id ?? null,
        policy: { historicalSnapshotsRewritten: false, automaticFill: false, humanConfirmed: true },
      });
    }

    if (body.action === "activity") {
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim().slice(0, 4000);
      if (!title) return NextResponse.json({ error: "Informe a atividade." }, { status: 400 });
      const event = await recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId: id,
        actorId: identity.userId,
        type: String(body.type || "note"),
        title,
        description: description || null,
      });
      if (event.error || !event.data) return NextResponse.json({ error: "Não foi possível registrar a interação." }, { status: 400 });
      return NextResponse.json({ activity: mapLiveLeadEvent(event.data as JsonRow) }, { status: 201 });
    }

    if (body.action === "accept_assignment") {
      if (lead.assigned_user_id && lead.assigned_user_id !== identity.userId) {
        return NextResponse.json({ error: "Esta lead já possui um responsável. Solicite a transferência ao gestor." }, { status: 409 });
      }
      if (!lead.assigned_user_id) {
        await admin.from("leads").update({ assigned_user_id: identity.userId }).eq("id", id).eq("organization_id", identity.organizationId).is("assigned_user_id", null);
      }
      await recordLiveLeadEvent(admin, { organizationId: identity.organizationId, leadId: id, actorId: identity.userId, type: "assignment_accepted", title: "Responsabilidade aceita", description: "Lead assumida pelo corretor no Atlas." });
      return NextResponse.json({ reservation: { lead_id: id, broker_id: identity.userId, status: "accepted", accepted_at: new Date().toISOString() } });
    }

    if (body.action === "opportunity") {
      const previousStatus = canonicalLeadStatus(lead.status);
      const status = previousStatus === "novo" ? "qualificacao" : previousStatus;
      const { data: stored, error } = await admin
        .from("leads")
        .update({ status })
        .eq("id", id)
        .eq("organization_id", identity.organizationId)
        .select("id,status,budget_max,created_at")
        .single();
      if (error || !stored) return NextResponse.json({ error: "Não foi possível abrir a oportunidade." }, { status: 400 });
      await recordLiveLeadEvent(admin, { organizationId: identity.organizationId, leadId: id, actorId: identity.userId, type: "opportunity_opened", title: "Oportunidade aberta", description: "Lead promovida para acompanhamento no pipeline.", metadata: { previousStatus, status } });
      return NextResponse.json({ opportunity: { id: stored.id, lead_id: stored.id, stage: canonicalLeadStatus(stored.status), value: stored.budget_max ?? null, probability: 25, property_id: null, created_at: stored.created_at } }, { status: 201 });
    }

    return NextResponse.json({ error: "Este recurso ainda não está conectado à base atual. Nenhum dado foi alterado." }, { status: 503 });
  } catch (error) {
    logger.warn("lead.intelligence.action_failed", { error: error instanceof Error ? error.message : String(error) });
    return requestError(error);
  }
}

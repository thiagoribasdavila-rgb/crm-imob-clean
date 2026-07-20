import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";
import { canonicalPipelineStage, mergePipelineStageSettings } from "@/lib/atlas/pipeline-stages";
import { LIVE_LEAD_SELECT, mapLegacyLead } from "@/lib/compat/legacy-v2";
import { recordLiveLeadEvent } from "@/lib/compat/live-writes";
import { readCompatiblePipeline } from "@/lib/atlas/core-v2/live-repositories";
import { DISCARD_REASON_KEYS, DISCARD_TAXONOMY_VERSION, getDiscardReason } from "@/lib/atlas/discard-reasons";

export const dynamic = "force-dynamic";

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação|organização/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    const compatiblePipeline = await readCompatiblePipeline(identity.supabase, {
      organizationId: identity.organizationId,
      limit: 500,
    });
    if (!compatiblePipeline.ok) throw new Error(compatiblePipeline.error.code);

    let settings: Array<{ stage_key?: string; label?: string; probability?: number; position?: number; visible?: boolean }> = [];
    let stageSettingsSource = "canonical-defaults";
    if (process.env.ATLAS_PIPELINE_STAGE_SETTINGS_ENABLED === "true") {
      const stageSettings = await identity.supabase.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", identity.organizationId);
      if (!stageSettings.error) {
        settings = stageSettings.data ?? [];
        stageSettingsSource = "organization-settings";
      } else logger.warn("pipeline.stage_settings_unavailable", { organizationId: identity.organizationId, message: stageSettings.error.message });
    }
    const role = identity.commercialRole || identity.role;
    const leads = compatiblePipeline.rows.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return NextResponse.json({
      leads,
      stages: mergePipelineStageSettings(settings),
      stageContract: "canonical-v1",
      stageSettingsSource,
      compatibility: compatiblePipeline.compatibility,
      pagination: {
        loaded: leads.length,
        totalOperational: compatiblePipeline.count,
        archivedMemoryExcluded: true,
        limit: 500,
      },
      canConfigureStages: ["admin", "director", "superintendent"].includes(String(role || "")),
    });
  } catch (error) {
    logger.warn("pipeline.read_failed", { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : "";
    if (!/sessão|token|autenticação|organização|escopo/i.test(message)) return NextResponse.json({ error: "Pipeline temporariamente indisponível. O Atlas registrou o problema. Tente novamente." }, { status: 503 });
    return authError(error);
  }
}

export async function PATCH(request: Request) {
  const rate = checkRateLimit(clientKey(request, "v1-pipeline-move"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas movimentações em sequência." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = await request.json();
    const leadId = String(body.leadId || "");
    const stage = canonicalPipelineStage(body.stage);
    const expectedFromStage = canonicalPipelineStage(body.expectedFromStage);
    const reversalOf = typeof body.reversalOf === "string" && /^[0-9a-f-]{36}$/i.test(body.reversalOf) ? body.reversalOf : null;
    const followUpDescription = String(body.followUpDescription || "").trim().slice(0, 4000);
    const source = body.source === "atlas-copilot" ? "atlas-copilot" : "pipeline";
    const humanConfirmed = body.humanConfirmed === true;

    // Descarte estruturado (padrão Meta lead quality / Andromeda): ao mover
    // para o estágio de perda, o cliente PODE enviar
    // { discardReason: { key, notes? } }. O campo é OPCIONAL por
    // compatibilidade — a UI atual do Kanban ainda move para "perdido" sem
    // motivo; ele será tornado obrigatório na próxima onda, quando o seletor
    // de motivos entrar na UI. Chave enviada mas fora da taxonomia é 400,
    // para o vocabulário nunca divergir de lib/atlas/discard-reasons.ts.
    const discardInput = body.discardReason && typeof body.discardReason === "object" && !Array.isArray(body.discardReason)
      ? (body.discardReason as Record<string, unknown>)
      : null;
    const discardReason = stage === "perdido" && discardInput ? getDiscardReason(discardInput.key) : null;
    const discardNotes = discardInput && typeof discardInput.notes === "string" ? discardInput.notes.trim().slice(0, 2000) : "";

    if (!leadId || !stage || !expectedFromStage || (stage === "comprou_outro" && followUpDescription.length < 10)) {
      return NextResponse.json({ error: "Lead ou etapa inválida." }, { status: 400 });
    }
    if (stage === "perdido" && discardInput && !discardReason) {
      return NextResponse.json(
        {
          error: `Motivo de descarte inválido. Use uma das chaves: ${DISCARD_REASON_KEYS.join(", ")}.`,
          code: "INVALID_DISCARD_REASON",
          validKeys: DISCARD_REASON_KEYS,
        },
        { status: 400 },
      );
    }
    if (source === "atlas-copilot" && !humanConfirmed) {
      return NextResponse.json(
        {
          error: "A movimentação sugerida pelo Copilot exige confirmação humana explícita.",
          code: "COPILOT_PIPELINE_CONFIRMATION_REQUIRED",
        },
        { status: 400 },
      );
    }

    await requireLeadAccess(identity, leadId);

    const admin = getSupabaseAdmin();
    const { data: current } = await identity.supabase
      .from("leads")
      .select("id,name,status,organization_id")
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!current) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const previousStage = canonicalPipelineStage(current.status) || "novo";
    if (previousStage !== expectedFromStage) return NextResponse.json({ error: "A lead foi movimentada por outra pessoa. Atualize o Kanban antes de tentar novamente.", code: "PIPELINE_STAGE_CONFLICT", currentStage: previousStage }, { status: 409 });
    if (reversalOf) {
      const { data: reversibleMove, error: reversalError } = await admin
        .from("pipeline_history")
        .select("id,lead_id,old_status,new_status,changed_by,created_at")
        .eq("id", reversalOf)
        .eq("lead_id", leadId)
        .eq("organization_id", identity.organizationId)
        .maybeSingle();
      if (reversalError || !reversibleMove || canonicalPipelineStage(reversibleMove.new_status) !== previousStage || canonicalPipelineStage(reversibleMove.old_status) !== stage) {
        return NextResponse.json({ error: "A movimentação mudou e não pode mais ser desfeita sem atualizar o Kanban.", code: "PIPELINE_STAGE_CONFLICT" }, { status: 409 });
      }
    }

    // The live V2 database does not expose the planned move_pipeline_lead RPC.
    // We therefore use a compensating write: the stage is changed first and is
    // restored immediately if the mandatory audit row cannot be persisted.
    const { data: updated, error: updateError } = await admin
      .from("leads")
      .update({ status: stage })
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .eq("status", current.status)
      .select(LIVE_LEAD_SELECT)
      .maybeSingle();
    if (updateError || !updated) {
      return NextResponse.json({ error: "A oportunidade mudou em outra sessão. Atualize o Kanban e tente novamente.", code: "PIPELINE_STAGE_CONFLICT", currentStage: previousStage }, { status: 409 });
    }

    const occurredAt = new Date().toISOString();
    const { data: history, error: historyError } = await admin
      .from("pipeline_history")
      .insert({
        organization_id: identity.organizationId,
        lead_id: leadId,
        status: stage,
        old_status: previousStage,
        new_status: stage,
        changed_by: identity.userId,
        created_at: occurredAt,
      })
      .select("id,lead_id,old_status,new_status,changed_by,created_at")
      .single();

    if (historyError || !history) {
      const rollback = await admin
        .from("leads")
        .update({ status: current.status })
        .eq("id", leadId)
        .eq("organization_id", identity.organizationId)
        .eq("status", stage);
      logger.error("pipeline.history_failed", { leadId, stage, previousStage, rollbackError: rollback.error?.message, historyError: historyError?.message });
      return NextResponse.json({ error: "A movimentação não foi registrada e foi desfeita para proteger o histórico.", code: "PIPELINE_AUDIT_FAILED" }, { status: 503 });
    }

    const liveEventWrites = [
      recordLiveLeadEvent(admin, {
        organizationId: identity.organizationId,
        leadId,
        actorId: identity.userId,
        type: reversalOf ? "pipeline_move_reverted" : "pipeline_stage_changed",
        title: reversalOf ? "Movimentação desfeita" : "Etapa comercial atualizada",
        description: followUpDescription || `${previousStage} → ${stage}`,
        metadata: {
          fromStage: previousStage,
          toStage: stage,
          pipelineHistoryId: history.id,
          reversalOf,
          source,
          humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
        },
      }),
    ];
    // Evento estruturado de descarte: só quando o motivo veio e a movimentação
    // não é um desfazer (reversalOf) — desfazer não é um novo descarte. Vive no
    // mesmo Promise.allSettled best-effort: o audit crítico é pipeline_history;
    // falha aqui NÃO desfaz a movimentação (observabilidade no bloco abaixo,
    // mesmo padrão do commit 31328039).
    const shouldRecordDiscard = stage === "perdido" && discardReason !== null && !reversalOf;
    if (shouldRecordDiscard && discardReason) {
      liveEventWrites.push(
        recordLiveLeadEvent(admin, {
          organizationId: identity.organizationId,
          leadId,
          actorId: identity.userId,
          type: "lead_discarded",
          title: "Lead descartado",
          description: discardNotes || discardReason.label,
          metadata: {
            reasonKey: discardReason.key,
            reasonLabel: discardReason.label,
            metaLeadStatus: discardReason.metaLeadStatus,
            metaCategory: discardReason.metaCategory,
            decisionSignal: discardReason.decisionSignal,
            notes: discardNotes || null,
            fromStage: previousStage,
            source,
            campaignId: (updated as unknown as Record<string, unknown>).campaign_id ?? null,
            pipelineHistoryId: history.id,
            taxonomyVersion: DISCARD_TAXONOMY_VERSION,
          },
        }),
      );
    }
    const liveEventResults = await Promise.allSettled(liveEventWrites);
    if (shouldRecordDiscard) {
      const discardResult = liveEventResults[liveEventResults.length - 1];
      const discardError: unknown = discardResult.status === "rejected" ? discardResult.reason : discardResult.value.error;
      if (discardError) {
        logger.warn("pipeline.discard_event_failed", {
          organizationId: identity.organizationId,
          leadId,
          reasonKey: discardReason?.key,
          message: discardError instanceof Error
            ? discardError.message
            : typeof (discardError as { message?: unknown })?.message === "string"
              ? String((discardError as { message: string }).message)
              : String(discardError),
        });
      }
    }

    const data = mapLegacyLead(updated as unknown as Record<string, unknown>);
    await Promise.allSettled([recordFunnelLearning({ organizationId: identity.organizationId, leadId, previousStage, stage, occurredAt, description: followUpDescription })]);

    logger.info("pipeline.stage_changed", {
      leadId,
      previousStage,
      stage,
      organizationId: identity.organizationId,
      source,
      humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
      discardReason: discardReason?.key ?? null,
    });
    return NextResponse.json({
      lead: data,
      move: {
        moveId: history.id,
        fromStage: previousStage,
        toStage: stage,
        occurredAt,
        reversalOf,
        source,
        humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null,
        discardReason: discardReason?.key ?? null,
        auditSource: "pipeline_history",
        writeSafety: "compensating-write",
      },
    });
  } catch (error) {
    logger.warn("pipeline.move_failed", { error: error instanceof Error ? error.message : String(error) });
    return authError(error);
  }
}

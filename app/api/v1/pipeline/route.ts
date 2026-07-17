import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";
import { canonicalPipelineStage, mergePipelineStageSettings } from "@/lib/atlas/pipeline-stages";
import { mapLegacyLead } from "@/lib/compat/legacy-v2";

export const dynamic = "force-dynamic";

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação|organização/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    const { data, error } = await identity.supabase
      .from("leads")
      .select("*")
      .eq("organization_id", identity.organizationId)
      .neq("status", "arquivado")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const { data: settings } = await identity.supabase.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", identity.organizationId);
    const role = identity.commercialRole || identity.role;
    const leads = ((data ?? []) as Record<string, unknown>[]).map(mapLegacyLead).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return NextResponse.json({ leads, stages: mergePipelineStageSettings(settings ?? []), stageContract: "canonical-v1", compatibility: "safe-v2-v3", canConfigureStages: ["admin", "director", "superintendent"].includes(String(role || "")) });
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

    if (!leadId || !stage || !expectedFromStage || (stage === "comprou_outro" && followUpDescription.length < 10)) {
      return NextResponse.json({ error: "Lead ou etapa inválida." }, { status: 400 });
    }

    await requireLeadAccess(identity, leadId);

    const admin = getSupabaseAdmin();
    const { data: current } = await identity.supabase
      .from("leads")
      .select("id,name,status")
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!current) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const previousStage = canonicalPipelineStage(current.status) || "novo";
    if (previousStage !== expectedFromStage) return NextResponse.json({ error: "A lead foi movimentada por outra pessoa. Atualize o Kanban antes de tentar novamente.", code: "PIPELINE_STAGE_CONFLICT", currentStage: previousStage }, { status: 409 });
    const { data: move, error: moveError } = await admin.rpc("move_pipeline_lead", { p_actor_id: identity.userId, p_organization_id: identity.organizationId, p_lead_id: leadId, p_to_stage: stage, p_expected_from_stage: expectedFromStage, p_reason: followUpDescription || null, p_reversal_of: reversalOf });
    if (moveError) {
      if (/function .*move_pipeline_lead|schema cache|PGRST202/i.test(`${moveError.code||""} ${moveError.message}`) && process.env.ATLAS_ENV === "homologation") {
        const legacy = await admin.from("leads").update({ status: stage }).eq("id", leadId).eq("organization_id", identity.organizationId).select("*").single();
        if (legacy.error || !legacy.data) return NextResponse.json({ error: "Não foi possível movimentar a lead com segurança.", code: "PIPELINE_MOVE_FAILED" }, { status: 400 });
        logger.info("pipeline.legacy_stage_changed", { leadId, previousStage, stage, organizationId: identity.organizationId, actorId: identity.userId });
        return NextResponse.json({ lead: mapLegacyLead(legacy.data as Record<string, unknown>), move: { fromStage: previousStage, toStage: stage, compatibility: "legacy-v2", auditableInApplicationLog: true } });
      }
      const conflict = /conflict|undo_stale|already_reversed/i.test(moveError.message); return NextResponse.json({ error: conflict ? "A movimentação mudou e não pode mais ser desfeita sem atualizar o Kanban." : "Não foi possível movimentar a lead com segurança.", code: conflict ? "PIPELINE_STAGE_CONFLICT" : "PIPELINE_MOVE_FAILED" }, { status: conflict ? 409 : 400 });
    }
    const { data } = await identity.supabase.from("leads").select("id,name,status,score,temperature,budget_min,budget_max,source,campaign_id,preferred_regions,bedrooms,purpose,last_interaction_at,next_action_at,first_contact_due_at,first_contacted_at,first_contact_sla_minutes,first_response_minutes,first_contact_sla_met,created_at,updated_at,assigned_to,metadata").eq("id",leadId).eq("organization_id",identity.organizationId).single();
    if (!data) throw new Error("Lead fora do escopo após movimentação.");
    const occurredAt = String((move as { occurredAt?: string })?.occurredAt || new Date().toISOString());
    await Promise.allSettled([recordFunnelLearning({ organizationId: identity.organizationId, leadId, previousStage, stage, occurredAt, description: followUpDescription })]);

    logger.info("pipeline.stage_changed", { leadId, previousStage, stage, organizationId: identity.organizationId });
    return NextResponse.json({ lead: data, move });
  } catch (error) {
    logger.warn("pipeline.move_failed", { error: error instanceof Error ? error.message : String(error) });
    return authError(error);
  }
}

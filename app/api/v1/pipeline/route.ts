import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";
import { canonicalPipelineStage, mergePipelineStageSettings } from "@/lib/atlas/pipeline-stages";

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
      .select("id,name,phone,email,status,score,temperature,budget_min,budget_max,source,campaign_id,preferred_regions,bedrooms,purpose,last_interaction_at,next_action_at,first_contact_due_at,first_contacted_at,first_contact_sla_minutes,created_at,updated_at,assigned_to,metadata")
      .eq("organization_id", identity.organizationId)
      .order("score", { ascending: false })
      .limit(500);

    if (error) throw error;

    const { data: settings } = await identity.supabase.from("pipeline_stage_settings").select("stage_key,label,probability,position,visible").eq("organization_id", identity.organizationId);
    const role = identity.commercialRole || identity.role;
    return NextResponse.json({ leads: data ?? [], stages: mergePipelineStageSettings(settings ?? []), stageContract: "canonical-v1", canConfigureStages: ["admin", "director", "superintendent"].includes(String(role || "")) });
  } catch (error) {
    logger.warn("pipeline.read_failed", { error: error instanceof Error ? error.message : String(error) });
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
    const followUpDescription = String(body.followUpDescription || "").trim().slice(0, 4000);

    if (!leadId || !stage || (stage === "comprou_outro" && followUpDescription.length < 10)) {
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
    const { data, error } = await identity.supabase
      .from("leads")
      .update({ status: stage, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .select("id,name,status,score,temperature,budget_min,budget_max,source,campaign_id,preferred_regions,bedrooms,purpose,last_interaction_at,next_action_at,first_contact_due_at,first_contacted_at,first_contact_sla_minutes,created_at,updated_at,assigned_to,metadata")
      .single();

    if (error || !data) throw error || new Error("Falha ao mover lead.");

    const occurredAt = new Date().toISOString();
    await Promise.allSettled([
      identity.supabase.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: leadId,
        user_id: identity.userId,
        type: "pipeline_stage_changed",
        title: `Etapa alterada para ${stage}`,
        description: stage === "comprou_outro" ? `Comprou em outro lugar. ${followUpDescription}` : `${previousStage} → ${stage}`,
        occurred_at: occurredAt,
      }),
      admin.from("atlas_events").insert({
        organization_id: identity.organizationId,
        event_type: "lead.stage_changed",
        source: "atlas-v1",
        aggregate_type: "lead",
        aggregate_id: leadId,
        payload: { previousStage, stage, userId: identity.userId },
        correlation_id: crypto.randomUUID(),
      }),
      recordFunnelLearning({ organizationId: identity.organizationId, leadId, previousStage, stage, occurredAt, description: followUpDescription }),
    ]);

    logger.info("pipeline.stage_changed", { leadId, previousStage, stage, organizationId: identity.organizationId });
    return NextResponse.json({ lead: data });
  } catch (error) {
    logger.warn("pipeline.move_failed", { error: error instanceof Error ? error.message : String(error) });
    return authError(error);
  }
}

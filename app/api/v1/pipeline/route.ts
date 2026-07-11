import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const allowedStages = new Set(["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho", "perdido"]);

function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação|organização/i.test(message) ? 401 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const identity = await requireApiIdentity(request);
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
      .from("leads")
      .select("id,name,phone,email,status,score,temperature,budget_max,next_action_at,created_at,updated_at,assigned_to")
      .eq("organization_id", identity.organizationId)
      .order("score", { ascending: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({ leads: data ?? [] });
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
    const stage = String(body.stage || "").toLowerCase();

    if (!leadId || !allowedStages.has(stage)) {
      return NextResponse.json({ error: "Lead ou etapa inválida." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: current } = await admin
      .from("leads")
      .select("id,name,status")
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!current) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const previousStage = current.status || "novo";
    const { data, error } = await admin
      .from("leads")
      .update({ status: stage, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("organization_id", identity.organizationId)
      .select("id,name,status,score,temperature,budget_max,next_action_at,created_at,updated_at")
      .single();

    if (error || !data) throw error || new Error("Falha ao mover lead.");

    await Promise.allSettled([
      admin.from("activities").insert({
        organization_id: identity.organizationId,
        lead_id: leadId,
        user_id: identity.userId,
        type: "pipeline_stage_changed",
        title: `Etapa alterada para ${stage}`,
        description: `${previousStage} → ${stage}`,
        occurred_at: new Date().toISOString(),
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
    ]);

    logger.info("pipeline.stage_changed", { leadId, previousStage, stage, organizationId: identity.organizationId });
    return NextResponse.json({ lead: data });
  } catch (error) {
    logger.warn("pipeline.move_failed", { error: error instanceof Error ? error.message : String(error) });
    return authError(error);
  }
}

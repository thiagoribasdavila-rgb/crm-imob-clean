import { NextResponse, type NextRequest } from "next/server";
import { requireAccessContext } from "@/lib/api/security";
import { logger } from "@/lib/observability/logger";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const allowedStages = new Set(["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho", "perdido"]);

export async function GET(request: NextRequest) {
  try {
    const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker", "viewer"] });
    if (!access.ok) return access.response;

    const { data, error } = await access.supabase
      .from("leads")
      .select("id,name,phone,email,status,score,temperature,budget_max,next_action_at,created_at,updated_at,assigned_to")
      .eq("organization_id", access.access.organization.id)
      .order("score", { ascending: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({ leads: data ?? [] });
  } catch (error) {
    logger.warn("pipeline.read_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Falha ao carregar pipeline." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const rate = checkRateLimit(clientKey(request, "v1-pipeline-move"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas movimentações em sequência." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  try {
    const access = await requireAccessContext(request, { roles: ["admin", "manager", "broker"] });
    if (!access.ok) return access.response;

    const body = await request.json();
    const leadId = String(body.leadId || "");
    const stage = String(body.stage || "").toLowerCase();

    if (!leadId || !allowedStages.has(stage)) {
      return NextResponse.json({ error: "Lead ou etapa inválida." }, { status: 400 });
    }

    const { data: current } = await access.supabase
      .from("leads")
      .select("id,name,status")
      .eq("id", leadId)
      .eq("organization_id", access.access.organization.id)
      .single();

    if (!current) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

    const previousStage = current.status || "novo";
    const { data, error } = await access.supabase
      .from("leads")
      .update({ status: stage, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("organization_id", access.access.organization.id)
      .select("id,name,status,score,temperature,budget_max,next_action_at,created_at,updated_at")
      .single();

    if (error || !data) throw error || new Error("Falha ao mover lead.");

    await Promise.allSettled([
      access.supabase.from("activities").insert({
        organization_id: access.access.organization.id,
        lead_id: leadId,
        user_id: access.access.user.id,
        type: "pipeline_stage_changed",
        title: `Etapa alterada para ${stage}`,
        description: `${previousStage} → ${stage}`,
        occurred_at: new Date().toISOString(),
      }),
      access.supabase.from("atlas_events").insert({
        organization_id: access.access.organization.id,
        event_type: "lead.stage_changed",
        source: "atlas-v1",
        aggregate_type: "lead",
        aggregate_id: leadId,
        payload: { previousStage, stage, userId: access.access.user.id },
        correlation_id: crypto.randomUUID(),
      }),
    ]);

    logger.info("pipeline.stage_changed", { leadId, previousStage, stage, organizationId: access.access.organization.id });
    return NextResponse.json({ lead: data });
  } catch (error) {
    logger.warn("pipeline.move_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Falha ao mover lead." }, { status: 500 });
  }
}

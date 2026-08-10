import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { resolveCommercialRole } from "@/lib/api/security";

export const dynamic = "force-dynamic";

type Payload = { action?: "approve" | "reject" | "execute" | "cancel"; reason?: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    const payload = (await request.json()) as Payload;
    if (!payload.action || !["approve", "reject", "execute", "cancel"].includes(payload.action)) {
      return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin.from("profiles").select("role,commercial_role").eq("id", identity.userId).eq("organization_id", identity.organizationId).single();
    const effectiveRole = profile ? resolveCommercialRole({ role: profile.role, commercial_role: profile.commercial_role }) : null;
    if (!effectiveRole || !["director", "superintendent", "manager"].includes(effectiveRole)) {
      return NextResponse.json({ error: "Apenas a liderança pode decidir dentro do próprio escopo." }, { status: 403 });
    }

    const { data: decision, error } = await admin.from("atlas_decisions")
      .select("id,status,decision_type,recommended_action,requires_approval")
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .single();
    if (error || !decision) return NextResponse.json({ error: "Decisão não encontrada." }, { status: 404 });
    if (decision.decision_type === "optimize_campaign" && effectiveRole !== "director") return NextResponse.json({ error: "Decisões estratégicas de campanha pertencem à diretoria." }, { status: 403 });

    if (payload.action === "reject" || payload.action === "cancel") {
      const status = payload.action === "reject" ? "rejected" : "cancelled";
      await admin.from("atlas_decisions").update({ status, last_error: payload.reason ?? null }).eq("id", id);
      return NextResponse.json({ id, status });
    }

    if (payload.action === "approve") {
      if (decision.status !== "proposed") return NextResponse.json({ error: "A decisão não está disponível para aprovação." }, { status: 409 });
      await admin.from("atlas_decisions").update({ status: "approved", approved_by: identity.userId, approved_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ id, status: "approved" });
    }

    if (decision.requires_approval && decision.status !== "approved") {
      return NextResponse.json({ error: "A decisão precisa ser aprovada antes da execução." }, { status: 409 });
    }

    const agentKey = decision.decision_type === "optimize_campaign" ? "marketing-agent" : decision.decision_type === "prioritize_lead" ? "sales-agent" : "manager-agent";
    const { data: run, error: runError } = await admin.from("atlas_agent_runs").insert({
      organization_id: identity.organizationId,
      agent_key: agentKey,
      objective: `Executar decisão ${decision.decision_type}`,
      input: decision.recommended_action,
      decision_id: id,
      created_by: identity.userId,
      correlation_id: crypto.randomUUID(),
    }).select("id").single();
    if (runError || !run) throw runError ?? new Error("Falha ao enfileirar agente.");

    await admin.from("atlas_decisions").update({ status: "executing", execution_attempts: 1 }).eq("id", id);
    logger.info("v3.decision_execution_queued", { decisionId: id, runId: run.id, agentKey });
    return NextResponse.json({ id, status: "executing", runId: run.id }, { status: 202 });
  } catch (error) {
    logger.error("v3.decision_action_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao processar decisão." }, { status: 500 });
  }
}

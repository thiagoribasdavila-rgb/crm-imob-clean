import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { recordFunnelLearning } from "@/lib/atlas/funnel-learning";

export const dynamic = "force-dynamic";

type DecisionPayload = { decision?: "approved" | "rejected"; reason?: string };

function scheduledAt(index: number, dailyCap: number, intervalSeconds: number) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const dayOffset = Math.floor(index / dailyCap);
  const position = index % dailyCap;
  const windowStart = new Date(Date.UTC(value("year"), value("month") - 1, value("day") + dayOffset, 12, 0, 0));
  const start = dayOffset === 0 ? new Date(Math.max(now.getTime() + 10_000, windowStart.getTime())) : windowStart;
  const candidate = new Date(start.getTime() + position * intervalSeconds * 1000);
  return candidate.toISOString();
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    const body = (await request.json()) as DecisionPayload;
    if (!body.decision || !["approved", "rejected"].includes(body.decision)) {
      return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("role,commercial_role")
      .eq("id", identity.userId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!profile || (!["admin", "manager"].includes(profile.role) && !["director", "superintendent", "manager"].includes(profile.commercial_role || ""))) {
      return NextResponse.json({ error: "Apenas administradores e gestores podem decidir aprovações." }, { status: 403 });
    }

    const { data: approval, error } = await admin
      .from("approval_requests")
      .select("id,status,request_type,entity_type,entity_id,organization_id")
      .eq("id", id)
      .eq("organization_id", identity.organizationId)
      .single();

    if (error || !approval) return NextResponse.json({ error: "Aprovação não encontrada." }, { status: 404 });
    if (approval.status !== "pending") return NextResponse.json({ error: "Aprovação já decidida." }, { status: 409 });
    if (approval.entity_type === "commercial_simulation") {
      const reason = String(body.reason || "").trim();
      const { data, error: decisionError } = await admin.rpc("decide_commercial_proposal", { p_actor_id: identity.userId, p_organization_id: identity.organizationId, p_approval_id: approval.id, p_decision: body.decision, p_reason: reason.slice(0, 500) });
      if (decisionError) return NextResponse.json({ error: "A proposta saiu da sua alçada, já foi decidida ou preço, estoque e regra mudaram." }, { status: 409 });
      const result = data as { leadId?: string; previousStage?: string; decidedAt?: string; status?: string } | null;
      if (body.decision === "approved" && result?.leadId) await recordFunnelLearning({ organizationId: identity.organizationId, leadId: result.leadId, previousStage: result.previousStage || "qualificacao", stage: "proposta", occurredAt: result.decidedAt || new Date().toISOString(), description: "Proposta aprovada após validação atômica de preço, estoque e regra." });
      logger.info("approval.commercial_proposal_decided", { approvalId: id, decision: body.decision, userId: identity.userId });
      return NextResponse.json(data);
    }
    if (["meta_campaign_optimization", "meta_audience_change", "meta_budget_change", "meta_creative_change"].includes(approval.request_type) && profile.commercial_role !== "director" && profile.role !== "admin") return NextResponse.json({ error: "Decisões de campanha pertencem exclusivamente ao diretor." }, { status: 403 });
    if (approval.entity_type === "message") {
      const reason = String(body.reason || "").trim();
      if (body.decision === "rejected" && reason.length < 5) return NextResponse.json({ error: "Informe o motivo da rejeição." }, { status: 400 });
      const { data, error: decisionError } = await admin.rpc("decide_message_approval", { p_actor_id: identity.userId, p_organization_id: identity.organizationId, p_approval_id: approval.id, p_decision: body.decision, p_reason: reason.slice(0, 500) });
      if (decisionError) return NextResponse.json({ error: "Aprovação fora do seu time ou já decidida." }, { status: 409 });
      logger.info("approval.message_decided", { approvalId: id, decision: body.decision, userId: identity.userId });
      return NextResponse.json(data);
    }
    if (approval.entity_type === "reactivation_batch" && approval.entity_id && profile.commercial_role !== "director" && profile.role !== "admin") {
      const [{ data: batch }, { data: team }] = await Promise.all([
        admin.from("lead_reactivation_batches").select("owner_id").eq("id", approval.entity_id).eq("organization_id", identity.organizationId).single(),
        admin.from("profiles").select("id,reports_to").eq("organization_id", identity.organizationId).eq("active", true),
      ]);
      const allowed = new Set([identity.userId]);
      let changed = true;
      while (changed) { changed = false; for (const member of team ?? []) if (member.reports_to && allowed.has(member.reports_to) && !allowed.has(member.id)) { allowed.add(member.id); changed = true; } }
      if (!batch || !allowed.has(batch.owner_id)) return NextResponse.json({ error: "Esta campanha pertence a outra estrutura comercial." }, { status: 403 });
    }
    if (body.decision === "approved" && approval.entity_type === "commercial_simulation" && approval.entity_id) {
      const { data: simulation } = await admin.from("commercial_simulations").select("lead_id,property_id,payment_rule_id,property_price,valid_until").eq("id", approval.entity_id).eq("organization_id", identity.organizationId).single();
      if (!simulation || new Date(simulation.valid_until).getTime() < Date.now()) return NextResponse.json({ error: "A simulação venceu. Recalcule antes de aprovar." }, { status: 409 });
      const [{ data: property }, { data: rule }] = await Promise.all([
        admin.from("properties").select("price,status").eq("id", simulation.property_id).eq("organization_id", identity.organizationId).single(),
        admin.from("developer_payment_flow_rules").select("active,valid_from,valid_until").eq("id", simulation.payment_rule_id).eq("organization_id", identity.organizationId).single(),
      ]);
      const available = property && ["available", "ativo", "disponivel", "disponível"].includes(String(property.status).toLowerCase());
      const today = new Date().toISOString().slice(0, 10);
      const ruleValid = rule?.active && (!rule.valid_from || rule.valid_from <= today) && (!rule.valid_until || rule.valid_until >= today);
      if (!available || Number(property?.price) !== Number(simulation.property_price) || !ruleValid) return NextResponse.json({ error: "Preço, estoque ou regra mudou. Gere uma nova simulação antes da proposta." }, { status: 409 });
    }

    const decidedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("approval_requests")
      .update({ status: body.decision, decision_reason: body.reason ?? null, decided_by: identity.userId, decided_at: decidedAt })
      .eq("id", id);
    if (updateError) throw updateError;

    if (approval.entity_type === "commercial_simulation" && approval.entity_id) {
      await admin.from("commercial_simulations").update({ status: body.decision, updated_at: decidedAt }).eq("id", approval.entity_id).eq("organization_id", identity.organizationId);
      const { data: simulation } = await admin.from("commercial_simulations").select("lead_id").eq("id", approval.entity_id).eq("organization_id", identity.organizationId).single();
      if (simulation) {
        await admin.from("activities").insert({ organization_id: identity.organizationId, lead_id: simulation.lead_id, user_id: identity.userId, type: "commercial_proposal_decision", title: body.decision === "approved" ? "Proposta comercial aprovada" : "Proposta comercial devolvida", description: body.reason || (body.decision === "approved" ? "Preço, estoque e regra revisados pela gestão." : "Requer ajuste antes do envio ao cliente."), metadata: { simulationId: approval.entity_id, decision: body.decision }, occurred_at: decidedAt });
        if (body.decision === "approved") {
          const { data: lead } = await admin.from("leads").select("status").eq("id", simulation.lead_id).eq("organization_id", identity.organizationId).single();
          const previousStage = lead?.status || "qualificacao";
          await admin.from("leads").update({ status: "proposta", updated_at: decidedAt }).eq("id", simulation.lead_id).eq("organization_id", identity.organizationId);
          await recordFunnelLearning({ organizationId: identity.organizationId, leadId: simulation.lead_id, previousStage, stage: "proposta", occurredAt: decidedAt, description: "Proposta aprovada após validação de preço, estoque e regra." });
        }
      }
    }

    if (approval.entity_type === "reactivation_batch" && approval.entity_id) {
      const [{ data: contacts }, { data: batchConfig }] = await Promise.all([
        admin.from("lead_reactivation_contacts").select("id,message_id").eq("batch_id", approval.entity_id).eq("status", "pending_approval"),
        admin.from("lead_reactivation_batches").select("daily_cap,interval_seconds").eq("id", approval.entity_id).single(),
      ]);
      const messageIds = (contacts ?? []).map((item) => item.message_id).filter(Boolean) as string[];
      if (body.decision === "approved" && messageIds.length) {
        const dailyCap = Number(batchConfig?.daily_cap || 100);
        const intervalSeconds = Number(batchConfig?.interval_seconds || 30);
        const outbox = messageIds.map((messageId, index) => ({ organization_id: identity.organizationId, topic: "message.send", aggregate_type: "message", aggregate_id: messageId, available_at: scheduledAt(index, dailyCap, intervalSeconds), payload: { messageId, channel: "whatsapp", reactivationBatchId: approval.entity_id } }));
        const { error: outboxError } = await admin.from("integration_outbox").insert(outbox);
        if (outboxError) throw outboxError;
        await Promise.all([
          admin.from("lead_reactivation_contacts").update({ status: "queued" }).eq("batch_id", approval.entity_id).eq("status", "pending_approval"),
          admin.from("lead_reactivation_batches").update({ status: "queued", updated_at: decidedAt }).eq("id", approval.entity_id),
        ]);
      } else if (body.decision === "rejected") {
        if (messageIds.length) await admin.from("messages").update({ status: "failed", error: body.reason || "Campanha de reativação rejeitada." }).in("id", messageIds);
        await Promise.all([
          admin.from("lead_reactivation_contacts").update({ status: "failed", block_reason: "rejected" }).eq("batch_id", approval.entity_id).eq("status", "pending_approval"),
          admin.from("lead_reactivation_batches").update({ status: "rejected", updated_at: decidedAt }).eq("id", approval.entity_id),
        ]);
      }
    }

    logger.info("approval.decided", { approvalId: id, decision: body.decision, userId: identity.userId });
    return NextResponse.json({ id, status: body.decision, decidedAt });
  } catch (error) {
    logger.error("approval.decision_failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao decidir aprovação." }, { status: 401 });
  }
}

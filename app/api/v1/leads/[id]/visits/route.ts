import { NextResponse, type NextRequest } from "next/server";
import { ehLeadForaDaCarteira, requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/security";
import { registrarAtividade } from "@/lib/crm/registro-de-atividade";
import { logger } from "@/lib/observability/logger";

type RouteContext = { params: Promise<{ id: string }> };
const STATES = new Set(["scheduled", "confirmed", "completed", "cancelled", "no_show"]);
const TRANSITIONS: Record<string, Set<string>> = {
  scheduled: new Set(["confirmed", "completed", "cancelled", "no_show"]),
  confirmed: new Set(["completed", "cancelled", "no_show"]),
};

function unauthorized(error: unknown) {
  // O agendamento insere com `broker_id = lead.assigned_to`: sem esta recusa, um
  // corretor plantava visita e `next_action_at` na AGENDA DO COLEGA. Medido em
  // 2026-07-29: HTTP 201, visita criada em nome da vítima.
  if (ehLeadForaDaCarteira(error)) {
    return NextResponse.json({ error: error.message, code: "VISIT_OUT_OF_SCOPE" }, { status: 403 });
  }
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /sessão|token|autenticação|autoriz|organiza|escopo/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const { data, error } = await identity.supabase.from("lead_visits").select("id,lead_id,broker_id,development_id,scheduled_at,confirmed_at,completed_at,cancelled_at,no_show_at,status,format,location,notes,confirmation_minutes,completion_delay_minutes,created_at").eq("organization_id", identity.organizationId).eq("lead_id", id).order("scheduled_at", { ascending: false }).limit(100);
    if (error) return NextResponse.json({ error: "Não foi possível carregar as visitas." }, { status: 500 });
    return NextResponse.json({ visits: data ?? [] });
  } catch (error) { return unauthorized(error); }
}

export async function POST(request: NextRequest, context: RouteContext) {
  // Agendamento escreve em lead_visits e mexe na próxima ação da lead.
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "lead.visits" });
  if (!rate.ok) return rate.response;
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const body = await request.json();
    const admin = getSupabaseAdmin();
    const { data: lead } = await admin.from("leads").select("id,assigned_to,development_id").eq("id", id).eq("organization_id", identity.organizationId).single();
    if (!lead) return NextResponse.json({ error: "Lead não encontrada." }, { status: 404 });

    if (body.action === "schedule") {
      const scheduledAt = new Date(String(body.scheduledAt || ""));
      if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) return NextResponse.json({ error: "Escolha uma data futura para a visita." }, { status: 400 });
      const format = body.format === "video" ? "video" : "onsite";
      const { data, error } = await admin.from("lead_visits").insert({ organization_id: identity.organizationId, lead_id: id, broker_id: lead.assigned_to, development_id: lead.development_id, scheduled_at: scheduledAt.toISOString(), format, location: String(body.location || "").trim().slice(0, 300) || null, notes: String(body.notes || "").trim().slice(0, 2000) || null }).select("id,scheduled_at,status,format,location,notes").single();
      if (error) return NextResponse.json({ error: /duplicate/i.test(error.message) ? "Esta visita já está agendada." : "Não foi possível agendar a visita." }, { status: 400 });
      // O `Promise.allSettled` daqui descartava o 42703 de `activities.title`
      // junto com qualquer outra falha: a visita entrava na agenda e a trilha
      // não existia. `allSettled` continua sendo o certo para não deixar uma
      // falha derrubar a outra — o que faltava era LER o que ele devolveu.
      const [trilha, proximaAcao] = await Promise.all([
        registrarAtividade(admin, { organizationId: identity.organizationId, leadId: id, userId: identity.userId, type: "system", titulo: "Visita agendada", description: `${format === "video" ? "Videochamada" : "Visita presencial"} para ${scheduledAt.toLocaleString("pt-BR")}.` }),
        admin.from("leads").update({ next_action_at: scheduledAt.toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", identity.organizationId),
      ]);
      if (proximaAcao.error) logger.error("lead.visits.next_action_failed", proximaAcao.error, { leadId: id, organizationId: identity.organizationId, code: proximaAcao.error.code });
      return NextResponse.json({ visit: data, trilha: trilha.ok ? { registrada: true } : { registrada: false, motivo: trilha.code || "erro_desconhecido" } }, { status: 201 });
    }

    if (body.action === "transition") {
      const visitId = String(body.visitId || "");
      const status = String(body.status || "");
      if (!visitId || !STATES.has(status)) return NextResponse.json({ error: "Transição inválida." }, { status: 400 });
      const { data: current } = await admin.from("lead_visits").select("id,status,scheduled_at").eq("id", visitId).eq("lead_id", id).eq("organization_id", identity.organizationId).single();
      if (!current || !TRANSITIONS[current.status]?.has(status)) return NextResponse.json({ error: "A visita mudou e esta ação não é mais permitida." }, { status: 409 });
      if (status === "no_show" && new Date(current.scheduled_at).getTime() > Date.now()) return NextResponse.json({ error: "A ausência só pode ser registrada depois do horário marcado." }, { status: 400 });
      const { data, error } = await admin.from("lead_visits").update({ status }).eq("id", visitId).eq("status", current.status).eq("organization_id", identity.organizationId).select("id,status,confirmed_at,completed_at,cancelled_at,no_show_at,confirmation_minutes,completion_delay_minutes").single();
      if (error || !data) return NextResponse.json({ error: "Não foi possível atualizar a visita com segurança." }, { status: 409 });
      const labels: Record<string, string> = { confirmed: "Visita confirmada", completed: "Visita realizada", cancelled: "Visita cancelada", no_show: "Cliente não compareceu" };
      // Mesma correção do agendamento: a visita REALIZADA é o evento comercial
      // mais caro da trilha, e era exatamente o que sumia calado.
      const trilha = await registrarAtividade(admin, { organizationId: identity.organizationId, leadId: id, userId: identity.userId, type: status === "completed" ? "visit" : "system", titulo: labels[status], description: `Resultado da visita registrado: ${status}.` });
      if (["completed", "cancelled", "no_show"].includes(status)) {
        const { error: erroDaProximaAcao } = await admin.from("leads").update({ next_action_at: null, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", identity.organizationId).eq("next_action_at", current.scheduled_at);
        if (erroDaProximaAcao) logger.error("lead.visits.next_action_clear_failed", erroDaProximaAcao, { leadId: id, organizationId: identity.organizationId, code: erroDaProximaAcao.code });
      }
      return NextResponse.json({ visit: data, trilha: trilha.ok ? { registrada: true } : { registrada: false, motivo: trilha.code || "erro_desconhecido" } });
    }
    return NextResponse.json({ error: "Ação não suportada." }, { status: 400 });
  } catch (error) { return unauthorized(error); }
}

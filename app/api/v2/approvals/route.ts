import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ACTION_PROPOSAL_ENTITY_TYPE,
  ACTION_PROPOSAL_REQUEST_TYPE,
  buildActionProposal,
  type ProposalContext,
  type ProposalSignalKind,
} from "@/lib/ai/action-proposals";

// SALTO V4.1 — cria uma proposta de ação (Copiloto que executa). A proposta é
// determinística, nunca executa sozinha: entra na Caixa de Aprovações e a
// liderança decide (gate da rota de decisão). Broker propõe só para lead próprio.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "action-proposals" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const org = identity.access.organization.id;
  const userId = identity.access.profile.id;
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);

  const body = (await request.json().catch(() => null)) as { leadId?: string; signal?: ProposalSignalKind; context?: ProposalContext } | null;
  const SIGNALS: ProposalSignalKind[] = ["follow_up_overdue", "stale_stage", "high_score_no_contact", "objection_open"];
  if (!body?.leadId || !body.signal || !SIGNALS.includes(body.signal)) {
    return apiError("INVALID_PROPOSAL", "Informe leadId e um sinal válido.", identity.meta, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select("id,name,status,score_ia,assigned_user_id")
    .eq("id", body.leadId)
    .eq("organization_id", org)
    .maybeSingle();
  if (leadError || !lead) return apiError("LEAD_NOT_FOUND", "Lead não encontrado nesta organização.", identity.meta, { status: 404 });

  const leadership = ["director", "superintendent", "manager"].includes(role);
  if (!leadership && lead.assigned_user_id !== userId) {
    return apiError("FORBIDDEN", "Você só pode preparar ações para leads da sua carteira.", identity.meta, { status: 403 });
  }

  const payload = buildActionProposal(body.signal, {
    id: lead.id,
    name: lead.name,
    status: lead.status,
    score: Number(lead.score_ia) || null,
    assignedTo: lead.assigned_user_id,
  }, body.context ?? {});
  if (!payload) return apiError("NO_ACTION", "Este sinal não tem ação preparável com os dados disponíveis.", identity.meta, { status: 422 });

  // Dedupe honesto: uma proposta pendente por lead+tipo de ação.
  const { data: existing } = await admin
    .from("approval_requests")
    .select("id")
    .eq("organization_id", org)
    .eq("entity_type", ACTION_PROPOSAL_ENTITY_TYPE)
    .eq("entity_id", lead.id)
    .eq("status", "pending")
    .contains("payload", { kind: payload.kind })
    .limit(1);
  if (existing?.length) {
    return apiSuccess({ id: existing[0].id, deduped: true, kind: payload.kind }, identity.meta, { headers: limited.headers });
  }

  const { data: created, error: insertError } = await admin
    .from("approval_requests")
    .insert({
      organization_id: org,
      request_type: ACTION_PROPOSAL_REQUEST_TYPE,
      entity_type: ACTION_PROPOSAL_ENTITY_TYPE,
      entity_id: lead.id,
      payload,
      status: "pending",
      requested_by: userId,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !created) return apiError("PROPOSAL_FAILED", "Não foi possível registrar a proposta.", identity.meta, { status: 500 });
  return apiSuccess({ id: created.id, deduped: false, kind: payload.kind, title: payload.title, preview: payload.preview }, identity.meta, { headers: limited.headers });
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "manager-message-approvals" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!["director","superintendent","manager"].includes(role)) return apiError("FORBIDDEN", "Aprovações pertencem à liderança.", identity.meta, { status: 403 });
  const admin = getSupabaseAdmin(); const org = identity.access.organization.id;
  const { data: approvals } = await admin.from("approval_requests").select("id,request_type,entity_type,entity_id,status,decision_reason,expires_at,created_at,payload").eq("organization_id", org).in("entity_type", ["message","commercial_simulation","lead_action","meta_campaign"]).order("created_at", { ascending: false }).limit(100);
  const messageIds = (approvals ?? []).filter((item) => item.entity_type === "message").map((item) => item.entity_id).filter(Boolean) as string[];
  const simulationIds = (approvals ?? []).filter((item) => item.entity_type === "commercial_simulation").map((item) => item.entity_id).filter(Boolean) as string[];
  const { data: messages } = messageIds.length ? await admin.from("messages").select("id,conversation_id,channel,content").in("id", messageIds).eq("organization_id", org) : { data: [] };
  const conversationIds = (messages ?? []).map((item) => item.conversation_id);
  const { data: conversations } = conversationIds.length ? await admin.from("conversations").select("id,lead_id,assigned_to").in("id", conversationIds).eq("organization_id", org) : { data: [] };
  const { data: simulations } = simulationIds.length ? await admin.from("commercial_simulations").select("id,lead_id,property_id,property_price,rule_snapshot,valid_until").in("id", simulationIds).eq("organization_id", org) : { data: [] };
  const actionLeadIds = (approvals ?? []).filter((item) => item.entity_type === "lead_action").map((item) => item.entity_id).filter(Boolean) as string[];
  const leadIds = [...new Set([...(conversations ?? []).map((item) => item.lead_id), ...(simulations ?? []).map((item) => item.lead_id), ...actionLeadIds].filter(Boolean))] as string[];
  const propertyIds = (simulations ?? []).map((item) => item.property_id);
  const [{ data: leads }, { data: properties }] = await Promise.all([leadIds.length ? admin.from("leads").select("id,name,assigned_to").in("id", leadIds).eq("organization_id", org) : Promise.resolve({ data: [] }), propertyIds.length ? admin.from("properties").select("id,title").in("id", propertyIds).eq("organization_id", org) : Promise.resolve({ data: [] })]);
  const { data: profiles } = await admin.from("profiles").select("id,full_name,reports_to").eq("organization_id", org).eq("active", true);
  const allowed = new Set<string>(); if (role === "director") for (const profile of profiles ?? []) allowed.add(profile.id); else if (role === "manager") for (const profile of profiles ?? []) { if (profile.reports_to === identity.access.profile.id) allowed.add(profile.id); } else { allowed.add(identity.access.profile.id); let changed = true; while (changed) { changed = false; for (const profile of profiles ?? []) if (profile.reports_to && allowed.has(profile.reports_to) && !allowed.has(profile.id)) { allowed.add(profile.id); changed = true; } } allowed.delete(identity.access.profile.id); }
  const items = (approvals ?? []).flatMap((approval) => { if (approval.entity_type === "meta_campaign") {
      // Campanha Meta — org-level, sem corretor/lead: preview vem do payload determinístico (sem JOIN).
      const proposal = approval.payload as { title?: string; kind?: string; governance?: { note?: string } } | null;
      return [{ ...approval, payload: undefined, leadName: proposal?.title || "Campanha", brokerName: "Marketing", channel: proposal?.kind || "campanha", preview: [proposal?.title, proposal?.governance?.note].filter(Boolean).join(" · ").slice(0, 300) }];
    }
    if (approval.entity_type === "lead_action") {
      // SALTO V4.1: proposta de ação — preview vem do próprio payload determinístico.
      const proposal = approval.payload as { title?: string; preview?: string; reason?: string; kind?: string } | null;
      const lead = (leads ?? []).find((l) => l.id === approval.entity_id);
      const brokerId = lead?.assigned_to;
      if (brokerId && !allowed.has(brokerId)) return [];
      return [{ ...approval, payload: undefined, leadName: lead?.name || "Lead", brokerName: brokerId ? ((profiles ?? []).find((p) => p.id === brokerId)?.full_name || "Corretor") : "Fila geral", channel: proposal?.kind || "ação", preview: [proposal?.title, proposal?.preview, proposal?.reason].filter(Boolean).join(" · ").slice(0, 300) }];
    }
    if (approval.entity_type === "message") { const message = (messages ?? []).find((m) => m.id === approval.entity_id); const conversation = (conversations ?? []).find((c) => c.id === message?.conversation_id); const lead = (leads ?? []).find((l) => l.id === conversation?.lead_id); const brokerId = conversation?.assigned_to || lead?.assigned_to; if (!message || !brokerId || !allowed.has(brokerId)) return []; return [{ ...approval, leadName: lead?.name || "Lead", brokerName: (profiles ?? []).find((p) => p.id === brokerId)?.full_name || "Corretor", channel: message.channel, preview: String(message.content || "").slice(0, 240) }]; } const simulation = (simulations ?? []).find((item) => item.id === approval.entity_id); const lead = (leads ?? []).find((item) => item.id === simulation?.lead_id); const brokerId = lead?.assigned_to; if (!simulation || !brokerId || !allowed.has(brokerId)) return []; const property = (properties ?? []).find((item) => item.id === simulation.property_id); const snapshot = simulation.rule_snapshot as { ruleName?: string; version?: number } | null; return [{ ...approval, leadName: lead?.name || "Lead", brokerName: (profiles ?? []).find((p) => p.id === brokerId)?.full_name || "Corretor", channel: "proposta", preview: `${property?.title || "Unidade"} · ${Number(simulation.property_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${snapshot?.ruleName || "Regra vigente"} v${snapshot?.version || "—"}` }]; });
  return apiSuccess({ scope: { role, directTeamOnly: role === "manager" }, items }, identity.meta, { headers: limited.headers });
}

import { NextResponse } from "next/server";
import { requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
type TimelineCategory = "change" | "contact" | "transfer" | "ai" | "proposal" | "external";
type TimelineEvent = { id: string; category: TimelineCategory; title: string; description: string | null; occurredAt: string; actorName: string; source: string; status?: string | null };

const proposalTypes = new Set(["commercial_simulation", "commercial_proposal_decision", "commercial_proposal_lifecycle", "property_presentation", "property_feedback"]);
const aiTypes = new Set(["ai", "ai_qualification", "experience_alert", "qualification", "score_recalibrated"]);
const contactTypes = new Set(["call", "email", "message", "note", "meeting", "visit", "whatsapp_opt_out"]);
function categoryForActivity(type: string): TimelineCategory {
  if (proposalTypes.has(type)) return "proposal";
  if (aiTypes.has(type) || type.startsWith("ai_")) return "ai";
  if (contactTypes.has(type)) return "contact";
  return "change";
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível carregar a timeline.";
  const status = /sessão|token|autenticação/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const db = identity.supabase;
    const admin = getSupabaseAdmin();

    const [leadResult, activityResult, transferResult, conversationResult, campaignResult, simulationResult] = await Promise.all([
      db.from("leads").select("id,name,created_at,assigned_to").eq("id", id).eq("organization_id", identity.organizationId).single(),
      db.from("activities").select("id,user_id,title,description,type,metadata,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(250),
      db.from("lead_transfer_items").select("id,batch_id,previous_owner_id,target_owner_id,created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      db.from("conversations").select("id,channel").eq("lead_id", id).eq("organization_id", identity.organizationId).limit(50),
      db.from("campaign_events").select("id,event_type,source,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(150),
      db.from("commercial_simulations").select("id,status,created_by,property_price,created_at,updated_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (leadResult.error || !leadResult.data) return NextResponse.json({ error: "Lead fora do seu escopo comercial." }, { status: 403 });

    const conversationIds = (conversationResult.data ?? []).map((row) => row.id);
    const batchIds = [...new Set((transferResult.data ?? []).map((row) => row.batch_id))];
    const [messageResult, batchResult] = await Promise.all([
      conversationIds.length ? db.from("messages").select("id,conversation_id,direction,channel,status,created_at").eq("organization_id", identity.organizationId).in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(250) : Promise.resolve({ data: [] }),
      batchIds.length ? db.from("lead_transfer_batches").select("id,actor_id,reason,created_at").eq("organization_id", identity.organizationId).in("id", batchIds) : Promise.resolve({ data: [] }),
    ]);
    const batches = new Map((batchResult.data ?? []).map((row) => [row.id, row]));
    const profileIds = [...new Set([
      ...(activityResult.data ?? []).map((row) => row.user_id),
      ...(transferResult.data ?? []).flatMap((row) => [row.previous_owner_id, row.target_owner_id]),
      ...(batchResult.data ?? []).map((row) => row.actor_id),
      ...(simulationResult.data ?? []).map((row) => row.created_by),
    ].filter((value): value is string => Boolean(value)))];
    const { data: profiles } = profileIds.length ? await admin.from("profiles").select("id,full_name").eq("organization_id", identity.organizationId).in("id", profileIds) : { data: [] as Array<{ id: string; full_name: string | null }> };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name || "Equipe Atlas"]));
    const actor = (profileId: string | null) => profileId ? names.get(profileId) || "Equipe Atlas" : "Automação Atlas";
    const channelByConversation = new Map((conversationResult.data ?? []).map((row) => [row.id, row.channel]));
    const representedSimulationIds = new Set((activityResult.data ?? []).map((row) => row.metadata && typeof row.metadata === "object" ? String((row.metadata as Record<string, unknown>).simulationId || "") : "").filter(Boolean));

    const events: TimelineEvent[] = [
      { id: `created-${leadResult.data.id}`, category: "change" as const, title: "Lead criado no CRM", description: "Início do histórico comercial unificado.", occurredAt: leadResult.data.created_at, actorName: "Atlas CRM", source: "crm" },
      ...(activityResult.data ?? []).map((row) => ({ id: `activity-${row.id}`, category: categoryForActivity(String(row.type || "system")), title: row.title || "Atividade registrada", description: row.description, occurredAt: row.occurred_at, actorName: actor(row.user_id), source: String(row.type || "crm") })),
      ...(transferResult.data ?? []).map((row) => { const batch = batches.get(row.batch_id); return { id: `transfer-${row.id}`, category: "transfer" as const, title: "Responsável pela lead alterado", description: `${actor(row.previous_owner_id)} → ${actor(row.target_owner_id)}${batch?.reason ? `. Motivo: ${batch.reason}` : "."}`, occurredAt: row.created_at, actorName: actor(batch?.actor_id || null), source: "crm_transfer" }; }),
      ...(messageResult.data ?? []).map((row) => ({ id: `message-${row.id}`, category: "contact" as const, title: row.direction === "inbound" ? "Mensagem recebida" : "Mensagem enviada", description: `${channelByConversation.get(row.conversation_id) || row.channel || "Canal digital"} · ${row.status || "registrada"}`, occurredAt: row.created_at, actorName: row.direction === "inbound" ? "Cliente" : "Equipe Atlas", source: row.channel || "mensageria", status: row.status })),
      ...(campaignResult.data ?? []).map((row) => ({ id: `external-${row.id}`, category: "external" as const, title: String(row.event_type || "Evento externo").replaceAll("_", " "), description: `Sinal recebido de ${row.source || "integração externa"}.`, occurredAt: row.occurred_at, actorName: "Integração Atlas", source: row.source || "external" })),
      ...(simulationResult.data ?? []).filter((row) => !representedSimulationIds.has(row.id)).map((row) => ({ id: `simulation-${row.id}`, category: "proposal" as const, title: row.status === "draft" ? "Simulação comercial criada" : "Simulação comercial atualizada", description: `Valor de referência ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(row.property_price || 0))}.`, occurredAt: row.updated_at || row.created_at, actorName: actor(row.created_by), source: "commercial_simulation", status: row.status })),
    ].filter((event) => Boolean(event.occurredAt)).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 500);

    const counts = events.reduce<Record<TimelineCategory, number>>((result, event) => { result[event.category] += 1; return result; }, { change: 0, contact: 0, transfer: 0, ai: 0, proposal: 0, external: 0 });
    return NextResponse.json({ lead: { id: leadResult.data.id, name: leadResult.data.name }, events, counts, scope: { organizationId: identity.organizationId, hierarchicalRls: true, hiddenEventsExcluded: true } });
  } catch (error) {
    logger.warn("lead.timeline.read_failed", { error: error instanceof Error ? error.message : String(error) });
    return safeError(error);
  }
}

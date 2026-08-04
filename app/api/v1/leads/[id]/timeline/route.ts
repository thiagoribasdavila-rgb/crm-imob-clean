import { NextResponse } from "next/server";
import { ehLeadForaDaCarteira, requireApiIdentity, requireLeadAccess } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { activityCategoryForType, type ActivityCategory } from "@/lib/atlas/activity-timeline";
import { SELECT_DE_ATIVIDADE, tituloDaAtividade } from "@/lib/crm/registro-de-atividade";
import { SELECT_DE_EVENTO_DE_LEAD, normalizarEventoDeLead } from "@/lib/crm/historico-do-lead";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
type TimelineCategory = ActivityCategory;
type TimelineEvent = { id: string; category: TimelineCategory; title: string; description: string | null; occurredAt: string; actorName: string; source: string; status?: string | null };

function safeError(error: unknown) {
  // A timeline devolve a HISTÓRIA da lead. Lead de outra carteira é recusa
  // explícita — 400 mandaria a tela pedir para o corretor "corrigir os dados"
  // de uma lead que ele nem deveria abrir.
  if (ehLeadForaDaCarteira(error)) {
    return NextResponse.json({ error: error.message, code: "TIMELINE_OUT_OF_SCOPE" }, { status: 403 });
  }
  const message = error instanceof Error ? error.message : "Não foi possível carregar a timeline.";
  const status = /sessão|token|autenticação|autoriz|organiza|escopo/i.test(message) ? 401 : /escopo/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    await requireLeadAccess(identity, id);
    const db = identity.supabase;
    const admin = getSupabaseAdmin();

    const [leadResult, activityResult, eventResult, transferResult, conversationResult, campaignResult, simulationResult] = await Promise.all([
      db.from("leads").select("id,name,created_at,assigned_to").eq("id", id).eq("organization_id", identity.organizationId).single(),
      db.from("activities").select(SELECT_DE_ATIVIDADE).eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(250),
      // ── A GAVETA ONDE O CONTATO DO CORRETOR REALMENTE CAI ────────────────
      //
      // `POST /api/v1/leads/[id]/first-contact` grava em `lead_events`, e só
      // ali. Esta rota lia `activities` e nunca abria essa gaveta. Medido em
      // produção em 02/08/2026, com o handler REAL: das 481 linhas de
      // `activities`, 481 são o espelho de `move_pipeline_lead` — ZERO contatos.
      // Os 56 contatos registrados (40 `call` + 16 `whatsapp`) estavam todos em
      // `lead_events`.
      //
      // Consequência na tela, medida na lead e036dc63 (4 contatos registrados):
      // `counts.contact = 0` e dois eventos no total — "Lead criado no CRM" e
      // uma mudança de etapa. O corretor tinha ligado quatro vezes e a linha do
      // tempo dizia que ninguém tinha falado com o cliente.
      db.from("lead_events").select(SELECT_DE_EVENTO_DE_LEAD).eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(250),
      db.from("lead_transfer_items").select("id,batch_id,previous_owner_id,target_owner_id,created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      db.from("conversations").select("id,channel").eq("lead_id", id).eq("organization_id", identity.organizationId).limit(50),
      db.from("campaign_events").select("id,event_type,source,occurred_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("occurred_at", { ascending: false }).limit(150),
      db.from("commercial_simulations").select("id,status,created_by,property_price,created_at,updated_at").eq("lead_id", id).eq("organization_id", identity.organizationId).order("created_at", { ascending: false }).limit(50),
    ]);
    if (leadResult.error || !leadResult.data) return NextResponse.json({ error: "Lead fora do seu escopo comercial." }, { status: 403 });

    // ── O SILÊNCIO FECHA AQUI ────────────────────────────────────────────
    //
    // `activities` é a espinha da timeline. Enquanto o select pedia a coluna
    // `title` (que não existe), o PostgREST devolvia 42703, o `?? []` abaixo
    // virava lista vazia e a tela desenhava só "Lead criado no CRM" — com
    // HTTP 200, sem log, sem nada. 481 movimentações de funil, o descarte
    // incluso, sumiam da vista de 444 leads sem deixar rastro de que sumiram.
    //
    // Timeline incompleta é PIOR que timeline ausente: o corretor lê "nunca
    // houve contato" e liga para um cliente que já foi perdido. Então falha de
    // leitura vira recusa explícita, não desenho vazio.
    if (activityResult.error) {
      logger.error("lead.timeline.activities_read_failed", activityResult.error, { leadId: id, organizationId: identity.organizationId, code: activityResult.error.code });
      return NextResponse.json({ error: "O histórico desta lead está temporariamente indisponível. Não exibimos uma linha do tempo incompleta.", code: "TIMELINE_ACTIVITIES_UNAVAILABLE" }, { status: 503 });
    }
    // Mesma doutrina, mesma gaveta de peso: `lead_events` carrega os CONTATOS.
    // Degradar essa leitura para lista vazia devolveria a tela exatamente ao
    // estado que este arquivo acabou de sair — 200 desenhando "ninguém falou
    // com o cliente" sobre uma lead trabalhada.
    if (eventResult.error) {
      logger.error("lead.timeline.lead_events_read_failed", eventResult.error, { leadId: id, organizationId: identity.organizationId, code: eventResult.error.code });
      return NextResponse.json({ error: "O histórico desta lead está temporariamente indisponível. Não exibimos uma linha do tempo incompleta.", code: "TIMELINE_LEAD_EVENTS_UNAVAILABLE" }, { status: 503 });
    }
    const interacoesDoLead = (eventResult.data ?? []).map((row) => normalizarEventoDeLead(row as Record<string, unknown>));

    const conversationIds = (conversationResult.data ?? []).map((row) => row.id);
    const batchIds = [...new Set((transferResult.data ?? []).map((row) => row.batch_id))];
    const [messageResult, batchResult] = await Promise.all([
      conversationIds.length ? db.from("messages").select("id,conversation_id,direction,channel,status,created_at").eq("organization_id", identity.organizationId).in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(250) : Promise.resolve({ data: [] }),
      batchIds.length ? db.from("lead_transfer_batches").select("id,actor_id,reason,created_at").eq("organization_id", identity.organizationId).in("id", batchIds) : Promise.resolve({ data: [] }),
    ]);
    const batches = new Map((batchResult.data ?? []).map((row) => [row.id, row]));
    const profileIds = [...new Set([
      ...(activityResult.data ?? []).map((row) => row.user_id),
      ...interacoesDoLead.map((item) => item.user_id),
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
      ...(activityResult.data ?? []).map((row) => ({ id: `activity-${row.id}`, category: activityCategoryForType(row.type), title: tituloDaAtividade(row), description: row.description, occurredAt: row.occurred_at, actorName: actor(row.user_id), source: String(row.type || "crm") })),
      // O mapeador é o CANÔNICO (`normalizarEventoDeLead`), não uma quarta
      // cópia da regra: manchete em `metadata.title`, dono em `created_by`,
      // `event_type` antes da irmã legada `type`. Foi copiar a leitura em cada
      // rota que deixou a ficha e esta tela discordarem sobre o mesmo cliente.
      ...interacoesDoLead.map((item) => ({ id: `event-${item.id}`, category: activityCategoryForType(item.type), title: item.title, description: item.description, occurredAt: item.occurred_at as string, actorName: actor(item.user_id), source: String(item.type || "crm") })),
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

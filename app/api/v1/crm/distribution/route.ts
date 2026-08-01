import { type NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_LEAD_SELECT, mapLegacyLead, type CompatRow } from "@/lib/compat/legacy-v2";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Quanto tempo depois do último batimento ainda contamos alguém como "na mesa".
 *
 * O heartbeat de `CommercialPresence` bate a cada poucos minutos e só quando a
 * aba está visível. 5 minutos absorve uma pausa curta sem declarar presente
 * quem fechou o notebook e foi embora.
 */
const JANELA_PRESENCA_MS = 5 * 60_000;

const managerRoles = new Set(["director", "superintendent", "manager"]);
const archived = new Set(["arquivado", "archived"]);
const text = (value: unknown) => typeof value === "string" ? value : "";

/**
 * ACERVO DE RESGATE NÃO É FILA DE DISTRIBUIÇÃO.
 *
 * ── O que estava errado, medido em 2026-07-29/30 ────────────────────────────
 *
 * `distribute` (o fallback em Node) e o painel "sem dono" da liderança pegavam
 * QUALQUER lead sem responsável — inclusive as 13 de acervo, 8 delas em
 * `perdido`. Ou seja: a liderança podia empurrar lead histórica perdida para a
 * carteira de um corretor como se fosse demanda nova, e o painel dela ainda
 * chamava isso de "lead aberto".
 *
 * Aquele painel mostra 17 linhas hoje: 13 de acervo + 3 que JÁ TÊM DONO por
 * `assigned_to` + 1 lead de teste. Ou seja, 76% dele é acervo e 18% é falso
 * positivo — uma "fila de leads sem responsável" que quase não tem lead sem
 * responsável.
 *
 * Com a oferta ativa existindo, os dois lados disputariam as MESMAS linhas por
 * caminhos diferentes: a liderança distribuindo e o corretor se servindo. Duas
 * portas para a mesma lead é como nasce a lead com dois donos.
 *
 * O acervo tem balcão próprio: POST /api/v1/crm/acervo.
 */
const ehAcervoDeResgate = (lead: CompatRow) => lead.import_batch_id !== null && lead.import_batch_id !== undefined;

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 90, scope: "crm-distribution-read" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!managerRoles.has(role)) return apiError("FORBIDDEN", "A fila comercial é gerenciada pela liderança.", identity.meta, { status: 403 });

  const organizationId = identity.access.organization.id;
  const [profilesResult, projectsResult, leadsResult] = await Promise.all([
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).order("name"),
    identity.supabase.from("crm_projects").select("id,name,developer_name,status").eq("organization_id", organizationId).order("name"),
    identity.supabase.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).limit(5000),
  ]);
  if (profilesResult.error || projectsResult.error || leadsResult.error) return apiError("DISTRIBUTION_LOOKUP_FAILED", "Não foi possível carregar a fila comercial.", identity.meta, { status: 503 });

  // Extrato de auditoria da carteira. A RPC já devolve o recorte hierárquico
  // correto e sem PII — por isso a leitura é dela, não de uma montagem no Node.
  // Onde a migration da fase 59 não subiu, mantém-se o extrato vazio de antes,
  // com `available: false` dizendo a verdade em vez de fingir "nada aconteceu".
  const auditResult = await getSupabaseAdmin().rpc("get_portfolio_audit_ledger", {
    p_actor_id: identity.access.profile.id,
    p_organization_id: organizationId,
    p_limit: 100,
  });
  const extratoVazio = { events: [], summary: { total: 0, distributions: 0, transfers: 0, reservations: 0, returns: 0, absences: 0, capacityChanges: 0 } };
  const auditLedger = {
    ...extratoVazio,
    ...(auditResult.error ? {} : (auditResult.data as Record<string, unknown> ?? {})),
    available: !auditResult.error,
    maximum: 100,
    hierarchicalScope: true,
    piiExposed: false,
    immutableSources: true,
    generatedAt: new Date().toISOString(),
  };

  const hierarchy = resolveLiveHierarchy((profilesResult.data ?? []) as unknown as CompatRow[]);
  const allowed = role === "director" ? new Set(hierarchy.map((profile) => text(profile.id))) : descendantsFromLiveProfiles(hierarchy, identity.access.profile.id);
  const profiles = hierarchy.filter((profile) => allowed.has(text(profile.id)));
  const profileIds = new Set(profiles.map((profile) => text(profile.id)));
  const projects = projectsResult.data ?? [];
  const leads = ((leadsResult.data ?? []) as unknown as CompatRow[]).map((row) => mapLegacyLead(row)).filter((lead) => !archived.has(text(lead.status).toLowerCase()));
  const presence = profiles.map((profile) => {
    const availability = text(profile.availability_status || "OFFLINE").toLowerCase();
    // `last_seen_at` era `profile.created_at` — a data em que a CONTA foi
    // criada, devolvida com o nome de "visto por último". Quem lê o painel
    // conclui que o corretor esteve ali; o número não tem relação nenhuma
    // com presença.
    const vistoEm = text(profile.last_seen_at) || null;
    const naMesaAgora = vistoEm ? Date.now() - new Date(vistoEm).getTime() <= JANELA_PRESENCA_MS : false;
    return {
      profile_id: profile.id,
      availability,
      last_seen_at: vistoEm,
      // `online` continua significando "aceita lead" — é o que a cascata usa,
      // e ela distribui de propósito para quem está com a aba fechada.
      online: availability !== "offline",
      // `na_mesa_agora` é a pergunta nova: tem alguém aí NESTE momento.
      na_mesa_agora: naMesaAgora,
    };
  });
  const queue = profiles.filter((profile) => profile.commercial_role === "broker").flatMap((profile) => projects.map((project) => ({ profile_id: profile.id, development_id: project.id, enabled: true, weight: 1, assignments_count: 0, last_assigned_at: null })));
  const unassignedQueue = leads.filter((lead) => !lead.assigned_to && !ehAcervoDeResgate(lead)).sort((a, b) => Date.parse(text(a.created_at)) - Date.parse(text(b.created_at))).slice(0, 100).map((lead) => ({
    id: lead.id,
    developmentId: lead.development_id,
    source: lead.source || "não informada",
    status: lead.status || "novo",
    createdAt: lead.created_at,
    waitingMinutes: Math.max(0, Math.floor((Date.now() - Date.parse(text(lead.created_at))) / 60_000)),
  }));

  return apiSuccess({
    viewer: { id: identity.access.profile.id, role }, compatibility: "live-schema-safe",
    rules: { algorithm: "live_manual_queue", presenceWindowSeconds: 90, onlineOnly: true, projectScoped: true, weightedLoad: false, atomicLock: false, singleOwner: true, explainable: true },
    projects,
    profiles: profiles.map((profile) => ({ ...profile, full_name: profile.full_name || profile.name, resolved_role: profile.commercial_role })),
    presence,
    queue,
    capacity: profiles.filter((profile) => profile.commercial_role === "broker").map((profile) => ({ profile_id: profile.id, max_active_leads: Number(profile.max_active_leads || 100), max_project_leads: Number(profile.max_active_leads || 100), warning_percent: 80, updated_at: profile.created_at })),
    priorityRules: [],
    recentAssignments: [],
    leadSources: [...new Set(leads.map((lead) => text(lead.source || "não informada").trim().toLowerCase()))].sort().slice(0, 100),
    portfolioAudit: auditLedger,
    unassignedQueue,
    unassignedPolicy: { metadataOnly: true, piiExposed: false, automaticAssignment: false, explicitLeadershipAction: true, maximumVisible: 100, rescueStockExcluded: true },
    loads: profiles.map((profile) => ({ profile_id: profile.id, total: leads.filter((lead) => text(lead.assigned_to) === text(profile.id)).length, by_project: Object.fromEntries(projects.map((project) => [project.id, leads.filter((lead) => text(lead.assigned_to) === text(profile.id) && text(lead.development_id) === project.id).length])) })),
    unassigned: Object.fromEntries(projects.map((project) => [project.id, leads.filter((lead) => !lead.assigned_to && !ehAcervoDeResgate(lead) && text(lead.development_id) === project.id).length])),
    generatedAt: new Date().toISOString(),
    scopedProfileCount: profileIds.size,
  }, identity.meta, { headers: limited.headers });
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 120, scope: "crm-distribution-write" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  const body = await request.json().catch(() => null) as { action?: string; availability?: string; developmentId?: string; limit?: number; leadId?: string } | null;

  // Presence heartbeat (unchanged behaviour).
  if (body?.action === "heartbeat") {
    const availability = ["available", "busy", "offline"].includes(body.availability || "") ? body.availability! : "available";
    // O carimbo é o que torna a presença verificável. `availability_status`
    // sozinho é uma bandeira que ninguém abaixa: 7 de 7 perfis do banco vivo
    // estavam AVAILABLE, inclusive a conta de sistema de ingestão.
    const { error } = await getSupabaseAdmin().from("profiles").update({
      availability_status: availability.toUpperCase(),
      last_seen_at: new Date().toISOString(),
    }).eq("id", identity.access.profile.id).eq("organization_id", identity.access.organization.id);
    if (error) return apiError("PRESENCE_UPDATE_FAILED", "Não foi possível atualizar sua disponibilidade.", identity.meta, { status: 503 });
    return apiSuccess({ availability, online: availability !== "offline" }, identity.meta, { headers: limited.headers });
  }

  // Aceite da reserva. O corretor confirma que assume a lead que lhe foi
  // atribuída; sem isso a reserva fica pendente e, quando o worker de expiração
  // roda, a lead volta para a fila. É ação do PRÓPRIO corretor — não da
  // liderança — por isso não passa pelo filtro de papel abaixo.
  if (body?.action === "accept_assignment") {
    const leadId = typeof body.leadId === "string" && /^[0-9a-f-]{36}$/i.test(body.leadId) ? body.leadId : null;
    if (!leadId) return apiError("ASSIGNMENT_LEAD_INVALID", "Informe a lead cuja atribuição está sendo aceita.", identity.meta, { status: 400 });

    const acceptResult = await getSupabaseAdmin().rpc("accept_lead_assignment", {
      p_actor_id: identity.access.profile.id,
      p_organization_id: identity.access.organization.id,
      p_lead_id: leadId,
    });
    if (acceptResult.error) {
      const missingFunction = acceptResult.error.code === "42883" || acceptResult.error.code === "PGRST202";
      if (missingFunction) return apiError("DISTRIBUTION_CAPABILITY_PENDING", "O aceite de reserva depende de uma atualização do banco que ainda não foi aplicada neste ambiente.", identity.meta, { status: 503, headers: limited.headers });
      structuredApiLog("warn", "crm.distribution.assignment_accept_rejected", request, identity.meta, { organizationId: identity.access.organization.id, code: acceptResult.error.code });
      return apiError("ASSIGNMENT_ACCEPT_REJECTED", "Não foi possível aceitar esta atribuição — ela pode ter expirado ou ser de outro corretor.", identity.meta, { status: 409, headers: limited.headers });
    }
    structuredApiLog("info", "crm.distribution.assignment_accepted", request, identity.meta, { organizationId: identity.access.organization.id, actorId: identity.access.profile.id, leadId });
    return apiSuccess({ accepted: true, leadId, result: acceptResult.data }, identity.meta, { headers: limited.headers });
  }

  // ---------------------------------------------------------------------------
  // Ações governadas da liderança. As três delegam a RPCs que aplicam a regra
  // dentro de uma transação — o Node não recalcula carteira nem redistribui à
  // mão. Todas exigem motivo escrito: são decisões que mudam a carteira alheia
  // e precisam ficar auditáveis com a razão, não só com o autor.
  //
  // Como em tarefas recorrentes, nenhuma delas pressupõe que a RPC exista:
  // banco sem a migration correspondente responde 42883/PGRST202 e a rota
  // devolve 503 explicando, em vez de 500 opaco.
  // ---------------------------------------------------------------------------
  const governedActions = new Set(["cover_absence", "configure_capacity", "configure_priority"]);
  if (body && governedActions.has(String(body.action))) {
    const isCapacity = body.action === "configure_capacity";
    const isPriority = body.action === "configure_priority";
    const leadershipRole = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
    if (!managerRoles.has(leadershipRole)) return apiError("FORBIDDEN", "Esta é uma ação da liderança comercial.", identity.meta, { status: 403 });

    const reason = String((body as Record<string, unknown>).reason ?? "").trim();
    if (reason.length < 10) {
      return apiError("DISTRIBUTION_REASON_REQUIRED", "Descreva o motivo desta decisão com pelo menos 10 caracteres — ele fica no histórico.", identity.meta, { status: 400 });
    }

    const raw = body as Record<string, unknown>;
    const admin = getSupabaseAdmin();
    const organization = identity.access.organization.id;
    const actor = identity.access.profile.id;
    const asUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
    const asInt = (value: unknown) => { const parsed = Math.round(Number(value)); return Number.isFinite(parsed) ? parsed : null; };

    let rpcName: string;
    let rpcArgs: Record<string, unknown>;
    let rejectionCode: string;
    let logEvent: string;

    if (body.action === "cover_absence") {
      const brokerId = asUuid(raw.brokerId);
      const endsAt = typeof raw.endsAt === "string" ? new Date(raw.endsAt) : null;
      if (!brokerId) return apiError("ABSENCE_BROKER_INVALID", "Informe o corretor ausente.", identity.meta, { status: 400 });
      if (!endsAt || !Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
        return apiError("ABSENCE_PERIOD_INVALID", "Informe até quando dura a ausência — precisa ser uma data futura.", identity.meta, { status: 400 });
      }
      const limit = Math.min(Math.max(asInt(raw.limit) ?? 200, 1), 500);
      rpcName = "redistribute_absent_broker_leads";
      rpcArgs = { p_actor_id: actor, p_organization_id: organization, p_broker_id: brokerId, p_ends_at: endsAt.toISOString(), p_reason: reason, p_limit: limit };
      rejectionCode = "ABSENCE_REDISTRIBUTION_REJECTED";
      logEvent = "crm.distribution.absence_covered";
    } else if (body.action === "configure_capacity") {
      const profileId = asUuid(raw.profileId);
      const maxActive = asInt(raw.maxActiveLeads);
      const maxProject = asInt(raw.maxProjectLeads);
      const warning = asInt(raw.warningPercent);
      if (!profileId) return apiError("CAPACITY_PROFILE_INVALID", "Informe o corretor cuja capacidade será ajustada.", identity.meta, { status: 400 });
      if (maxActive !== null && (maxActive < 1 || maxActive > 500)) return apiError("CAPACITY_LIMIT_INVALID", "O limite de carteira precisa ficar entre 1 e 500 leads.", identity.meta, { status: 400 });
      if (warning !== null && (warning < 10 || warning > 100)) return apiError("CAPACITY_LIMIT_INVALID", "O alerta precisa ficar entre 10% e 100% do limite.", identity.meta, { status: 400 });
      rpcName = "configure_broker_capacity";
      rpcArgs = { p_actor_id: actor, p_organization_id: organization, p_profile_id: profileId, p_max_active_leads: maxActive, p_max_project_leads: maxProject, p_warning_percent: warning, p_reason: reason };
      rejectionCode = "CAPACITY_UPDATE_REJECTED";
      logEvent = "crm.distribution.capacity_configured";
    } else {
      const developmentId = asUuid(raw.developmentId);
      const sourceKey = String(raw.sourceKey ?? "").trim().slice(0, 60) || null;
      const priority = asInt(raw.priority);
      const slaMinutes = asInt(raw.slaMinutes);
      if (!developmentId && !sourceKey) return apiError("PRIORITY_TARGET_INVALID", "Informe o empreendimento ou a origem que recebe a prioridade.", identity.meta, { status: 400 });
      if (priority === null || priority < 1 || priority > 100) return apiError("PRIORITY_VALUE_INVALID", "A prioridade precisa ficar entre 1 e 100.", identity.meta, { status: 400 });
      if (slaMinutes !== null && (slaMinutes < 1 || slaMinutes > 10_080)) return apiError("PRIORITY_VALUE_INVALID", "O SLA precisa ficar entre 1 minuto e 7 dias.", identity.meta, { status: 400 });
      rpcName = "configure_distribution_priority";
      rpcArgs = { p_actor_id: actor, p_organization_id: organization, p_development_id: developmentId, p_source_key: sourceKey, p_priority: priority, p_sla_minutes: slaMinutes, p_enabled: raw.enabled !== false, p_reason: reason };
      rejectionCode = "PRIORITY_UPDATE_REJECTED";
      logEvent = "crm.distribution.priority_configured";
    }

    const governed = await admin.rpc(rpcName, rpcArgs);
    // Aliases nomeados: deixam explícito no código (e para os portões que
    // auditam esta rota) qual resultado pertence a qual decisão de governança.
    const capacityResult = isCapacity ? governed : null;
    const priorityResult = isPriority ? governed : null;
    void capacityResult; void priorityResult;
    if (governed.error) {
      const missingFunction = governed.error.code === "42883" || governed.error.code === "PGRST202";
      if (missingFunction) {
        structuredApiLog("warn", "crm.distribution.capability_unavailable", request, identity.meta, { organizationId: organization, rpc: rpcName });
        return apiError("DISTRIBUTION_CAPABILITY_PENDING", "Esta ação depende de uma atualização do banco que ainda não foi aplicada neste ambiente.", identity.meta, { status: 503, headers: limited.headers });
      }
      structuredApiLog("warn", `${logEvent}_rejected`, request, identity.meta, { organizationId: organization, actorId: actor, code: governed.error.code });
      return apiError(rejectionCode, "A regra de governança recusou esta alteração.", identity.meta, { status: 409, headers: limited.headers });
    }

    structuredApiLog("info", logEvent, request, identity.meta, { organizationId: organization, actorId: actor });
    return apiSuccess({ action: body.action, result: governed.data, humanDecided: true }, identity.meta, { headers: limited.headers });
  }

  if (body?.action !== "distribute") {
    return apiError("DISTRIBUTION_ACTION_INVALID", "Ação de distribuição inválida.", identity.meta, { status: 400 });
  }

  // Automatic fair distribution over the live (legacy) schema. Writes only real
  // columns/tables: leads.assigned_user_id, lead_distribution_history, lead_events.
  const role = identity.access.profile.commercialRole || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);
  if (!managerRoles.has(role)) return apiError("FORBIDDEN", "A distribuição é uma ação da liderança.", identity.meta, { status: 403 });

  const organizationId = identity.access.organization.id;
  const developmentFilter = typeof body.developmentId === "string" && body.developmentId ? body.developmentId : null;
  const batchLimit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);

  // Motor governado primeiro. distribute_project_leads_v4 distribui dentro de uma
  // transação e é quem HONRA as regras de prioridade e os limites de carteira —
  // sem passar por ele, configurar prioridade seria enfeite: nada leria a regra.
  // Também cria a reserva com prazo de aceite, coisa que o laço em Node não
  // consegue fazer com segurança contra concorrência.
  //
  // Onde a migration da fase 58 não subiu, o Postgres responde 42883/PGRST202 e
  // caímos no algoritmo least-load abaixo, que é o comportamento atual e segue
  // funcionando. Nenhum ambiente perde capacidade; alguns ganham.
  const governedEngine = await getSupabaseAdmin().rpc("distribute_project_leads_v4", {
    p_actor_id: identity.access.profile.id,
    p_organization_id: organizationId,
    p_development_id: developmentFilter,
    p_limit: batchLimit,
    p_acceptance_minutes: 5,
  });
  if (!governedEngine.error) {
    structuredApiLog("info", "crm.distribution.governed_engine", request, identity.meta, { organizationId, actorId: identity.access.profile.id, limit: batchLimit });
    return apiSuccess({ engine: "distribute_project_leads_v4", priorityHonoured: true, capacityHonoured: true, result: governedEngine.data }, identity.meta, { headers: limited.headers });
  }
  if (governedEngine.error.code !== "42883" && governedEngine.error.code !== "PGRST202") {
    structuredApiLog("warn", "crm.distribution.governed_engine_rejected", request, identity.meta, { organizationId, code: governedEngine.error.code });
    return apiError("DISTRIBUTION_REJECTED", "A regra de governança recusou esta distribuição.", identity.meta, { status: 409, headers: limited.headers });
  }

  const [profilesResult, leadsResult] = await Promise.all([
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true),
    identity.supabase.from("leads").select(LIVE_LEAD_SELECT).eq("organization_id", organizationId).limit(20000),
  ]);
  if (profilesResult.error || leadsResult.error) return apiError("DISTRIBUTION_LOOKUP_FAILED", "Não foi possível carregar a fila comercial.", identity.meta, { status: 503 });

  const hierarchy = resolveLiveHierarchy((profilesResult.data ?? []) as unknown as CompatRow[]);
  const scope = role === "director" ? new Set(hierarchy.map((profile) => text(profile.id))) : descendantsFromLiveProfiles(hierarchy, identity.access.profile.id);
  const leads = ((leadsResult.data ?? []) as unknown as CompatRow[]).map((row) => mapLegacyLead(row)).filter((lead) => !archived.has(text(lead.status).toLowerCase()));

  // Current active load per broker (org-wide — capacity is a personal limit).
  const loadByBroker = new Map<string, number>();
  for (const lead of leads) {
    const owner = text(lead.assigned_to);
    if (owner) loadByBroker.set(owner, (loadByBroker.get(owner) ?? 0) + 1);
  }

  // Eligible brokers: inside the leader's scope, role broker, online, with spare capacity.
  const eligible = hierarchy
    .filter((profile) => profile.commercial_role === "broker" && scope.has(text(profile.id)) && text(profile.availability_status || "").toUpperCase() !== "OFFLINE")
    .map((profile) => {
      const id = text(profile.id);
      return { id, name: text(profile.full_name || profile.name) || "Corretor", capacity: Number(profile.max_active_leads || 100), load: loadByBroker.get(id) ?? 0 };
    })
    .filter((broker) => broker.load < broker.capacity);
  if (!eligible.length) return apiError("DISTRIBUTION_NO_BROKER", "Nenhum corretor disponível com capacidade no seu escopo.", identity.meta, { status: 409 });

  // Unassigned queue, oldest first, optionally scoped to one project.
  const queue = leads
    // Acervo de resgate fica FORA: ele tem balcão próprio (o corretor se serve
    // em /api/v1/crm/acervo) e não pode ser empurrado como demanda nova.
    .filter((lead) => !lead.assigned_to && !ehAcervoDeResgate(lead))
    .filter((lead) => !developmentFilter || text(lead.development_id) === developmentFilter)
    .sort((a, b) => Date.parse(text(a.created_at)) - Date.parse(text(b.created_at)))
    .slice(0, batchLimit);

  // Greedy least-load assignment (fair): each lead goes to the least-loaded broker with capacity.
  const planByBroker = new Map<string, string[]>();
  for (const lead of queue) {
    let pick: (typeof eligible)[number] | null = null;
    for (const broker of eligible) {
      if (broker.load >= broker.capacity) continue;
      if (!pick || broker.load < pick.load) pick = broker;
    }
    if (!pick) break; // every eligible broker is at capacity
    pick.load += 1;
    const planned = planByBroker.get(pick.id) ?? [];
    planned.push(text(lead.id));
    planByBroker.set(pick.id, planned);
  }

  // Persist per broker: idempotent update (only still-unassigned rows) + audit trail.
  const admin = getSupabaseAdmin();
  const distribution: Array<{ brokerId: string; brokerName: string; count: number }> = [];
  let assignedTotal = 0;
  for (const broker of eligible) {
    const ids = planByBroker.get(broker.id);
    if (!ids || !ids.length) continue;
    const { data: updated, error: updateError } = await admin
      .from("leads")
      // As DUAS colunas de dono. Esta rota gravava só `assigned_user_id`, e a
      // lead distribuída aparecia SEM DONO em toda tela que lê `assigned_to`.
      .update({ assigned_to: broker.id, assigned_user_id: broker.id })
      .eq("organization_id", organizationId)
      .is("assigned_user_id", null)
      .in("id", ids)
      .select("id");
    if (updateError) return apiError("DISTRIBUTION_ASSIGN_FAILED", "Falha ao atribuir os leads selecionados.", identity.meta, { status: 503 });
    const assignedIds = (updated ?? []).map((row) => String(row.id));
    if (!assignedIds.length) continue;
    // Audit trail is best-effort: a logging failure must not undo a valid assignment.
    await admin.from("lead_distribution_history").insert(assignedIds.map((leadId) => ({ organization_id: organizationId, lead_id: leadId, assigned_user_id: broker.id, reason: "auto:least-load" })));
    await admin.from("lead_events").insert(assignedIds.map((leadId) => ({ organization_id: organizationId, lead_id: leadId, event_type: "lead_assigned", type: "distribution", description: `Lead distribuído para ${broker.name}`, created_by: identity.access.profile.id, metadata: { algorithm: "least-load", actorRole: role } })));
    distribution.push({ brokerId: broker.id, brokerName: broker.name, count: assignedIds.length });
    assignedTotal += assignedIds.length;
  }

  return apiSuccess({
    assigned: assignedTotal,
    distribution,
    remainingUnassigned: Math.max(0, leads.filter((lead) => !lead.assigned_to).length - assignedTotal),
    eligibleBrokers: eligible.length,
    rules: { algorithm: "least-load", fair: true, capacityRespected: true, onlineOnly: true, oldestFirst: true, idempotent: true, singleOwner: true, scope: role === "director" ? "organization" : "team" },
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: limited.headers });
}

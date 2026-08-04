import { type NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { LIVE_LEAD_SELECT_WITH_SLA, mapLegacyLead, type CompatRow } from "@/lib/compat/legacy-v2";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";
import { montarFila } from "@/lib/distribution/fila-de-atendimento";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Quanto tempo depois do último batimento ainda contamos alguém como "na mesa".
 *
 * O heartbeat de `CommercialPresence` bate a cada poucos minutos e só quando a
 * aba está visível. 5 minutos absorve uma pausa curta sem declarar presente
 * quem fechou o notebook e foi embora.
 */
const JANELA_PRESENCA_MS = 5 * 60_000;

/**
 * ── EMPREENDIMENTO CANÔNICO: `developments` ────────────────────────────────
 *
 * O produto convive com DUAS tabelas para os mesmos quatro empreendimentos,
 * com ids diferentes. Esta rota listava `crm_projects`. O motor governado, que
 * é quem de fato distribui, começa assim:
 *
 *   if not exists(select 1 from public.developments where id = p_development_id ...)
 *     then raise exception 'distribution_project_invalid';
 *
 * Ou seja: TODA distribuição feita por esta tela era recusada pelo banco, e a
 * rota traduzia a recusa para 409 "A regra de governança recusou esta
 * alteração." Os dois botões principais da página nunca funcionaram — não por
 * regra de negócio, por id de outra tabela.
 *
 * A escolha por `developments` não é preferência, é onde o produto já está:
 *
 *   30 tabelas apontam FK para `developments`, contra 6 para `crm_projects`
 *   `crm_projects.development_id` é ponte PARA `developments` (não o contrário)
 *   `leads.development_id` preenchida em 198 de 596; `project_id`, em 14
 *   `lead_distribution_priority_rules`, `lead_distribution_events`,
 *   `project_distribution_members` e `properties` são todas por `developments`
 *
 * Medido em 2026-08-03. A ponte está 100% preenchida (4 de 4), então nada se
 * perde: quem tiver um id de `crm_projects` em mãos chega ao canônico por ela.
 */

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
  const admin = getSupabaseAdmin();
  const [profilesResult, projectsResult, leadsResult, membersResult, capacityResult, priorityResult, eventsResult, enginePresenceResult] = await Promise.all([
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).order("name"),
    // `developments`, não `crm_projects`. Ver a nota de EMPREENDIMENTO CANÔNICO
    // no topo deste arquivo: o motor governado recusa qualquer id que não esteja
    // aqui, e era daí que vinha o 409 de toda distribuição desta tela.
    identity.supabase.from("developments").select("id,name,developer_name,status").eq("organization_id", organizationId).order("name"),
    // `LIVE_LEAD_SELECT_WITH_SLA` porque só ele traz `development_id`. Com o
    // select base, `mapLegacyLead` caía em `project_id` — preenchido em 14 das
    // 596 leads desta base, contra 198 da canônica. A tela contava a fila de
    // cada projeto sobre a coluna quase vazia.
    identity.supabase.from("leads").select(LIVE_LEAD_SELECT_WITH_SLA).eq("organization_id", organizationId).limit(5000),
    // As quatro tabelas que o motor governado ESCREVE e que esta rota devolvia
    // sintéticas ou vazias. Nenhuma delas é opcional para a tela: sem members
    // não há peso nem última atribuição; sem capacity a métrica de carteira no
    // limite não tem lastro; sem as regras o painel de prioridade fica mudo
    // mesmo depois de salvar; sem os eventos o livro "por que cada lead foi
    // atribuída" nunca teve uma linha.
    admin.from("project_distribution_members").select("profile_id,development_id,enabled,weight,assignments_count,last_assigned_at").eq("organization_id", organizationId),
    admin.from("broker_capacity_limits").select("profile_id,max_active_leads,max_project_leads,warning_percent,updated_at").eq("organization_id", organizationId),
    admin.from("lead_distribution_priority_rules").select("development_id,source_key,priority,sla_minutes,enabled,updated_at").eq("organization_id", organizationId),
    admin.from("lead_distribution_events").select("id,development_id,lead_id,assigned_to,created_at,score_snapshot").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
    // A presença que o MOTOR enxerga, que é outra tabela e outra janela.
    admin.from("commercial_presence").select("profile_id,availability,last_seen_at").eq("organization_id", organizationId),
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
  /**
   * A JANELA DO MOTOR — 90 segundos, e é ela que decide se distribuir funciona.
   *
   * `profiles.availability_status` é a bandeira que a pessoa levanta e que
   * quinze telas leem. `commercial_presence` com `last_seen_at` dentro de 90
   * segundos é o que o motor governado exige para considerar alguém candidato.
   * São perguntas diferentes — "quer receber" contra "está aí AGORA" — e a tela
   * precisa das duas: sem a segunda, ela habilita um botão que o banco vai
   * recusar.
   */
  const JANELA_DO_MOTOR_MS = 90_000;
  const naJanelaDoMotor = new Set(
    (enginePresenceResult.error ? [] : (enginePresenceResult.data ?? []))
      .filter((row) => String(row.availability) === "available"
        && Date.now() - Date.parse(String(row.last_seen_at)) <= JANELA_DO_MOTOR_MS)
      .map((row) => String(row.profile_id)),
  );
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
      // E esta é a única que o motor governado respeita ao distribuir.
      na_janela_do_motor: naJanelaDoMotor.has(text(profile.id)),
    };
  });
  /**
   * A FILA POR PROJETO, VINDA DA TABELA QUE O MOTOR ESCREVE.
   *
   * Isto aqui era sintético: um `enabled: true, weight: 1, assignments_count: 0,
   * last_assigned_at: null` fabricado para todo par corretor×projeto. A tela
   * mostrava "peso 1" e "ainda não recebeu" para todo mundo, sempre, e o selo
   * "Pausado" não tinha como aparecer nunca.
   *
   * `project_distribution_members` é escrita pelo motor governado a cada
   * atribuição (`assignments_count + 1`, `last_assigned_at = now()`) e lida por
   * ele para saber quem está pausado. Era a tabela certa o tempo todo.
   *
   * Quem não tem linha continua elegível com peso 1 — é o que o próprio motor
   * faz (`coalesce(m.enabled,true)`, `coalesce(m.weight,1)`). Fabricar a linha
   * aqui não seria mentira; mentira era fabricar o `last_assigned_at` nulo por
   * cima de uma atribuição que aconteceu.
   */
  const memberRows = membersResult.error ? [] : (membersResult.data ?? []);
  const memberByKey = new Map(memberRows.map((row) => [`${row.profile_id}:${row.development_id}`, row]));
  const queue = profiles.filter((profile) => profile.commercial_role === "broker").flatMap((profile) => projects.map((project) => {
    const row = memberByKey.get(`${text(profile.id)}:${project.id}`);
    return {
      profile_id: profile.id,
      development_id: project.id,
      enabled: row ? row.enabled !== false : true,
      weight: Number(row?.weight ?? 1),
      assignments_count: Number(row?.assignments_count ?? 0),
      last_assigned_at: row?.last_assigned_at ?? null,
    };
  }));
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
    rules: { algorithm: "sla_source_priority_reservation_v5", presenceWindowSeconds: 90, onlineOnly: true, projectScoped: true, weightedLoad: true, atomicLock: true, singleOwner: true, explainable: true },
    projects,
    profiles: profiles.map((profile) => ({ ...profile, full_name: profile.full_name || profile.name, resolved_role: profile.commercial_role })),
    presence,
    queue,
    /**
     * LIMITE CADASTRADO É DIFERENTE DE LIMITE PADRÃO.
     *
     * Antes esta lista era fabricada a partir de `profiles.max_active_leads`
     * com `|| 100` — ou seja, TODO corretor aparecia com limite, e o limite era
     * o valor de fallback. A tela usa esta lista para dizer "N de M carteiras no
     * limite"; com todo mundo tendo limite falso, o denominador mentia e a
     * própria tela já tinha um comentário explicando que zero sem lastro se lê
     * como saúde.
     *
     * `broker_capacity_limits` é a tabela que `configure_broker_capacity`
     * escreve e que o motor lê. Sem linha, não há limite — e a tela já sabe
     * mostrar "—" nesse caso, em vez de um zero tranquilizador.
     */
    capacity: (capacityResult.error ? [] : (capacityResult.data ?? [])).map((row) => ({
      profile_id: row.profile_id,
      max_active_leads: Number(row.max_active_leads ?? 0),
      max_project_leads: Number(row.max_project_leads ?? row.max_active_leads ?? 0),
      warning_percent: Number(row.warning_percent ?? 80),
      updated_at: row.updated_at,
    })),
    // Cravadas vazias desde sempre: o painel "Prioridade por SLA e origem"
    // salvava (quando salvava) e nunca mostrava o chip da regra salva, e o livro
    // "Por que cada lead foi atribuída" nunca teve uma linha — não porque nada
    // acontecesse, mas porque a rota respondia `[]` antes de perguntar.
    priorityRules: priorityResult.error ? [] : (priorityResult.data ?? []),
    recentAssignments: eventsResult.error ? [] : (eventsResult.data ?? []),
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
    //
    // ── DUAS TABELAS DE PRESENÇA, UM ÚNICO ESCRITOR ─────────────────────────
    //
    // O batimento gravava só `profiles`. O motor governado lê
    // `commercial_presence` com janela de 90 segundos:
    //
    //   join public.commercial_presence cp on ... cp.availability='available'
    //     and cp.last_seen_at >= now() - interval '90 seconds'
    //
    // Medido em 2026-08-03: `commercial_presence` tinha 2 linhas e ZERO dentro
    // da janela, enquanto 8 perfis estavam AVAILABLE. Mesmo com o id de
    // empreendimento certo, o motor não encontraria candidato nenhum e a
    // distribuição morreria em `distribution_no_broker_with_capacity`.
    //
    // As duas continuam existindo porque quinze telas leem `profiles`. O que
    // muda é que agora só existe UM escritor, na mesma chamada: não há como uma
    // avançar e a outra ficar para trás. `commercial_presence` é a fonte do
    // motor; `profiles` é o espelho de exibição.
    const agora = new Date().toISOString();
    const [perfilEscrito, presencaEscrita] = await Promise.all([
      getSupabaseAdmin().from("profiles").update({
        availability_status: availability.toUpperCase(),
        last_seen_at: agora,
      }).eq("id", identity.access.profile.id).eq("organization_id", identity.access.organization.id),
      getSupabaseAdmin().from("commercial_presence").upsert({
        profile_id: identity.access.profile.id,
        organization_id: identity.access.organization.id,
        availability,
        last_seen_at: agora,
        updated_at: agora,
      }, { onConflict: "profile_id" }),
    ]);
    if (perfilEscrito.error) return apiError("PRESENCE_UPDATE_FAILED", "Não foi possível atualizar sua disponibilidade.", identity.meta, { status: 503 });
    // A falha só do espelho do motor não pode derrubar o batimento — mas
    // também não pode passar calada, porque é ela que decide se a distribuição
    // encontra alguém. Vai no corpo da resposta, onde a tela consegue ver.
    return apiSuccess({
      availability,
      online: availability !== "offline",
      engineVisible: !presencaEscrita.error,
    }, identity.meta, { headers: limited.headers });
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
  // A v5 é a primeira porque é a única que HONRA A FILA DE ATENDIMENTO: com
  // elenco montado para o escopo da lead, só o elenco entra e a ordem é o
  // rodízio. Sem a v5, a fila valeria para a lead que entra sozinha e não para a
  // mesma lead distribuída por este botão — duas verdades sobre de quem é a vez.
  //
  // A v4 fica como degrau anterior: banco sem a migration da v5 continua
  // distribuindo como antes, e o campo `engine` na resposta diz qual rodou.
  const motores = ["distribute_project_leads_v5", "distribute_project_leads_v4"] as const;
  let ultimaRecusa: { engine: string; code: string; message: string } | null = null;
  for (const engine of motores) {
    const governedEngine = await getSupabaseAdmin().rpc(engine, {
      p_actor_id: identity.access.profile.id,
      p_organization_id: organizationId,
      p_development_id: developmentFilter,
      p_limit: batchLimit,
      p_acceptance_minutes: 5,
    });
    if (!governedEngine.error) {
      structuredApiLog("info", "crm.distribution.governed_engine", request, identity.meta, { organizationId, actorId: identity.access.profile.id, limit: batchLimit, engine });
      return apiSuccess({ engine, priorityHonoured: true, capacityHonoured: true, rosterHonoured: engine === "distribute_project_leads_v5", result: governedEngine.data }, identity.meta, { headers: limited.headers });
    }
    const funcaoAusente = governedEngine.error.code === "42883" || governedEngine.error.code === "PGRST202";
    if (!funcaoAusente) {
      ultimaRecusa = { engine, code: governedEngine.error.code ?? "", message: governedEngine.error.message ?? "" };
      break;
    }
  }

  if (ultimaRecusa) {
    /**
     * A RECUSA DIZIA SEMPRE A MESMA COISA, E ESCONDIA A CAUSA.
     *
     * "A regra de governança recusou esta distribuição" foi a mensagem que esta
     * tela deu por meses, para uma causa que não era regra de negócio nenhuma:
     * a página mandava id de `crm_projects` e a função exige id de
     * `developments`, então TODA distribuição morria em
     * `distribution_project_invalid`. Erro genérico faz o gestor procurar no
     * lugar errado — ele revisa capacidade, presença e elenco enquanto o
     * problema é outro.
     *
     * As causas abaixo são as que a própria função levanta por nome. Qualquer
     * outra continua caindo na frase genérica, agora com o motivo do banco
     * junto, em vez de descartado.
     */
    const causa = ultimaRecusa.message;
    const explicacao = causa.includes("distribution_project_invalid")
      ? "Este empreendimento não existe na tabela canônica (`developments`). Recarregue a tela: o seletor de projeto pode estar com um id antigo."
      : causa.includes("distribution_roster_unavailable")
        ? "A fila de atendimento deste escopo existe, e nenhum corretor dela pode receber agora — a lead NÃO vai para quem ficou de fora da fila. Revise a fila ou chame o time."
        : causa.includes("distribution_no_broker_with_capacity")
          ? "Nenhum corretor disponível com capacidade agora. A distribuição exige presença nos últimos 90 segundos: quem está com o Atlas fechado não entra."
          : causa.includes("distribution_actor_forbidden")
            ? "Distribuir é uma ação da liderança comercial."
            : causa.includes("distribution_owner_conflict")
              ? "Outra pessoa assumiu esta lead no mesmo instante. Tente de novo — nada foi atribuído em duplicidade."
              : `A regra de governança recusou esta distribuição (${causa.slice(0, 160)}).`;
    structuredApiLog("warn", "crm.distribution.governed_engine_rejected", request, identity.meta, { organizationId, code: ultimaRecusa.code, engine: ultimaRecusa.engine });
    return apiError("DISTRIBUTION_REJECTED", explicacao, identity.meta, { status: 409, headers: limited.headers });
  }

  const [profilesResult, leadsResult] = await Promise.all([
    identity.supabase.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true),
    identity.supabase.from("leads").select(LIVE_LEAD_SELECT_WITH_SLA).eq("organization_id", organizationId).limit(20000),
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

  /**
   * O MESMO RODÍZIO DA v5, AQUI TAMBÉM.
   *
   * Este laço só roda em banco sem nenhuma das funções governadas. Ainda assim
   * ele precisa honrar a fila: um ambiente onde o degrau de emergência ignora o
   * elenco entregaria a lead a quem foi deixado de fora, e o gestor não teria
   * como saber que caiu no degrau de emergência.
   *
   * A regra é a mesma função pura que a tela e a cascata usam — não uma segunda
   * implementação do rodízio em JavaScript.
   */
  const rosterResult = await getSupabaseAdmin()
    .from("distribution_roster")
    .select("escopo,escopo_id,profile_id,ativo,posicao,created_at")
    .eq("organization_id", organizationId)
    .eq("ativo", true);
  const historyResult = await getSupabaseAdmin()
    .from("lead_distribution_history")
    .select("lead_id,assigned_user_id,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(2000);
  const leadById = new Map(leads.map((lead) => [text(lead.id), lead]));

  /**
   * As atribuições DESTE lote, que ainda não estão no histórico do banco.
   *
   * Sem isto, distribuir 10 leads do mesmo escopo de uma vez daria as 10 ao
   * mesmo corretor: o ponteiro leria o histórico gravado, que não muda no meio
   * do laço, e "a vez" continuaria sendo da mesma pessoa dez vezes seguidas. O
   * carimbo cresce a cada escolha para preservar a ordem dentro do lote.
   */
  const atribuidasNoLote = new Map<string, string>();
  let carimboDoLote = Date.now();

  /** A fila do escopo de UMA lead — campanha vence projeto, como na regra pura. */
  function filaDaLead(lead: (typeof leads)[number]) {
    const membros = rosterResult.error ? [] : (rosterResult.data ?? []);
    const daCampanha = text(lead.campaign_id)
      ? membros.filter((m) => m.escopo === "campanha" && String(m.escopo_id) === text(lead.campaign_id))
      : [];
    const doProjeto = text(lead.development_id)
      ? membros.filter((m) => m.escopo === "projeto" && String(m.escopo_id) === text(lead.development_id))
      : [];
    const doEscopo = daCampanha.length ? daCampanha : doProjeto;
    if (!doEscopo.length) return null;
    const escopo = daCampanha.length ? "campanha" : "projeto";
    const escopoId = daCampanha.length ? text(lead.campaign_id) : text(lead.development_id);
    const ultima = new Map<string, string>();
    for (const linha of historyResult.error ? [] : (historyResult.data ?? [])) {
      const corretor = String(linha.assigned_user_id || "");
      if (!corretor || ultima.has(corretor)) continue;
      const daHistoria = leadById.get(String(linha.lead_id));
      if (!daHistoria) continue;
      const chave = escopo === "campanha" ? text(daHistoria.campaign_id) : text(daHistoria.development_id);
      if (chave !== escopoId) continue;
      ultima.set(corretor, String(linha.created_at));
    }
    // O que este lote já entregou vence o que o banco guardou: é mais recente.
    for (const [corretor, carimbo] of atribuidasNoLote) {
      const chave = `${escopo}:${escopoId}`;
      if (carimbo.startsWith(chave)) ultima.set(corretor, carimbo.slice(chave.length + 1));
    }
    const disponiveis = new Set(eligible.filter((broker) => broker.load < broker.capacity).map((broker) => broker.id));
    return montarFila(
      doEscopo.map((m) => ({
        profileId: String(m.profile_id),
        ativo: true,
        posicao: m.posicao === null || m.posicao === undefined ? null : Number(m.posicao),
        entrouEm: m.created_at ? String(m.created_at) : null,
      })),
      doEscopo.map((m) => ({
        profileId: String(m.profile_id),
        ultimaLeadEm: ultima.get(String(m.profile_id)) ?? null,
        elegivelAgora: disponiveis.has(String(m.profile_id)),
        porQueNao: disponiveis.has(String(m.profile_id)) ? null : "indisponível ou na capacidade",
      })),
    );
  }

  // Greedy least-load assignment (fair): each lead goes to the least-loaded broker with capacity.
  const planByBroker = new Map<string, string[]>();
  for (const lead of queue) {
    let pick: (typeof eligible)[number] | null = null;
    const fila = filaDaLead(lead);
    if (fila) {
      // Com fila montada, a vez manda. Fila sem ninguém elegível NÃO cai para a
      // equipe toda: a lead fica onde está, para não ir justamente a quem foi
      // deixado de fora do escopo.
      pick = fila.proximoId ? eligible.find((broker) => broker.id === fila.proximoId) ?? null : null;
      if (!pick) continue;
      pick.load += 1;
      carimboDoLote += 1000;
      const escopoDaLead = text(lead.campaign_id) && (rosterResult.data ?? []).some((m) => m.escopo === "campanha" && String(m.escopo_id) === text(lead.campaign_id))
        ? `campanha:${text(lead.campaign_id)}`
        : `projeto:${text(lead.development_id)}`;
      atribuidasNoLote.set(pick.id, `${escopoDaLead}:${new Date(carimboDoLote).toISOString()}`);
      const planejadas = planByBroker.get(pick.id) ?? [];
      planejadas.push(text(lead.id));
      planByBroker.set(pick.id, planejadas);
      continue;
    }
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

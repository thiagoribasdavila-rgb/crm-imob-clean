import type { NextRequest } from "next/server";
import { MINIMUM_CAPACITY_ACTORS, MINIMUM_CAPACITY_SAMPLE, MINIMUM_CAPACITY_WEEKS, hasBasis, simulateCapacity, type CapacityContext } from "@/lib/ai/decision-simulator";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { mapLegacyLead, mapLegacyProject, type CompatRow } from "@/lib/compat/legacy-v2";
import { LIVE_PROFILE_SELECT, descendantsFromLiveProfiles, resolveLiveHierarchy } from "@/lib/compat/live-hierarchy";
import { logger } from "@/lib/observability/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro", "won", "lost", "closed"]);
const STAGE_PROBABILITY: Record<string, number> = { novo: 10, contato: 20, qualificacao: 35, visita: 55, proposta: 70, negociacao: 85, contrato: 95, ganho: 100, perdido: 0, comprou_outro: 0 };
const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const time = (value: unknown) => { const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; };
const text = (value: unknown) => typeof value === "string" ? value : "";
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Janela de observa\u00e7\u00e3o do throughput comercial. */
const CAPACITY_WINDOW_DAYS = 30;
const WEEK_MS = 7 * 86_400_000;

/**
 * Colunas realmente usadas por este painel. LIVE_LEAD_SELECT tem 37 colunas
 * (inclui notas e todo o bloco financeiro) e a leitura precisa ser exaustiva \u2014
 * medido contra a base viva, ler tudo custava 21 MB por carregamento contra
 * 4,7 MB com esta lista. Nome, telefone e e-mail ficam de fora tamb\u00e9m por
 * princ\u00edpio: painel executivo agrega, n\u00e3o l\u00ea PII.
 */
const DIRECTOR_LEAD_SELECT = "id,status,temperature,classificacao_ia,score_ia,budget_max,assigned_user_id,campaign_id,project_id,created_at,next_contact";

/**
 * Instant\u00e2neo de leads por organiza\u00e7\u00e3o, 60s (mesmo padr\u00e3o globalThis do
 * cache de sinais do briefing). A leitura exaustiva \u00e9 a opera\u00e7\u00e3o cara desta
 * rota e agora tem DOIS consumidores (Sala de Comando e Centro de Decis\u00e3o):
 * sem o instant\u00e2neo, abrir as duas telas em sequ\u00eancia pagava a conta duas
 * vezes. Sessenta segundos de defasagem n\u00e3o muda nenhuma decis\u00e3o de diretoria
 * \u2014 e a resposta declara `readAt` para o leitor saber de quando \u00e9 o n\u00famero.
 */
const LEAD_SNAPSHOT_TTL_MS = 60_000;
const MAX_CACHED_ORGANIZATIONS = 3;
type LeadSnapshot = { at: number; rows: CompatRow[]; truncated: boolean };
const snapshotGlobal = globalThis as typeof globalThis & { __atlasDirectorLeadSnapshot?: Map<string, LeadSnapshot> };
const leadSnapshotCache = snapshotGlobal.__atlasDirectorLeadSnapshot ?? new Map<string, LeadSnapshot>();
snapshotGlobal.__atlasDirectorLeadSnapshot = leadSnapshotCache;

async function readLeadSnapshot(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
): Promise<{ snapshot: LeadSnapshot | null; error: { code?: string; message?: string } | null }> {
  const now = Date.now();
  const cached = leadSnapshotCache.get(organizationId);
  if (cached && now - cached.at < LEAD_SNAPSHOT_TTL_MS) return { snapshot: cached, error: null };
  // Paginado porque `.limit(20000)` \u00e9 letra morta: o PostgREST corta em 1000
  // sem erro, e TODO este painel (pipeline, forecast, ranking, risco de
  // distribui\u00e7\u00e3o) afirma n\u00fameros sobre este array.
  const result = await fetchAllRows<CompatRow>((from, to) =>
    admin.from("leads").select(DIRECTOR_LEAD_SELECT).eq("organization_id", organizationId).order("id", { ascending: true }).range(from, to).returns<CompatRow[]>());
  if (result.error) return { snapshot: null, error: result.error };
  const snapshot: LeadSnapshot = { at: now, rows: result.rows, truncated: result.truncated };
  leadSnapshotCache.set(organizationId, snapshot);
  if (leadSnapshotCache.size > MAX_CACHED_ORGANIZATIONS) {
    for (const [key, entry] of leadSnapshotCache) {
      if (now - entry.at >= LEAD_SNAPSHOT_TTL_MS) leadSnapshotCache.delete(key);
    }
  }
  return { snapshot, error: null };
}

type HistoryRow = { lead_id: string | null; changed_by: string | null; old_status: string | null; new_status: string | null; created_at: string | null };

/**
 * O que `pipeline_history` N\u00c3O enxerga. Medido nesta base: das 430 linhas da
 * janela de 30 dias, 231 n\u00e3o t\u00eam autor \u2014 o banco tem gatilho que registra a
 * troca de `leads.status` sem saber quem a fez, ent\u00e3o movimenta\u00e7\u00e3o de ficha,
 * importa\u00e7\u00e3o e automa\u00e7\u00e3o entram an\u00f4nimas, e cada movimenta\u00e7\u00e3o de Kanban aparece
 * duas vezes (a linha da rota e a do gatilho). Por isso o throughput conta s\u00f3 a
 * linha com autor corretor, e por isso esta frase viaja at\u00e9 a tela.
 */
const CAPACITY_SOURCE_COVERAGE =
  "s\u00f3 movimenta\u00e7\u00f5es com autor corretor identificado em pipeline_history. Trocas de etapa feitas na ficha do Lead 360, por aprova\u00e7\u00e3o, importa\u00e7\u00e3o ou automa\u00e7\u00e3o chegam sem autor e ficam fora da conta \u2014 quem trabalha por esses caminhos aparece como quem n\u00e3o trabalhou.";

/** Etapas que encerram o lead: mover para elas \u00e9 encerramento, n\u00e3o trabalho de funil. */
const TERMINAL_STAGES = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);

/**
 * Observa a capacidade real a partir de `pipeline_history`. Tudo aqui \u00e9
 * contagem: nenhum n\u00famero sai daqui sem uma linha de banco por tr\u00e1s. Quando
 * n\u00e3o h\u00e1 o que contar, o campo sai `null` \u2014 e `null` \u00e9 lido como "n\u00e3o medido",
 * nunca como zero.
 *
 * `brokerIds` \u00e9 o que d\u00e1 sujeito ao n\u00famero: sem ele, a movimenta\u00e7\u00e3o em lote de
 * um gerente virava "leads por corretor por semana" e sustentava contrata\u00e7\u00e3o.
 */
function observeCapacity(
  rows: HistoryRow[],
  input: { openLeads: number; activeBrokers: number; brokerIds: Set<string> },
): CapacityContext {
  const leadsByBroker = new Map<string, Set<string>>();
  let attributed = 0;
  let attributedTerminal = 0;
  let advanced = 0;
  let comparable = 0;
  let wins = 0;
  let first: number | null = null;
  let last: number | null = null;

  for (const row of rows) {
    const at = time(row.created_at);
    if (at !== null) {
      first = first === null ? at : Math.min(first, at);
      last = last === null ? at : Math.max(last, at);
    }
    const actor = text(row.changed_by);
    const lead = text(row.lead_id);
    const fromBroker = Boolean(actor) && input.brokerIds.has(actor);
    if (fromBroker) {
      attributed += 1;
      if (TERMINAL_STAGES.has(normalize(row.new_status))) attributedTerminal += 1;
      if (lead) {
        const bucket = leadsByBroker.get(actor) ?? new Set<string>();
        bucket.add(lead);
        leadsByBroker.set(actor, bucket);
      }
    }
    const from = STAGE_PROBABILITY[normalize(row.old_status)];
    const to = STAGE_PROBABILITY[normalize(row.new_status)];
    if (Number.isFinite(from) && Number.isFinite(to)) {
      comparable += 1;
      if (to > from) advanced += 1;
    }
    if (normalize(row.new_status) === "ganho") wins += 1;
  }

  const actors = leadsByBroker.size;
  // Semanas REAIS, sem piso: a janela curta \u00e9 motivo para n\u00e3o projetar, e o
  // simulador tem porta pr\u00f3pria para isso. O piso entra s\u00f3 no divisor abaixo,
  // onde a \u00fanica coisa que ele pode fazer \u00e9 reduzir o throughput \u2014 nunca
  // credenciar amostra.
  const observedWeeks = first !== null && last !== null ? (last - first) / WEEK_MS : 0;
  const leadsTouched = [...leadsByBroker.values()].reduce((sum, set) => sum + set.size, 0);

  return {
    openLeads: input.openLeads,
    activeBrokers: input.activeBrokers,
    observedActors: actors,
    observedLeadsPerBrokerPerWeek: actors > 0 && observedWeeks > 0 ? leadsTouched / actors / Math.max(1, observedWeeks) : null,
    observedMoves: rows.length,
    observedAttributedMoves: attributed,
    observedWeeks,
    observedAdvanceRate: comparable > 0 ? advanced / comparable : null,
    observedWins: wins,
    observedTerminalShare: attributed > 0 ? attributedTerminal / attributed : null,
    sourceCoverage: CAPACITY_SOURCE_COVERAGE,
  };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 45, windowMs: 60_000, scope: "director.daily-dashboard" });
  if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request, { roles: ["admin", "director"] });
  if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) {
    return apiError("FORBIDDEN", "O painel executivo é exclusivo da diretoria.", identity.meta, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const capacitySince = new Date(Date.now() - CAPACITY_WINDOW_DAYS * 86_400_000).toISOString();
  const [profileResult, leadResult, campaignResult, projectResult, historyResult] = await Promise.all([
    admin.from("profiles").select(LIVE_PROFILE_SELECT).eq("organization_id", organizationId).eq("active", true).limit(2000),
    // O `{ count: "exact" }` saiu junto com o `.limit()`: com leitura exaustiva
    // o total É o tamanho lido, e o COUNT sobre 17 mil linhas a cada
    // carregamento era o jeito mais caro de descobrir o que a paginação já diz.
    readLeadSnapshot(admin, organizationId),
    // Paginado: .limit(1000) era corte silencioso do PostgREST. Com o
    // auto-registro da ingestão a tabela cresce sozinha (uma linha por campanha
    // Meta já vista) e a campanha cortada sumiria do ranking sem aviso.
    fetchAllRows<CompatRow>((from, to) => admin.from("marketing_campaigns").select("id,name,platform,status,created_at").eq("organization_id", organizationId).order("id", { ascending: true }).range(from, to)),
    admin.from("crm_projects").select("id,organization_id,name,developer_name,code,status,city,neighborhood,address,launch_date,delivery_date,created_at,updated_at").eq("organization_id", organizationId).limit(1000),
    // Paginado pelo mesmo motivo das campanhas: a projeção de capacidade sai de
    // uma contagem de movimentações, e contagem sobre página cortada mente.
    fetchAllRows<HistoryRow>((from, to) => admin.from("pipeline_history").select("lead_id,changed_by,old_status,new_status,created_at").eq("organization_id", organizationId).gte("created_at", capacitySince).order("created_at", { ascending: true }).range(from, to)),
  ]);
  if (profileResult.error || leadResult.error || campaignResult.error || projectResult.error) {
    return apiError("DIRECTOR_DASHBOARD_FAILED", "Não foi possível consolidar a operação executiva agora.", identity.meta, { status: 503 });
  }

  const profiles = resolveLiveHierarchy((profileResult.data ?? []) as unknown as CompatRow[]);
  const leadSnapshot = leadResult.snapshot;
  const leads = (leadSnapshot?.rows ?? []).map(mapLegacyLead);
  // Truncamento é o único caso em que a leitura de leads mente sem erro. Quando
  // acontece, NENHUM bloco desta rota pode afirmar total: a ressalva viaja no
  // payload inteiro, não só no bloco de capacidade.
  const leadSampleComplete = leadSnapshot !== null && !leadSnapshot.truncated;
  const leadSampleNote = leadSampleComplete
    ? null
    : `a leitura de leads atingiu o teto de páginas e voltou ${leads.length} linhas — todo número desta resposta derivado de leads é "ao menos", não total`;
  const projects = ((projectResult.data ?? []) as unknown as CompatRow[]).map(mapLegacyProject);
  const campaigns = campaignResult.rows as unknown as CompatRow[];
  const now = Date.now();
  const activeLeads = leads.filter((lead) => !TERMINAL.has(normalize(lead.status)));
  const wonLeads = leads.filter((lead) => normalize(lead.status) === "ganho");
  const firstContactOverdue = activeLeads.filter((lead) => normalize(lead.status) === "novo" && (time(lead.created_at) ?? now) < now - 15 * 60_000).length;
  const followUpOverdue = activeLeads.filter((lead) => (time(lead.next_action_at) ?? Number.MAX_SAFE_INTEGER) < now).length;
  const withoutNextAction = activeLeads.filter((lead) => !lead.next_action_at).length;
  // "Sem dono" contado sobre a base inteira devolvia ~17 mil (quase tudo é lead
  // arquivado de importação), e número que ninguém consegue agir vira ruído que
  // o diretor aprende a ignorar. Sobre os leads abertos vira tarefa de hoje.
  const unassignedActive = activeLeads.filter((lead) => !lead.assigned_to).length;
  const pipelineGross = activeLeads.reduce((sum, lead) => sum + money(lead.budget_max), 0);
  const forecastWeighted = activeLeads.reduce((sum, lead) => sum + money(lead.budget_max) * (STAGE_PROBABILITY[normalize(lead.status)] ?? 10) / 100, 0);
  const wonValue = wonLeads.reduce((sum, lead) => sum + money(lead.budget_max), 0);

  const campaignRanking = campaigns.map((campaign) => {
    const campaignLeads = leads.filter((lead) => text(lead.campaign_id) === text(campaign.id));
    const sales = campaignLeads.filter((lead) => normalize(lead.status) === "ganho").length;
    return { id: text(campaign.id), name: text(campaign.name) || "Campanha", channel: text(campaign.platform) || "Não informado", status: text(campaign.status) || "unknown", spend: 0, leads: campaignLeads.length, sales, revenue: 0, costPerLead: null, conversionRate: campaignLeads.length ? Math.round(sales / campaignLeads.length * 1000) / 10 : 0, sampleSufficient: campaignLeads.length >= 30 };
  }).sort((left, right) => Number(right.sampleSufficient) - Number(left.sampleSufficient) || right.sales - left.sales || right.leads - left.leads).slice(0, 8);

  const developerMap = new Map<string, { developerName: string; developments: number; leads: number; won: number }>();
  for (const project of projects) {
    const key = text(project.developer_name) || "Incorporadora não informada";
    const current = developerMap.get(key) || { developerName: key, developments: 0, leads: 0, won: 0 };
    const projectLeads = leads.filter((lead) => text(lead.development_id) === text(project.id));
    current.developments += 1;
    current.leads += projectLeads.length;
    current.won += projectLeads.filter((lead) => normalize(lead.status) === "ganho").length;
    developerMap.set(key, current);
  }
  const developers = [...developerMap.values()].sort((left, right) => right.won - left.won || right.leads - left.leads).slice(0, 8);

  const directSuperintendents = profiles.filter((profile) => profile.commercial_role === "superintendent" && text(profile.reports_to) === identity.access.profile.id);
  const executives = directSuperintendents.map((superintendent) => {
    const memberIds = descendantsFromLiveProfiles(profiles, text(superintendent.id));
    const managers = profiles.filter((profile) => profile.commercial_role === "manager" && memberIds.has(text(profile.id)));
    const brokers = profiles.filter((profile) => profile.commercial_role === "broker" && memberIds.has(text(profile.id)));
    const portfolio = leads.filter((lead) => memberIds.has(text(lead.assigned_to)));
    const won = portfolio.filter((lead) => normalize(lead.status) === "ganho").length;
    return { superintendentId: text(superintendent.id), superintendentName: text(superintendent.full_name) || "Superintendente", managers: managers.length, brokers: brokers.length, leads: portfolio.length, activeLeads: portfolio.filter((lead) => !TERMINAL.has(normalize(lead.status))).length, won, conversionRate: portfolio.length ? Math.round(won / portfolio.length * 1000) / 10 : 0, conversionSampleSufficient: portfolio.length >= 50 };
  }).sort((left, right) => right.won - left.won || right.activeLeads - left.activeLeads);
  const hierarchyGaps = profiles.filter((profile) => ["superintendent", "manager", "broker"].includes(text(profile.commercial_role)) && !profile.reports_to).length;

  // --- Capacidade comercial ------------------------------------------------
  // Somente-leitura e somente proposta: a rota já declara noAutomaticPeopleDecision
  // e nada aqui atribui, contrata ou remaneja ninguém.
  // O throughput promete "leads por CORRETOR" — então só perfil de corretor
  // pode entrar no numerador. Sem este conjunto, movimentação em lote de um
  // gerente virava ritmo de corretagem e justificava contratar.
  const brokerProfiles = profiles.filter((profile) => text(profile.commercial_role) === "broker");
  const activeBrokers = brokerProfiles.length;
  const brokerIds = new Set(brokerProfiles.map((profile) => text(profile.id)).filter(Boolean));
  if (historyResult.error) {
    logger.warn("analytics.director_daily.capacity_unavailable", { organizationId, code: historyResult.error.code, message: historyResult.error.message });
  }
  const capacityUnavailableReason = historyResult.error
    ? "histórico de pipeline não pôde ser lido agora"
    : historyResult.truncated
      ? "histórico de pipeline excedeu o teto de páginas e a contagem ficaria incompleta"
      : leadSampleNote
        ? `a contagem de leads abertos está incompleta: ${leadSampleNote}`
        : null;
  const capacityContext = observeCapacity(
    capacityUnavailableReason ? [] : historyResult.rows,
    { openLeads: activeLeads.length, activeBrokers, brokerIds },
  );
  const capacityScenarios = [1, 2].map((heads) => {
    const move = { kind: "contratar", target: "Equipe comercial", amount: heads };
    const projection = simulateCapacity(move, capacityContext);
    return {
      id: `contratar-${heads}`,
      label: `+${heads} ${heads === 1 ? "corretor" : "corretores"}`,
      move,
      projection,
      hasBasis: hasBasis(projection),
    };
  });

  const risks: Array<{ severity: "critical" | "attention"; area: string; reason: string; action: string }> = [];
  if (firstContactOverdue) risks.push({ severity: "critical", area: "Comercial", reason: `${firstContactOverdue} leads novas aguardam contato`, action: "Definir responsáveis e recuperar o SLA hoje" });
  // Sobre amostra cortada o número deixa de ser fato e vira piso: "ao menos N".
  // Nesse caso o risco também perde a severidade crítica — crítico é um veredito
  // sobre a operação, e ainda não sabemos o tamanho dela.
  if (unassignedActive) risks.push({ severity: unassignedActive >= 20 && leadSampleComplete ? "critical" : "attention", area: "Distribuição", reason: `${leadSampleComplete ? "" : "ao menos "}${unassignedActive} leads abertos sem responsável`, action: "Distribuir a fila hoje — lead sem dono não recebe ligação" });
  if (followUpOverdue >= 5) risks.push({ severity: "attention", area: "Execução", reason: `${followUpOverdue} follow-ups vencidos`, action: "Revisar a fila de próximas ações" });
  if (hierarchyGaps) risks.push({ severity: "attention", area: "Governança", reason: `${hierarchyGaps} perfis sem liderança resolvida`, action: "Confirmar a hierarquia oficial da equipe" });
  if (campaigns.length && !campaignRanking.some((item) => item.sampleSufficient)) risks.push({ severity: "attention", area: "Campanhas", reason: "Nenhuma campanha atingiu amostra mínima", action: "Não escalar verba sem resultados suficientes" });

  return apiSuccess({
    scope: { role: "director", organizationWide: true, directSuperintendentsOnly: true },
    // Uma leitura, uma declaração: todo bloco abaixo derivado de `leads` é
    // "ao menos" enquanto sampleComplete for falso.
    readCoverage: { leadsRead: leads.length, sampleComplete: leadSampleComplete, unavailableReason: leadSampleNote, source: "public.leads (paginado)", readAt: leadSnapshot ? new Date(leadSnapshot.at).toISOString() : null, cacheTtlSeconds: LEAD_SNAPSHOT_TTL_MS / 1000 },
    commercial: { leads: leads.length, sampleComplete: leadSampleComplete, activeLeads: activeLeads.length, hotLeads: activeLeads.filter((lead) => normalize(lead.temperature) === "quente" || money(lead.score) >= 70).length, unassigned: unassignedActive, unassignedScope: leadSampleComplete ? "leads_abertos" : "leads_abertos_amostra_incompleta", won: wonLeads.length, conversionRate: leads.length ? Math.round(wonLeads.length / leads.length * 1000) / 10 : 0, firstContactOverdue, followUpOverdue, withoutNextAction },
    financial: { pipelineGross, forecastWeighted, forecastMethod: "lead_budget_by_canonical_stage", wonValue, commissionReceivable: 0, commissionOverdue: 0, sampleComplete: leadSampleComplete },
    marketing: { campaigns: campaigns.length, campaignsWithSample: campaignRanking.filter((item) => item.sampleSufficient).length, spend: 0, attributedRevenue: 0, roas: null, minimumLeadsForDecision: 30, ranking: campaignRanking, sampleComplete: leadSampleComplete },
    developers,
    hierarchy: { superintendents: executives, gaps: hierarchyGaps, comparisonMinimumLeads: 50 },
    capacity: {
      windowDays: CAPACITY_WINDOW_DAYS,
      openLeads: activeLeads.length,
      unassignedOpenLeads: unassignedActive,
      activeBrokers,
      minimumSample: MINIMUM_CAPACITY_SAMPLE,
      unavailableReason: capacityUnavailableReason,
      minimumActors: MINIMUM_CAPACITY_ACTORS,
      minimumWeeks: MINIMUM_CAPACITY_WEEKS,
      observed: {
        // `moves` é volume lido; `attributedMoves` é a amostra que sustenta a
        // conta. A diferença entre os dois é quanto do histórico não tem dono —
        // e a diretoria precisa ver essa diferença, não só o número maior.
        moves: capacityContext.observedMoves,
        attributedMoves: capacityContext.observedAttributedMoves,
        attributedSharePct: capacityContext.observedMoves > 0 ? Math.round((capacityContext.observedAttributedMoves / capacityContext.observedMoves) * 1000) / 10 : null,
        actors: capacityContext.observedActors,
        weeks: round2(capacityContext.observedWeeks),
        leadsPerBrokerPerWeek: capacityContext.observedLeadsPerBrokerPerWeek === null ? null : round2(capacityContext.observedLeadsPerBrokerPerWeek),
        advanceRatePct: capacityContext.observedAdvanceRate === null ? null : Math.round(capacityContext.observedAdvanceRate * 1000) / 10,
        terminalMoveSharePct: capacityContext.observedTerminalShare === null ? null : Math.round(capacityContext.observedTerminalShare * 1000) / 10,
        wins: capacityContext.observedWins,
        source: "public.pipeline_history",
        sourceCoverage: CAPACITY_SOURCE_COVERAGE,
      },
      scenarios: capacityScenarios,
      projects: "leads_trabalhados_por_semana",
      revenueProjected: false,
    },
    ai: { calls30d: 0, tokens30d: 0, estimatedCostUsd30d: 0, averageLatencyMs30d: 0, measured: false },
    risks: risks.slice(0, 8),
    governance: { readOnly: true, humanApprovalRequired: true, noAutomaticBudgetChange: true, noAutomaticPeopleDecision: true },
    generatedAt: new Date().toISOString(),
  }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}

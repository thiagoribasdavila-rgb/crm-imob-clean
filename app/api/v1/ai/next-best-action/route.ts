/**
 * GET /api/v1/ai/next-best-action — a PLAYLIST de próxima-melhor-ação do corretor.
 *
 * Junta a carteira do corretor (best-effort do banco), calcula a probabilidade
 * de conversão por lead (predictConversionDetailed) e devolve a lista priorizada
 * (nextBestActions) + um resumo de 1 linha (playlistSummary). O corretor vê a
 * própria carteira; a liderança (director/superintendent/manager) pode inspecionar
 * a de um corretor via ?brokerId=, ou pedir a fila dos leads abertos SEM dono
 * via ?scope=sem_dono.
 *
 * A fila SEM DONO não devolve nome: quem ainda não tem responsável aparece por
 * identificador e metadado, exatamente como na porta oficial de distribuição.
 *
 * Degrade honesto: sem a tabela de leads (schema drift), a rota responde 503 —
 * nunca inventa uma carteira. Nada aqui EXECUTA nada: é priorização sob
 * supervisão humana. SEM PII em log (nenhum dado de lead é registrado).
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhoneE164 } from "@/lib/atlas/data-contracts";
import {
  LIVE_LEAD_SELECT,
  compatibleLeadStatuses,
  mapLegacyLead,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import { predictConversionDetailed, type ConversionSignals } from "@/lib/ai/conversion-predictor";
import { nextBestActions, playlistSummary, type LeadSignal } from "@/lib/ai/next-best-action";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEADERSHIP = new Set(["director", "superintendent", "manager"]);
const DAY_MS = 86_400_000;

/**
 * Teto de leads lidos por chamada. A base viva é dominada por encerrados
 * (16.7k arquivados de 17.1k) — sem o corte de etapa terminal NO SERVIDOR
 * (abaixo), qualquer limite devolveria amostra quase toda de arquivado. Quando
 * o teto é atingido a resposta DECLARA o truncamento em vez de fingir carteira
 * completa.
 */
const MAX_PORTFOLIO = 500;

/**
 * Teto da fila SEM DONO, espelhando `maximumVisible: 100` da porta oficial
 * (app/api/v1/crm/distribution). Duas portas para o mesmo dado não podem ter
 * contratos diferentes — a mais aberta viraria a de fato.
 */
const MAX_UNASSIGNED = 100;

/** Etapas encerradas: não entram na playlist (não há próxima ação a tomar). */
const CLOSED_STAGES = ["ganho", "perdido", "arquivado", "comprou_outro"];
/**
 * A coluna `status` viva mistura grafias ("CONTATO", "contato", "PERDIDO"), então
 * o filtro do servidor precisa listar TODOS os apelidos de armazenamento de cada
 * etapa encerrada — canonizar só no cliente deixaria os 16.7k arquivados
 * consumirem o limite antes de qualquer lead trabalhável.
 */
const CLOSED_STATUS_VALUES = [...new Set(CLOSED_STAGES.flatMap((stage) => compatibleLeadStatuses(stage)))];

const asString = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function readMetadata(row: CompatRow): Record<string, unknown> {
  const m = row.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

/** Dias (arredondados p/ baixo) desde uma data ISO até agora; undefined se inválida. */
function daysSince(iso: unknown, now: number): number | undefined {
  const s = asString(iso);
  if (!s) return undefined;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** O que `lead_events` sabe dizer sobre um lead (contagem e recência reais). */
type InteractionStats = { interactions: number; lastEventAt: string | null };

/**
 * Telefone: `true` = existe telefone gravado e ele NÃO tem forma discável;
 * `false` = discável; `null` = não há telefone registrado.
 *
 * Ausência não vira "inválido" de propósito: lead que chegou por canal sem
 * telefone não é cadastro errado, e marcar risco em cima de dado que nunca
 * existiu mandaria o corretor "corrigir" um registro que está correto.
 */
function readPhoneInvalid(row: CompatRow): boolean | null {
  const raw = asString(row.phone);
  if (!raw) return null;
  return normalizePhoneE164(raw) === null;
}

/** Constrói os sinais do preditor a partir de uma linha de lead (defensivo). */
function toConversionSignals(row: CompatRow, now: number, stats: InteractionStats | null): ConversionSignals {
  const nextActionAt = asString(row.next_action_at);
  const nextActionOverdue = nextActionAt ? Date.parse(nextActionAt) < now : null;
  return {
    status: asString(row.status) ?? null,
    stage: asString(readMetadata(row).stage) ?? asString(row.status) ?? null,
    // score_ia é a coluna canônica do scorer de IA. Lido da linha CRUA e não do
    // `score` do mapeador legado: aquele resolve ausência para 0, e 0 no
    // preditor é "score péssimo" (sinal forte), não "score desconhecido".
    score: asNumber(row.score_ia) ?? null,
    // Recência e volume vêm de lead_events — a única fonte viva de interação.
    // `created_at` NÃO serve de substituto: idade do cadastro não é contato.
    interactions: stats ? stats.interactions : null,
    daysSinceLastInteraction: stats ? daysSince(stats.lastEventAt, now) ?? null : null,
    nextActionOverdue,
    invalidPhone: readPhoneInvalid(row),
    // budgetFit e essentialAnswers seguem ausentes por decisão: as colunas
    // financeiras da base viva estão praticamente vazias (9 de 216 leads
    // abertos têm budget_max). O preditor os devolve em missingSignals e a tela
    // mostra a lacuna — preencher com média seria inventar aderência financeira.
  };
}

/**
 * Extrai o valor do imóvel dos campos best-effort (nunca inventa).
 * budget_max NÃO entra aqui de propósito: é teto declarado pelo cliente, não
 * preço de imóvel. Ele viaja em declaredBudget, fora do score e do potencial.
 */
function readPropertyValue(row: CompatRow): number | undefined {
  const meta = readMetadata(row);
  return (
    asNumber(meta.property_value) ??
    asNumber(meta.valor_imovel) ??
    asNumber(meta.ticket) ??
    undefined
  );
}

/** Teto de orçamento declarado pelo cliente (coluna do CRM), quando houver. */
function readDeclaredBudget(row: CompatRow): number | undefined {
  const value = asNumber(row.budget_max) ?? Number(row.budget_max);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Contagem e recência de interação por lead, a partir de `lead_events`.
 * Devolve null quando a leitura falha — assim o preditor recebe "não sei" em vez
 * de zero interações, que é uma afirmação diferente (e mais pessimista).
 */
async function loadInteractionStats(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  leadIds: string[],
): Promise<Map<string, InteractionStats> | null> {
  const stats = new Map<string, InteractionStats>();
  if (leadIds.length === 0) return stats;
  // Paginado, não `.limit(5000)`: o teto do PostgREST é 1000 e o corte é
  // silencioso (lib/supabase/fetch-all-rows). Um lote de 100 leads passa de mil
  // eventos rápido, e evento subcontado devolve lead mais frio do que é — o
  // preditor é quem ordena o dia do corretor.
  const batches = await Promise.all(
    chunk(leadIds, 100).map((ids) =>
      fetchAllRows<CompatRow>((from, to) =>
        admin
          .from("lead_events")
          .select("lead_id,created_at")
          .eq("organization_id", organizationId)
          .in("lead_id", ids)
          .order("id", { ascending: true })
          .range(from, to)
          .returns<CompatRow[]>()),
    ),
  );
  for (const batch of batches) {
    // Erro e truncamento recebem o mesmo tratamento: null é "não consegui ler",
    // e é melhor do que devolver contagem parcial com cara de completa.
    if (batch.error || batch.truncated) return null;
    for (const row of batch.rows) {
      const leadId = asString(row.lead_id);
      if (!leadId) continue;
      const current = stats.get(leadId) ?? { interactions: 0, lastEventAt: null };
      current.interactions += 1;
      const at = asString(row.created_at);
      if (at && (current.lastEventAt === null || at > current.lastEventAt)) current.lastEventAt = at;
      stats.set(leadId, current);
    }
  }
  // Lead sem nenhuma linha é 0 interações de FATO (a tabela foi lida com
  // sucesso), diferente do null acima que significa "não consegui ler".
  for (const id of leadIds) if (!stats.has(id)) stats.set(id, { interactions: 0, lastEventAt: null });
  return stats;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 40, scope: "ai-next-best-action" });
  if (!limited.ok) return limited.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const { access, meta } = identity;
  const commercialRole = access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
  const isLeadership = LEADERSHIP.has(commercialRole);

  const params = new URL(request.url).searchParams;
  const askedScope = params.get("scope");
  if (askedScope !== null && askedScope !== "sem_dono") {
    return apiError("INVALID_SCOPE", "O parâmetro scope aceita apenas o valor sem_dono.", meta, {
      status: 400,
      headers: limited.headers,
    });
  }
  const unassignedQueue = askedScope === "sem_dono";
  if (unassignedQueue && !isLeadership) {
    return apiError("SCOPE_FORBIDDEN", "A fila de leads sem responsável é visível apenas à liderança.", meta, {
      status: 403,
      headers: limited.headers,
    });
  }

  // Alvo: a liderança pode pedir ?brokerId=; o corretor vê só a própria carteira.
  const askedBroker = params.get("brokerId");
  let targetBrokerId = access.profile.id;
  if (isLeadership && askedBroker) {
    if (!UUID_RE.test(askedBroker)) {
      return apiError("INVALID_BROKER_ID", "O parâmetro brokerId precisa ser um UUID válido.", meta, {
        status: 400,
        headers: limited.headers,
      });
    }
    targetBrokerId = askedBroker;
  }

  const org = access.organization.id;
  const admin = getSupabaseAdmin();

  // Carteira — best-effort. Sem a tabela/colunas (schema drift) → 503 honesto.
  const base = admin
    .from("leads")
    .select(LIVE_LEAD_SELECT)
    .eq("organization_id", org)
    .not("status", "in", `(${CLOSED_STATUS_VALUES.join(",")})`);
  const scoped = unassignedQueue
    ? base.is("assigned_user_id", null)
    : base.eq("assigned_user_id", targetBrokerId);
  const readLimit = unassignedQueue ? MAX_UNASSIGNED : MAX_PORTFOLIO;
  const { data, error } = await scoped
    // Ordem estável antes do corte: se o teto truncar, o que sobra é a ponta de
    // maior score, não uma fatia arbitrária do banco.
    .order("score_ia", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(readLimit);

  if (error) {
    return apiError(
      "PORTFOLIO_UNAVAILABLE",
      "Carteira de leads indisponível no momento — não foi possível montar a playlist.",
      meta,
      { status: 503, headers: limited.headers },
    );
  }

  const now = Date.now();
  const rawRows = Array.isArray(data) ? (data as unknown as CompatRow[]) : [];
  // O filtro de etapa encerrada roda de novo aqui, já canonizado: o corte do
  // servidor é economia de volume, este é o que garante a regra (uma grafia
  // nova de "perdido" no banco passaria pelo primeiro, nunca por este).
  const rows = rawRows.map(mapLegacyLead).filter((row) => !CLOSED_STAGES.includes(String(row.status)));
  const leadIds = rows.map((row) => String(row.id)).filter(Boolean);
  const interactionStats = await loadInteractionStats(admin, org, leadIds);

  // Fator de risco DOMINANTE por lead: a playlist já ordena risco antes de
  // positivo, mas o núcleo publica só a frase pronta. A tela precisa saber que
  // o motivo do topo é risco para destacá-lo — sem isso "telefone inválido"
  // chega com o mesmo peso visual de "interação recente".
  const riskByLead = new Map<string, string>();

  const signals: LeadSignal[] = rows.map((row) => {
    const leadId = String(row.id);
    const stats = interactionStats?.get(leadId) ?? null;
    const prediction = predictConversionDetailed(toConversionSignals(row, now, stats));
    const dominantRisk = (prediction.riskFactors[0] ?? "").trim();
    if (dominantRisk) riskByLead.set(leadId, dominantRisk);
    const stage = asString(readMetadata(row).stage) ?? asString(row.status);
    const nextActionAt = asString(row.next_action_at);
    const lastContactDays = stats ? daysSince(stats.lastEventAt, now) : undefined;
    const signal: LeadSignal = {
      leadId,
      probability: prediction.probability,
      // Risco primeiro: o núcleo usa só o PRIMEIRO fator como "dominante", e
      // com positivos na frente um risco real (telefone inválido, sete dias
      // sem contato) nunca chegava ao corretor.
      factors: [...prediction.riskFactors, ...prediction.positiveFactors],
      band: prediction.band,
      missingSignals: prediction.missingSignals,
      signalCoverage: prediction.signalCoverage,
    };
    // Só afirmamos "tarefa vencida" quando existe data de próxima ação: sem
    // ela, 0 seria a afirmação "não há nada vencido", que não foi apurada.
    if (nextActionAt) signal.overdueTaskCount = Date.parse(nextActionAt) < now ? 1 : 0;
    // Nome só na carteira. A fila SEM DONO segue a política já vigente da porta
    // oficial de distribuição (`unassignedPolicy: { metadataOnly: true,
    // piiExposed: false }`): sem o nome, o núcleo rotula "Lead <8 primeiros do
    // id>" e nem a lista nem o resumo expõem quem é a pessoa. Escolher o dono
    // não exige saber o nome de quem ainda não é atendido.
    const name = unassignedQueue ? undefined : asString(row.name);
    if (name) signal.name = name;
    if (stage) signal.stage = stage;
    const value = readPropertyValue(row);
    if (value !== undefined) signal.propertyValue = value;
    const declaredBudget = readDeclaredBudget(row);
    if (declaredBudget !== undefined) signal.declaredBudget = declaredBudget;
    if (lastContactDays !== undefined) signal.lastContactDays = lastContactDays;
    return signal;
  });

  const actions = nextBestActions(signals, { max: 20 }).map((action) => ({
    ...action,
    riskFactor: riskByLead.get(action.leadId) ?? null,
  }));

  // Lacuna MEDIDA, não afirmada por literal: no dia em que a base for
  // preenchida a frase muda sozinha, em vez de a rota seguir mentindo com
  // segurança sobre uma medição congelada em texto.
  const withBudget = rows.filter((row) => Number(row.budget_max) > 0).length;
  const budgetGap = rows.length > 0 && withBudget < rows.length
    ? `aderência financeira (orçamento preenchido em ${withBudget} de ${rows.length} leads desta leitura)`
    : null;

  return apiSuccess(
    {
      scope: unassignedQueue ? "sem_dono" : "carteira",
      brokerId: unassignedQueue ? null : targetBrokerId,
      count: actions.length,
      portfolioSize: rows.length,
      // Truncamento declarado: melhor dizer "li 500 de uma carteira maior" do
      // que apresentar a fila como se fosse a carteira inteira.
      truncated: rawRows.length >= readLimit,
      actions,
      summary: playlistSummary(actions),
      // Mesmo contrato da porta oficial (/api/v1/crm/distribution). Escopo
      // hierárquico é declarado FALSO por fato: lead sem responsável não tem
      // hierarquia a que pertencer, e a fila da distribuição também é da
      // organização inteira — declarar `true` aqui seria inventar um limite.
      unassignedPolicy: unassignedQueue
        ? { metadataOnly: true, piiExposed: false, automaticAssignment: false, explicitLeadershipAction: true, maximumVisible: MAX_UNASSIGNED, hierarchicalScope: false, hierarchyNote: "lead sem responsável não pertence a nenhuma equipe; a fila é organizacional, igual à de /api/v1/crm/distribution" }
        : null,
      coverage: {
        // Quais entradas do preditor esta base realmente alimenta hoje.
        interactions: interactionStats ? "lead_events" : null,
        unavailable: [
          ...(interactionStats ? [] : ["histórico de interações (lead_events indisponível ou truncado nesta leitura)"]),
          ...(budgetGap ? [budgetGap] : []),
          "respostas essenciais (não há registro estruturado de qualificação)",
          // A lacuna que a tela mais promete: sem coluna de metadados em leads,
          // não existe valor de imóvel, e a ordenação é só por probabilidade.
          "valor do imóvel (não há coluna de metadados em leads nesta base — a fila é ordenada só por probabilidade de conversão)",
        ],
      },
      caveat: "Priorização explicável sob supervisão humana; nada executa sem sua ação.",
    },
    meta,
    { headers: limited.headers },
  );
}

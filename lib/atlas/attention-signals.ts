import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/atlas/pipeline-stages";
import { avaliarNuncaContatado, NEVER_CONTACTED_CRITICAL_HOURS } from "@/lib/atlas/regra-nunca-contatado";
import { HOT_SCORE_THRESHOLD } from "@/lib/atlas/temperatura-do-lead";
import { tarefaVencida } from "@/lib/atlas/tarefa-em-aberto";

/**
 * Fase 100 · Sinais de atenção proativos
 *
 * Calcula, para um conjunto de leads de uma organização, quais precisam de
 * atenção AGORA para não perder a chance de conversão — sem o corretor
 * precisar pedir. Cada sinal é determinístico e explicável: o corretor
 * sempre consegue ver a regra exata (tabela, coluna, limiar) que disparou o
 * alerta em `detail`.
 *
 * Usa apenas tabelas já vivas no banco: `leads` (dados já carregados pelo
 * chamador — nenhuma leitura própria aqui), `pipeline_stage_moves`, `tasks`,
 * `lead_events` e `lead_objections`. Nenhuma tabela nova, nenhuma migration.
 *
 * Cinco sinais, cada um com sua própria regra:
 *  1. stale_stage            — lead parado além do tempo tolerado na etapa atual.
 *  2. follow_up_overdue      — tasks.due_date no passado com status ainda em aberto.
 *  3. high_score_no_contact  — score_ia alto (ou temperatura "quente") sem
 *                              nenhuma linha em lead_events nos últimos N dias úteis.
 *  4. objection_open         — objeção registrada (lead_objections.status="OPEN")
 *                              sem resposta há mais tempo do que o tolerável.
 *  5. never_contacted        — leads.first_contacted_at nulo com o prazo de SLA
 *                              (first_contact_due_at) já vencido.
 *
 * ── DUAS FONTES ESTAVAM MORTAS, E O ALERTA LIA AS MORTAS ─────────────────────
 *
 * Medido em produção (490 leads, org 7c8c71c1): `pipeline_history` 0 linhas,
 * `followups` 0 linhas, `lead_objections` 0 linhas. Um alerta que lê tabela
 * vazia nunca acende — e sinal que nunca acende é INDISTINGUÍVEL de operação
 * saudável. Essa é a mentira: a tela dizia "nada a fazer" porque não tinha onde
 * olhar, não porque não havia o que fazer.
 *
 * As três estavam vazias por três motivos DIFERENTES, e por isso levaram três
 * tratamentos diferentes:
 *
 *  · `pipeline_history` é espelho MORTO de um fato vivo. Quem grava movimentação
 *    é a RPC `move_pipeline_lead`, em `pipeline_stage_moves` (478 linhas, 444
 *    leads). A escrita em `pipeline_history` só acontece no caminho
 *    compensatório, que não roda. O sinal 1 foi REAPONTADO para a canônica.
 *    Antes do reaponte os 66 leads vivos recebiam `stale_stage` contado desde
 *    `created_at`, e todos os 66 afirmavam "Nenhuma movimentação registrada
 *    desde a criação do lead" — afirmação FALSA para 29 deles, que tinham
 *    movimentação gravada. O sinal não estava só mudo: estava mentindo.
 *
 *  · `followups` nunca teve caminho de INSERT em lugar nenhum do repositório.
 *    O fato equivalente vivo é `tasks` (13 linhas), que a própria broker-daily
 *    já lia para `overdueByLead`. O sinal 2 foi REAPONTADO para `tasks`, com o
 *    predicado compartilhado em `tarefa-em-aberto.ts` para as duas leituras não
 *    divergirem.
 *
 *  · `lead_objections` está vazia mas NÃO está morta: a rota
 *    `app/api/v1/leads/[id]/objections/route.ts` insere e atualiza normalmente.
 *    Está vazia porque ninguém registrou objeção ainda. Não há para onde
 *    reapontar — e o candidato óbvio foi REFUTADO com medição, ver
 *    `medirFontesDosSinais` abaixo. Como não dá para reapontar, o sinal 4
 *    passou a DECLARAR que não pode ser medido, em vez de calar.
 *
 * ── POR QUE O SINAL 5 EXISTE ─────────────────────────────────────────────────
 *
 * Nenhum dos quatro primeiros lê primeiro contato. Medido em 2026-07-28: dos
 * 448 leads vivos da base, 443 NUNCA foram contatados — e mesmo assim a
 * carteira do corretor renderizava o estado vazio "Operação em dia", em verde,
 * porque `stale_stage` só dispara depois de 1 dia em "novo" e a importação era
 * do mesmo dia. A tela dizia "nada a fazer" para uma carteira 99% intocada.
 *
 * O predicado é por COLUNA (first_contacted_at nulo), não por etapa. A
 * alternativa que já existia em director-daily — status "novo" há mais de 15
 * min — erra dos dois lados: perde os 19 leads que avançaram para "contato" e
 * "qualificação" sem ninguém ter registrado uma ligação, e conta 5 que já
 * foram contatados e continuam em "novo". Um predicado só, para o texto e para
 * o filtro do clique: se divergirem, o primeiro clique desmente a tela.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Horários exibidos em detail e fronteiras de dia útil sempre em horário de
// Brasília — o servidor roda em UTC e sem isso o corretor veria +3h e um
// contato às 22h BRT contaria como "dia seguinte". Quando houver timezone
// por organização, este é o único ponto a parametrizar.
const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

export type AttentionSeverity = "critical" | "warning" | "info";
export type AttentionSignalKind = "stale_stage" | "follow_up_overdue" | "high_score_no_contact" | "objection_open" | "never_contacted";

export type AttentionSignal = {
  leadId: string;
  kind: AttentionSignalKind;
  severity: AttentionSeverity;
  /** Frase curta, pronta para badge/headline. */
  reason: string;
  /** Explicação completa (regra + números) para tooltip/corpo de card. */
  detail: string;
  /** Timestamp ISO desde quando a condição está ativa (nunca é o "agora"). */
  since: string | null;
  /** Métrica bruta (dias ou minutos, conforme o sinal) — útil para ordenar/exibir. */
  metric: number;
};

export type AttentionSignalLeadInput = {
  id: string;
  /** Etapa já canônica (ex.: via canonicalLeadStatus/mapLegacyLead — "novo", "contato", ...). */
  status: string;
  /** leads.score_ia já coagido para número. */
  score: number;
  temperature: string | null;
  /** leads.created_at em ISO. */
  createdAt: string | null;
  /**
   * leads.first_contacted_at e leads.first_contact_due_at em ISO.
   *
   * Opcionais porque vêm de FIRST_CONTACT_SLA_COLUMNS, que não está no select
   * base: quem não pede as colunas não tem como saber se o lead foi contatado.
   * Por isso o sinal 5 só é avaliado quando o chamador declara
   * `primeiroContatoMensuravel: true` — ver a nota em computeAttentionSignals.
   */
  firstContactedAt?: string | null;
  firstContactDueAt?: string | null;
};

export type AttentionSignalSummary = {
  leadId: string;
  signals: AttentionSignal[];
  topSeverity: AttentionSeverity;
  topReason: string;
};

// Etapas terminais nunca recebem sinal: o lead já saiu do funil ativo.
const TERMINAL_STAGES = new Set(["ganho", "perdido", "comprou_outro", "arquivado"]);

// Quanto tempo é tolerável parado em cada etapa antes de virar sinal de
// atenção. Etapas iniciais toleram menos (o lead esfria rápido); etapas
// finais toleram mais porque dependem de decisão do cliente, financiamento
// ou jurídico — processos que legitimamente demoram mais que uma qualificação.
export const STAGE_STALE_THRESHOLD_DAYS: Record<string, number> = {
  novo: 1,
  contato: 3,
  qualificacao: 4,
  visita: 5,
  proposta: 7,
  contrato: 10,
};

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  DEFAULT_PIPELINE_STAGES.map((stage) => [stage.key, stage.label]),
);

// Mesmo corte de "lead quente" já usado em broker-daily, team-sla,
// manager-daily e director-daily — não inventamos um novo critério de score.
//
// Era `= 70` aqui, um literal próprio. O problema não é o valor: é ele ser
// ESCOLHIDO aqui. 70 é a fronteira em que `calculateLeadScore` grava
// temperature "quente"; se este arquivo a movesse sozinho, "quente por score"
// e "quente na coluna" passariam a ser fatos diferentes com o mesmo nome.
// A fronteira mora em `temperatura-do-lead.ts`; aqui só é reexportada, porque
// as rotas já importam os limiares deste módulo.
export { HOT_SCORE_THRESHOLD };

// Dias úteis sem nenhum lead_event antes de um lead quente virar sinal.
export const HIGH_SCORE_NO_CONTACT_BUSINESS_DAYS = 3;

// A regra em si mora em regra-nunca-contatado.ts, sem `server-only`, para
// poder ser exercitada por teste sem subir o Next. Reexportada aqui porque as
// rotas já importam os limiares deste módulo.
export { NEVER_CONTACTED_CRITICAL_HOURS };

// Horas sem resposta antes de uma objeção em aberto virar sinal de atenção
// (warning) ou crítico. Objeção é urgente por natureza — cliente disse algo
// que pode travar a venda — por isso o limite é em horas, não dias.
export const OBJECTION_OPEN_WARNING_HOURS = 4;
export const OBJECTION_OPEN_CRITICAL_HOURS = 24;

const OBJECTION_TYPE_LABEL: Record<string, string> = {
  PRICE: "preço",
  FINANCING: "financiamento",
  LOCATION: "localização",
  SIZE: "tamanho/metragem",
  TIMING: "momento/prazo",
  TRUST: "confiança",
  PRODUCT: "produto",
  COMPETITOR: "concorrente",
  OTHER: "outra",
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 3, warning: 2, info: 1 };

export function severityRank(severity: AttentionSeverity): number {
  return SEVERITY_RANK[severity];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

// O PostgREST corta silenciosamente qualquer resposta no max-rows do servidor
// (1000 por padrão no Supabase) — sem .range() explícito, um chunk de 200
// leads com histórico volumoso perderia linhas sem nenhum erro, gerando
// falso positivo ("parado desde a criação") ou falso negativo (follow-up
// vencido invisível). Paginamos até esgotar, com teto de segurança.
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_CHUNK = 20;

type QueryPage<T> = PromiseLike<{ data: T[] | null; error: { message?: string } | null }>;

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => QueryPage<T>,
  context: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES_PER_CHUNK; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) {
      // Falha de query nunca deve ser indistinguível de "nenhum sinal".
      console.warn(JSON.stringify({ level: "warn", event: "attention_signals.query_failed", context, error: error.message || "unknown" }));
      break;
    }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function toMs(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Conta dias úteis (seg–sex) inteiros decorridos entre duas datas, ignorando
 * sábado e domingo. Usa os limites de calendário (00:00) das duas datas para
 * não depender do horário exato do evento. Fórmula fechada (sem loop dia a
 * dia) para permanecer O(1) mesmo quando o intervalo é de anos.
 */
// Fronteira de dia no fuso do corretor (BRT), não do servidor (UTC em
// produção): contato às 22h de Brasília pertence àquele dia, não ao
// seguinte. "en-CA" garante o formato YYYY-MM-DD do formatToParts.
const calendarDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function calendarDayUtc(ms: number): number {
  const [year, month, day] = calendarDayFormatter.format(ms).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function businessDaysElapsed(fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0;
  const start = calendarDayUtc(fromMs);
  const end = calendarDayUtc(toMs);
  const totalDays = Math.round((end - start) / DAY_MS);
  if (totalDays <= 0) return 0;
  const fullWeeks = Math.floor(totalDays / 7);
  let businessDays = fullWeeks * 5;
  const remainder = totalDays % 7;
  const startDow = new Date(start).getUTCDay();
  for (let offset = 1; offset <= remainder; offset += 1) {
    const dow = (startDow + offset) % 7;
    if (dow !== 0 && dow !== 6) businessDays += 1;
  }
  return businessDays;
}

function plural(count: number, singular: string, pluralForm: string) {
  return count === 1 ? singular : pluralForm;
}

/**
 * Última movimentação de etapa por lead, lida da tabela CANÔNICA.
 *
 * Era `pipeline_history` — 0 linhas em produção. A movimentação real é gravada
 * pela RPC `move_pipeline_lead` em `pipeline_stage_moves`, cuja coluna de tempo
 * é `occurred_at` (não `created_at`) e cujas colunas de etapa são
 * `from_stage`/`to_stage` (não `old_status`/`new_status`).
 */
async function latestPipelineStageEnteredAt(
  supabase: SupabaseClient,
  organizationId: string,
  leadIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const batches = await Promise.all(
    chunk(leadIds, 200).map((ids) =>
      fetchAllRows<{ lead_id: string; occurred_at: string }>(
        (from, to) =>
          supabase
            .from("pipeline_stage_moves")
            .select("lead_id,occurred_at")
            .eq("organization_id", organizationId)
            .in("lead_id", ids)
            .order("occurred_at", { ascending: false })
            .range(from, to),
        "pipeline_stage_moves",
      ),
    ),
  );
  for (const data of batches) {
    for (const row of data) {
      if (map.has(row.lead_id)) continue;
      const parsed = toMs(row.occurred_at);
      if (parsed !== null) map.set(row.lead_id, parsed);
    }
  }
  return map;
}

type OverdueFollowUp = { scheduledAt: number; action: string | null; extraCount: number };

/**
 * Tarefa vencida mais antiga por lead, lida da tabela VIVA.
 *
 * Era `followups` — 0 linhas, e sem caminho de INSERT em lugar nenhum. O fato
 * equivalente vivo é `tasks.due_date` com status ainda em aberto.
 *
 * O filtro de "em aberto" NÃO vai no SQL: os status vivos em produção são
 * `pendente` e `OPEN`, e a comparação canônica é sobre o texto normalizado
 * (sem acento, minúsculo), o que o PostgREST não faz. Filtrar aqui, com o mesmo
 * predicado que a broker-daily usa, é o que impede as duas leituras de
 * divergirem — ver `tarefa-em-aberto.ts`.
 */
async function earliestOverdueFollowUp(
  supabase: SupabaseClient,
  organizationId: string,
  leadIds: string[],
  now: number,
): Promise<Map<string, OverdueFollowUp>> {
  const map = new Map<string, OverdueFollowUp>();
  const nowIso = new Date(now).toISOString();
  const batches = await Promise.all(
    chunk(leadIds, 200).map((ids) =>
      fetchAllRows<{ lead_id: string; due_date: string; status: string | null; title: string | null; description: string | null }>(
        (from, to) =>
          supabase
            .from("tasks")
            .select("lead_id,due_date,status,title,description")
            .eq("organization_id", organizationId)
            .in("lead_id", ids)
            .lt("due_date", nowIso)
            .order("due_date", { ascending: true })
            .range(from, to),
        "tasks",
      ),
    ),
  );
  for (const data of batches) {
    for (const row of data) {
      const scheduledAt = toMs(row.due_date);
      if (scheduledAt === null) continue;
      if (!tarefaVencida(row.status, scheduledAt, now)) continue;
      const existing = map.get(row.lead_id);
      if (!existing) {
        map.set(row.lead_id, { scheduledAt, action: row.title || row.description || null, extraCount: 0 });
      } else {
        existing.extraCount += 1;
      }
    }
  }
  return map;
}

async function lastLeadEventAt(
  supabase: SupabaseClient,
  organizationId: string,
  leadIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!leadIds.length) return map;
  const batches = await Promise.all(
    chunk(leadIds, 200).map((ids) =>
      fetchAllRows<{ lead_id: string; created_at: string }>(
        (from, to) =>
          supabase
            .from("lead_events")
            .select("lead_id,created_at")
            .eq("organization_id", organizationId)
            .in("lead_id", ids)
            .order("created_at", { ascending: false })
            .range(from, to),
        "lead_events",
      ),
    ),
  );
  for (const data of batches) {
    for (const row of data) {
      if (map.has(row.lead_id)) continue;
      const parsed = toMs(row.created_at);
      if (parsed !== null) map.set(row.lead_id, parsed);
    }
  }
  return map;
}

type OpenObjection = { createdAt: number; objectionType: string; extraCount: number };

async function earliestOpenObjection(
  supabase: SupabaseClient,
  organizationId: string,
  leadIds: string[],
): Promise<Map<string, OpenObjection>> {
  const map = new Map<string, OpenObjection>();
  const batches = await Promise.all(
    chunk(leadIds, 200).map((ids) =>
      fetchAllRows<{ lead_id: string; objection_type: string; created_at: string }>(
        (from, to) =>
          supabase
            .from("lead_objections")
            .select("lead_id,objection_type,created_at")
            .eq("organization_id", organizationId)
            .eq("status", "OPEN")
            .in("lead_id", ids)
            .order("created_at", { ascending: true })
            .range(from, to),
        "lead_objections",
      ),
    ),
  );
  for (const data of batches) {
    for (const row of data) {
      const createdAt = toMs(row.created_at);
      if (createdAt === null) continue;
      const existing = map.get(row.lead_id);
      if (!existing) {
        map.set(row.lead_id, { createdAt, objectionType: row.objection_type, extraCount: 0 });
      } else {
        existing.extraCount += 1;
      }
    }
  }
  return map;
}

function isHot(lead: AttentionSignalLeadInput) {
  return lead.score >= HOT_SCORE_THRESHOLD || String(lead.temperature || "").trim().toLowerCase() === "quente";
}

/**
 * Estado da FONTE de um sinal — não do sinal.
 *
 * `mensuravel: false` quer dizer "a tabela que este alerta lê não tem nenhuma
 * linha nesta organização", ou seja: zero sinais aqui não é notícia boa, é
 * ausência de notícia. Sem isso, o zero de uma fonte vazia é byte a byte igual
 * ao zero de uma operação impecável.
 */
export type AttentionSourceHealth = {
  kind: AttentionSignalKind;
  /** Tabela realmente consultada por este sinal. */
  fonte: string;
  mensuravel: boolean;
  /** Linhas encontradas na fonte para esta organização (null se a consulta falhou). */
  linhas: number | null;
  /** Frase pronta para a tela ocupar o lugar do silêncio. */
  declaracao: string;
};

async function contarLinhas(
  supabase: SupabaseClient,
  table: string,
  organizationId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  if (error) {
    console.warn(JSON.stringify({ level: "warn", event: "attention_signals.coverage_failed", context: table, error: error.message || "unknown" }));
    return null;
  }
  return count ?? 0;
}

/**
 * Mede se cada sinal TEM COMO acender, olhando a fonte que ele de fato lê.
 *
 * ── POR QUE `objection_open` NÃO FOI REAPONTADO ──────────────────────────────
 *
 * O candidato natural era `pipeline_stage_moves.discard_reason_key` (273
 * linhas preenchidas): motivo declarado pelo corretor, parecido com objeção.
 * Refutado com medição, não com opinião — em produção os 273 descartes estão
 * TODOS em leads com status "perdido":
 *
 *     select l.status, count(*) from pipeline_stage_moves m
 *       join leads l on l.id = m.lead_id
 *      where m.discard_reason_key is not null group by 1;
 *     -- perdido | 273
 *
 * "perdido" está em TERMINAL_STAGES, e `computeAttentionSignals` descarta
 * etapas terminais em `openLeads` antes de qualquer sinal ser calculado. Ou
 * seja: apontar o sinal para lá daria ZERO por construção — trocaria uma fonte
 * vazia por uma fonte filtrada a vazio, e o alerta continuaria mudo, agora com
 * aparência de conserto. Semanticamente também são fatos diferentes: descarte
 * é laudo de óbito, objeção em aberto é cliente vivo esperando resposta.
 *
 * `lead_objections` está vazia mas NÃO está morta — a rota
 * `app/api/v1/leads/[id]/objections/route.ts` insere e resolve normalmente.
 * Então o correto não é inventar fonte: é dizer que ninguém registrou objeção
 * ainda, e que por isso este alerta não tem o que ler.
 */
export async function medirFontesDosSinais(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<AttentionSourceHealth[]> {
  if (!organizationId) return [];
  const [movimentacoes, tarefas, objecoes, eventos] = await Promise.all([
    contarLinhas(supabase, "pipeline_stage_moves", organizationId),
    contarLinhas(supabase, "tasks", organizationId),
    contarLinhas(supabase, "lead_objections", organizationId),
    contarLinhas(supabase, "lead_events", organizationId),
  ]);

  const avaliar = (
    kind: AttentionSignalKind,
    fonte: string,
    linhas: number | null,
    vivo: string,
    vazio: string,
  ): AttentionSourceHealth => ({
    kind,
    fonte,
    mensuravel: linhas !== null && linhas > 0,
    linhas,
    declaracao: linhas === null
      ? `Não medido: a consulta a ${fonte} falhou. O zero deste alerta não significa que está tudo em ordem.`
      : linhas > 0
        ? vivo
        : vazio,
  });

  return [
    avaliar("stale_stage", "pipeline_stage_moves", movimentacoes,
      `Medindo movimentação de etapa em pipeline_stage_moves (${movimentacoes} registros).`,
      "Não medido: nenhuma movimentação de etapa foi registrada nesta organização, então o tempo parado é contado desde a criação do lead."),
    avaliar("follow_up_overdue", "tasks", tarefas,
      `Medindo tarefas vencidas em tasks (${tarefas} registros).`,
      "Não medido: nenhuma tarefa foi criada nesta organização. Zero follow-ups vencidos aqui significa que não há agenda, não que a agenda está em dia."),
    avaliar("objection_open", "lead_objections", objecoes,
      `Medindo objeções em aberto em lead_objections (${objecoes} registros).`,
      "Não medido: nenhuma objeção foi registrada nesta organização. Zero objeções em aberto aqui significa que ninguém anotou objeção, não que os clientes não têm nenhuma."),
    avaliar("high_score_no_contact", "lead_events", eventos,
      `Medindo interações em lead_events (${eventos} registros).`,
      "Não medido: nenhuma interação foi registrada em lead_events, então todo lead quente pareceria abandonado desde a criação."),
  ];
}

/**
 * Calcula os sinais de atenção para um conjunto de leads já carregado pelo
 * chamador (broker-daily, Lead 360, Copilot). Não busca `leads` — recebe os
 * campos mínimos já normalizados para evitar uma segunda leitura da tabela.
 */
export async function computeAttentionSignals(
  supabase: SupabaseClient,
  organizationId: string,
  leads: AttentionSignalLeadInput[],
  options: { now?: number; primeiroContatoMensuravel?: boolean } = {},
): Promise<AttentionSignal[]> {
  const now = options.now ?? Date.now();
  // Falso por padrão de propósito: o chamador que não leu
  // FIRST_CONTACT_SLA_COLUMNS enxerga first_contacted_at como undefined, e
  // tratar isso como "nunca contatado" marcaria a carteira inteira. Ausência
  // de leitura não pode virar afirmação — é a classe de defeito que este
  // arquivo já documenta em fetchAllRows.
  const primeiroContatoMensuravel = options.primeiroContatoMensuravel === true;
  if (!organizationId) return [];
  const openLeads = leads.filter((lead) => lead.id && !TERMINAL_STAGES.has(lead.status));
  if (!openLeads.length) return [];

  const openIds = openLeads.map((lead) => lead.id);
  const hotLeads = openLeads.filter(isHot);
  const hotIds = hotLeads.map((lead) => lead.id);

  const [stageEnteredAtByLead, overdueFollowUpByLead, lastEventAtByLead, openObjectionByLead] = await Promise.all([
    latestPipelineStageEnteredAt(supabase, organizationId, openIds),
    earliestOverdueFollowUp(supabase, organizationId, openIds, now),
    lastLeadEventAt(supabase, organizationId, hotIds),
    earliestOpenObjection(supabase, organizationId, openIds),
  ]);

  const signals: AttentionSignal[] = [];

  for (const lead of openLeads) {
    // Sinal 1 — parado na etapa além do limite recomendado.
    const threshold = STAGE_STALE_THRESHOLD_DAYS[lead.status];
    if (threshold) {
      const hasHistory = stageEnteredAtByLead.has(lead.id);
      const stageEnteredAt = stageEnteredAtByLead.get(lead.id) ?? toMs(lead.createdAt);
      if (stageEnteredAt !== null) {
        const daysInStage = Math.floor((now - stageEnteredAt) / DAY_MS);
        if (daysInStage >= threshold) {
          const stageLabel = STAGE_LABEL[lead.status] || lead.status;
          signals.push({
            leadId: lead.id,
            kind: "stale_stage",
            severity: daysInStage >= threshold * 2 ? "critical" : "warning",
            reason: `Parado em "${stageLabel}" há ${daysInStage} ${plural(daysInStage, "dia", "dias")}`,
            detail: `pipeline_stage_moves não registra mudança de etapa há ${daysInStage} ${plural(daysInStage, "dia", "dias")} (limite recomendado para "${stageLabel}": ${threshold} ${plural(threshold, "dia", "dias")}).${hasHistory ? "" : " Nenhuma movimentação registrada desde a criação do lead."}`,
            since: new Date(stageEnteredAt).toISOString(),
            metric: daysInStage,
          });
        }
      }
    }

    // Sinal 2 — follow-up agendado (followups.scheduled_at) e vencido (completed=false).
    const overdue = overdueFollowUpByLead.get(lead.id);
    if (overdue) {
      const overdueMinutes = Math.max(1, Math.floor((now - overdue.scheduledAt) / 60_000));
      const overdueLabel = overdueMinutes < 60
        ? `${overdueMinutes} min`
        : overdueMinutes < 1_440
          ? `${Math.floor(overdueMinutes / 60)}h`
          : `${Math.floor(overdueMinutes / 1_440)} ${plural(Math.floor(overdueMinutes / 1_440), "dia", "dias")}`;
      signals.push({
        leadId: lead.id,
        kind: "follow_up_overdue",
        severity: overdueMinutes >= 1_440 ? "critical" : "warning",
        reason: `Follow-up vencido há ${overdueLabel}`,
        detail: `tasks.due_date (${new Date(overdue.scheduledAt).toLocaleString("pt-BR", { timeZone: DISPLAY_TIME_ZONE })}) já passou e a tarefa continua em aberto${overdue.action ? `: "${overdue.action}"` : ""}.${overdue.extraCount ? ` Há mais ${overdue.extraCount} ${plural(overdue.extraCount, "tarefa vencida", "tarefas vencidas")} para este lead.` : ""}`,
        since: new Date(overdue.scheduledAt).toISOString(),
        metric: overdueMinutes,
      });
    }

    // Sinal 5 — nunca contatado: first_contacted_at nulo com prazo vencido.
    // Não faz leitura própria: os dois campos vêm no lead que o chamador já
    // carregou, então este sinal custa zero consulta.
    if (primeiroContatoMensuravel) {
      const veredito = avaliarNuncaContatado({
        firstContactedAtMs: toMs(lead.firstContactedAt),
        firstContactDueAtMs: toMs(lead.firstContactDueAt),
        createdAtMs: toMs(lead.createdAt),
        agoraMs: now,
      });
      if (veredito) {
        const { horasVencido, desde, temPrazoGravado } = veredito;
        const rotuloAtraso = horasVencido < 1
          ? "menos de 1h"
          : horasVencido < 24
            ? `${horasVencido}h`
            : `${Math.floor(horasVencido / 24)} ${plural(Math.floor(horasVencido / 24), "dia", "dias")}`;
        const quando = new Date(desde).toLocaleString("pt-BR", { timeZone: DISPLAY_TIME_ZONE });
        signals.push({
          leadId: lead.id,
          kind: "never_contacted",
          severity: veredito.critico ? "critical" : "warning",
          reason: `Nunca contatado — prazo vencido há ${rotuloAtraso}`,
          detail: `leads.first_contacted_at está nulo: ninguém registrou o primeiro contato com este lead. ${temPrazoGravado ? `O prazo de SLA (first_contact_due_at) venceu em ${quando}` : `Não há prazo de SLA gravado, então a contagem começa na criação do lead (${quando})`}, há ${rotuloAtraso}.`,
          since: new Date(desde).toISOString(),
          metric: horasVencido,
        });
      }
    }

    // Sinal 4 — objeção registrada (lead_objections) e ainda sem resposta.
    const openObjection = openObjectionByLead.get(lead.id);
    if (openObjection) {
      const hoursOpen = Math.max(0, Math.floor((now - openObjection.createdAt) / HOUR_MS));
      if (hoursOpen >= OBJECTION_OPEN_WARNING_HOURS) {
        const typeLabel = OBJECTION_TYPE_LABEL[openObjection.objectionType] || openObjection.objectionType.toLowerCase();
        const openLabel = hoursOpen < 24 ? `${hoursOpen}h` : `${Math.floor(hoursOpen / 24)} ${plural(Math.floor(hoursOpen / 24), "dia", "dias")}`;
        signals.push({
          leadId: lead.id,
          kind: "objection_open",
          severity: hoursOpen >= OBJECTION_OPEN_CRITICAL_HOURS ? "critical" : "warning",
          reason: `Objeção de ${typeLabel} sem resposta há ${openLabel}`,
          detail: `lead_objections tem uma objeção de "${typeLabel}" em aberto (status OPEN) desde ${new Date(openObjection.createdAt).toLocaleString("pt-BR", { timeZone: DISPLAY_TIME_ZONE })}, sem response_text registrado.${openObjection.extraCount ? ` Há mais ${openObjection.extraCount} ${plural(openObjection.extraCount, "objeção em aberto", "objeções em aberto")} para este lead.` : ""}`,
          since: new Date(openObjection.createdAt).toISOString(),
          metric: hoursOpen,
        });
      }
    }
  }

  // Sinal 3 — score alto (ou temperatura "quente") sem nenhum lead_event recente.
  for (const lead of hotLeads) {
    const hasEvent = lastEventAtByLead.has(lead.id);
    const lastEventAt = lastEventAtByLead.get(lead.id) ?? toMs(lead.createdAt);
    if (lastEventAt === null) continue;
    const businessDays = businessDaysElapsed(lastEventAt, now);
    if (businessDays >= HIGH_SCORE_NO_CONTACT_BUSINESS_DAYS) {
      const hotByTemperature = String(lead.temperature || "").trim().toLowerCase() === "quente";
      signals.push({
        leadId: lead.id,
        kind: "high_score_no_contact",
        severity: lead.score >= 85 || businessDays >= HIGH_SCORE_NO_CONTACT_BUSINESS_DAYS * 2 ? "critical" : "warning",
        reason: `Lead quente sem contato há ${businessDays} ${plural(businessDays, "dia útil", "dias úteis")}`,
        detail: `Score ${lead.score}${hotByTemperature ? " e classificado como quente" : ""}, mas lead_events não tem nenhum registro nos últimos ${businessDays} ${plural(businessDays, "dia útil", "dias úteis")} (limite: ${HIGH_SCORE_NO_CONTACT_BUSINESS_DAYS} dias úteis).${hasEvent ? ` Última interação em ${new Date(lastEventAt).toLocaleString("pt-BR", { timeZone: DISPLAY_TIME_ZONE })}.` : " Nenhuma interação foi registrada desde a criação do lead."}`,
        since: new Date(lastEventAt).toISOString(),
        metric: businessDays,
      });
    }
  }

  return signals.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.metric - a.metric);
}

/** Conveniência para o caso de um único lead (Lead 360, Copilot). */
export async function computeAttentionSignalsForLead(
  supabase: SupabaseClient,
  organizationId: string,
  lead: AttentionSignalLeadInput,
  options: { now?: number } = {},
): Promise<AttentionSignal[]> {
  return computeAttentionSignals(supabase, organizationId, [lead], options);
}

/** Agrupa a lista plana de sinais por lead — útil para listas/filas na UI. */
export function groupAttentionSignalsByLead(signals: AttentionSignal[]): Map<string, AttentionSignalSummary> {
  const grouped = new Map<string, AttentionSignalSummary>();
  for (const signal of signals) {
    const bucket = grouped.get(signal.leadId);
    if (!bucket) {
      grouped.set(signal.leadId, { leadId: signal.leadId, signals: [signal], topSeverity: signal.severity, topReason: signal.reason });
      continue;
    }
    bucket.signals.push(signal);
    if (SEVERITY_RANK[signal.severity] > SEVERITY_RANK[bucket.topSeverity]) {
      bucket.topSeverity = signal.severity;
      bucket.topReason = signal.reason;
    }
  }
  return grouped;
}

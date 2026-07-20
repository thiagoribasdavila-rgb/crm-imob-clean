import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PIPELINE_STAGES } from "@/lib/atlas/pipeline-stages";

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
 * chamador — nenhuma leitura própria aqui), `pipeline_history`, `followups`,
 * `lead_events` e `lead_objections`. Nenhuma tabela nova, nenhuma migration.
 *
 * Quatro sinais, cada um com sua própria regra:
 *  1. stale_stage            — lead parado além do tempo tolerado na etapa atual.
 *  2. follow_up_overdue      — followups.scheduled_at no passado com completed=false.
 *  3. high_score_no_contact  — score_ia alto (ou temperatura "quente") sem
 *                              nenhuma linha em lead_events nos últimos N dias úteis.
 *  4. objection_open         — objeção registrada (lead_objections.status="OPEN")
 *                              sem resposta há mais tempo do que o tolerável.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Horários exibidos em detail e fronteiras de dia útil sempre em horário de
// Brasília — o servidor roda em UTC e sem isso o corretor veria +3h e um
// contato às 22h BRT contaria como "dia seguinte". Quando houver timezone
// por organização, este é o único ponto a parametrizar.
const DISPLAY_TIME_ZONE = "America/Sao_Paulo";

export type AttentionSeverity = "critical" | "warning" | "info";
export type AttentionSignalKind = "stale_stage" | "follow_up_overdue" | "high_score_no_contact" | "objection_open";

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
export const HOT_SCORE_THRESHOLD = 70;

// Dias úteis sem nenhum lead_event antes de um lead quente virar sinal.
export const HIGH_SCORE_NO_CONTACT_BUSINESS_DAYS = 3;

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

async function latestPipelineStageEnteredAt(
  supabase: SupabaseClient,
  organizationId: string,
  leadIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const batches = await Promise.all(
    chunk(leadIds, 200).map((ids) =>
      fetchAllRows<{ lead_id: string; created_at: string }>(
        (from, to) =>
          supabase
            .from("pipeline_history")
            .select("lead_id,created_at")
            .eq("organization_id", organizationId)
            .in("lead_id", ids)
            .order("created_at", { ascending: false })
            .range(from, to),
        "pipeline_history",
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

type OverdueFollowUp = { scheduledAt: number; action: string | null; extraCount: number };

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
      fetchAllRows<{ lead_id: string; scheduled_at: string; action: string | null; message: string | null }>(
        (from, to) =>
          supabase
            .from("followups")
            .select("lead_id,scheduled_at,action,message")
            .eq("organization_id", organizationId)
            .eq("completed", false)
            .in("lead_id", ids)
            .lt("scheduled_at", nowIso)
            .order("scheduled_at", { ascending: true })
            .range(from, to),
        "followups",
      ),
    ),
  );
  for (const data of batches) {
    for (const row of data) {
      const scheduledAt = toMs(row.scheduled_at);
      if (scheduledAt === null) continue;
      const existing = map.get(row.lead_id);
      if (!existing) {
        map.set(row.lead_id, { scheduledAt, action: row.action || row.message || null, extraCount: 0 });
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
 * Calcula os sinais de atenção para um conjunto de leads já carregado pelo
 * chamador (broker-daily, Lead 360, Copilot). Não busca `leads` — recebe os
 * campos mínimos já normalizados para evitar uma segunda leitura da tabela.
 */
export async function computeAttentionSignals(
  supabase: SupabaseClient,
  organizationId: string,
  leads: AttentionSignalLeadInput[],
  options: { now?: number } = {},
): Promise<AttentionSignal[]> {
  const now = options.now ?? Date.now();
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
            detail: `pipeline_history não registra mudança de etapa há ${daysInStage} ${plural(daysInStage, "dia", "dias")} (limite recomendado para "${stageLabel}": ${threshold} ${plural(threshold, "dia", "dias")}).${hasHistory ? "" : " Nenhuma movimentação registrada desde a criação do lead."}`,
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
        detail: `followups.scheduled_at (${new Date(overdue.scheduledAt).toLocaleString("pt-BR", { timeZone: DISPLAY_TIME_ZONE })}) já passou e completed ainda é false${overdue.action ? `: "${overdue.action}"` : ""}.${overdue.extraCount ? ` Há mais ${overdue.extraCount} ${plural(overdue.extraCount, "follow-up vencido", "follow-ups vencidos")} para este lead.` : ""}`,
        since: new Date(overdue.scheduledAt).toISOString(),
        metric: overdueMinutes,
      });
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

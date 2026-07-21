/**
 * Eventos de QUALIDADE do funil imobiliário para a Meta Conversions API (v23.0).
 *
 * Objetivo (peça 2 do 10/20): dar à Meta sinais de quem COMPRA — lead
 * qualificado, visita agendada e venda — para o algoritmo otimizar entrega por
 * conversão real, não por clique. Este módulo é o NÚCLEO PURO: só monta
 * payloads. Zero fetch, zero Date.now, zero aleatório, zero process.env — o
 * ENVIO fica no fluxo governado existente (outbox + gates de
 * lib/integrations/meta/capi-feedback.ts), que decide flag/token/dataset.
 *
 * Governança (inegociável, mesma régua do capi-feedback):
 *   - PII NUNCA sai em claro: e-mail/telefone são normalizados e hasheados
 *     SHA-256 hex ANTES de entrar em qualquer payload. Nenhuma função exporta
 *     ou serializa o identificador cru.
 *   - Builders lançam Error em entrada inválida (sem valor de venda, sem
 *     identificador correspondível) em vez de emitir evento ruim — evento de
 *     qualidade errado ensina o algoritmo errado.
 *
 * Normalização em PARIDADE deliberada com capi-feedback.ts /
 * lib/meta/conversions.ts (hashMetaValue): trim + lowercase antes do SHA-256;
 * telefone só dígitos com DDI 55 quando vier no padrão BR de 10-11 dígitos.
 * A paridade é reimplementada (não importada) porque aqueles módulos puxam
 * "server-only"/admin client e este precisa rodar em node puro para o check
 * adversarial — mesmo trade-off já documentado no próprio capi-feedback.ts.
 */

import { createHash } from "node:crypto";

/** Vocabulário fixo dos três eventos de qualidade (dedupe/otimização na Meta). */
export const QUALITY_EVENT_NAMES = {
  /** Custom event — mesmo nome já usado pelo funil vivo (meta_conversion_events). */
  leadQualified: "QualifiedLead",
  /** Evento padrão Meta para agendamento (visita ao decorado/imóvel). */
  visitScheduled: "Schedule",
  /** Evento padrão Meta de compra — exige value > 0 e currency ISO-4217. */
  sale: "Purchase",
} as const;

/** Origem do evento aceita pelo contrato: gerado pelo sistema ou vindo do CRM. */
export type QualityActionSource = "system_generated" | "crm";

/** Identificadores CRUS do lead — existem SÓ na entrada; nunca no payload. */
export type QualityLeadRef = {
  email?: string | null;
  phone?: string | null;
};

export type QualityEventInput = {
  /** Chave de dedupe na Meta — determinística, definida pelo chamador. */
  eventId: string;
  /** Epoch em SEGUNDOS (number) — o relógio é do chamador, nunca deste módulo. */
  eventTime: number;
  leadRef: QualityLeadRef;
  /** Valor monetário — obrigatório (> 0) apenas para saleEvent/Purchase. */
  value?: number;
  /** ISO-4217 (ex.: "BRL") — obrigatório apenas para saleEvent/Purchase. */
  currency?: string;
  /** Default "system_generated"; use "crm" quando o sinal vier do CRM. */
  actionSource?: QualityActionSource;
};

export type QualityCapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: QualityActionSource;
  user_data: { em?: string[]; ph?: string[] };
  custom_data?: Record<string, unknown>;
};

export type QualityEventsRequest = {
  /**
   * Caminho da Graph API SEM versão e SEM barra inicial — pronto para
   * metaGraphUrl(path) (lib/meta/graph.ts), que injeta a v23.0 configurada.
   */
  path: string;
  /** Corpo pronto para JSON.stringify no sender governado. */
  body: { data: QualityCapiEvent[]; test_event_code?: string };
};

// --- Normalização + hash (especificação Meta: SHA-256 hex de valor normalizado) ---

function sha256Hex(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeAndHashEmail(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) return null;
  return sha256Hex(normalized);
}

function normalizeAndHashPhone(value: unknown): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^\d{10,15}$/.test(digits)) return null;
  return sha256Hex(digits);
}

/**
 * Normaliza e hasheia os identificadores do lead no formato user_data da CAPI.
 * Determinístico: mesma entrada → mesmos hashes, testável com vetores
 * conhecidos. Identificador inválido é OMITIDO (nunca enviado cru nem vazio).
 */
export function hashUserData(leadRef: QualityLeadRef): { em?: string[]; ph?: string[] } {
  const userData: { em?: string[]; ph?: string[] } = {};
  const em = normalizeAndHashEmail(leadRef.email);
  const ph = normalizeAndHashPhone(leadRef.phone);
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  return userData;
}

// --- Builders puros ---

function toEventTime(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("eventTime inválido: esperado epoch em segundos (number finito) vindo do chamador.");
  }
  const seconds = Math.floor(value);
  if (seconds <= 0) throw new Error("eventTime inválido: epoch em segundos deve ser > 0.");
  return seconds;
}

function requireEventId(eventId: string): string {
  const trimmed = String(eventId ?? "").trim();
  if (!trimmed) throw new Error("eventId obrigatório: é a chave de dedupe na Meta.");
  return trimmed;
}

function buildBaseEvent(eventName: string, input: QualityEventInput): QualityCapiEvent {
  const userData = hashUserData(input.leadRef);
  if (!userData.em && !userData.ph) {
    throw new Error(
      `Evento ${eventName} sem identificador correspondível: e-mail e telefone ausentes ou inválidos após normalização.`,
    );
  }
  const actionSource = input.actionSource ?? "system_generated";
  if (actionSource !== "system_generated" && actionSource !== "crm") {
    throw new Error(`action_source inválido: "${String(actionSource)}" (aceitos: system_generated, crm).`);
  }
  return {
    event_name: eventName,
    event_time: toEventTime(input.eventTime),
    event_id: requireEventId(input.eventId),
    action_source: actionSource,
    user_data: userData,
  };
}

/** Lead qualificado → custom event "QualifiedLead" (paridade com o funil vivo). */
export function leadQualifiedEvent(input: QualityEventInput): QualityCapiEvent {
  return buildBaseEvent(QUALITY_EVENT_NAMES.leadQualified, input);
}

/** Visita agendada → evento padrão "Schedule". */
export function visitScheduledEvent(input: QualityEventInput): QualityCapiEvent {
  return buildBaseEvent(QUALITY_EVENT_NAMES.visitScheduled, input);
}

/**
 * Venda → "Purchase". value > 0 e currency ISO-4217 são OBRIGATÓRIOS — a Meta
 * usa esse par para otimização por valor; Purchase sem valor é sinal ruim e é
 * rejeitado aqui com Error, não silenciado.
 */
export function saleEvent(input: QualityEventInput): QualityCapiEvent {
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("saleEvent exige value > 0 (valor monetário da venda).");
  }
  const currency = String(input.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('saleEvent exige currency ISO-4217 de 3 letras (ex.: "BRL").');
  }
  const event = buildBaseEvent(QUALITY_EVENT_NAMES.sale, input);
  event.custom_data = { value: Math.round(value * 100) / 100, currency };
  return event;
}

// --- Montagem do request (o ENVIO fica no fluxo governado, não aqui) ---

/**
 * Monta o request pronto para o sender do outbox: path relativo à Graph
 * (dataset/events, versão injetada por metaGraphUrl) + body com os eventos.
 * Dedupe defensivo por event_id (mantém a primeira ocorrência) — a Meta também
 * deduplica, mas não pagamos payload dobrado. testEventCode só entra quando
 * informado (modo Test Events do Events Manager).
 */
export function buildEventsRequest(
  events: QualityCapiEvent[],
  opts: { datasetId: string; testEventCode?: string },
): QualityEventsRequest {
  const datasetId = String(opts.datasetId ?? "").trim();
  if (!/^\d{5,30}$/.test(datasetId)) {
    throw new Error("datasetId inválido: esperado apenas dígitos (mesma regra do sender governado).");
  }
  const seen = new Set<string>();
  const data: QualityCapiEvent[] = [];
  for (const event of events) {
    if (seen.has(event.event_id)) continue;
    seen.add(event.event_id);
    data.push(event);
  }
  const testEventCode = String(opts.testEventCode ?? "").trim();
  return {
    path: `${encodeURIComponent(datasetId)}/events`,
    body: { data, ...(testEventCode ? { test_event_code: testEventCode } : {}) },
  };
}

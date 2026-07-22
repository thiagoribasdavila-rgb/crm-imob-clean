// Emissor de feedback CRM → Meta Conversions API (onda 5 — docs/ESTRATEGIA_META_ANDROMEDA.md §3).
//
// Papel deste módulo: transformar sinais VIVOS do CRM (leads + lead_events) em
// payloads CAPI prontos para revisão humana (export/dry-run) e, somente com o
// gate duplo ATLAS_META_CAPI_ENABLED=true + META_CONVERSIONS_ACCESS_TOKEN,
// enviá-los ao dataset configurado em META_CAPI_DATASET_ID.
//
// Governança (inegociável):
//   - PII NUNCA sai em claro: e-mail/telefone são normalizados e hasheados
//     SHA-256 NO SERVIDOR antes de qualquer serialização. Nenhuma função deste
//     módulo exporta ou loga o identificador em claro.
//   - Flag desligada = ZERO side effect de rede: sendCapiBatch retorna
//     { sent: false, reason } antes de qualquer fetch.
//   - Nenhuma migration: tudo deriva de leads e lead_events já existentes.
//
// Dedupe na Meta: os event_id são determinísticos e reutilizam os padrões já
// enviados pelo sender do outbox (crm-stage-${leadId}-${stage} em
// app/api/v2/outbox/process/route.ts), então se os dois caminhos coexistirem no
// mesmo dataset a Meta deduplica em vez de contar em dobro. O descarte usa
// crm-discard-${leadId} (idempotente por lead), conforme o blueprint.

import "server-only";
import { createHash } from "node:crypto";
import { canonicalPipelineStage } from "@/lib/atlas/pipeline-stages";
import {
  CAMPAIGN_QUALITY_COMMERCIAL_STAGES,
  isCommerciallyQualifiedLead,
  isQualifiedLead,
} from "@/lib/atlas/campaign-quality";
import { DISCARD_TAXONOMY_VERSION, getDiscardReason } from "@/lib/atlas/discard-reasons";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { metaGraphVersion, describeMetaGraphFailure } from "@/lib/meta/graph";

// v2: QualifiedLead deixou de ser score/temperatura (qualificação de CADASTRO,
// que é soma de campos preenchidos) e passou a exigir lastro comercial
// verificável. O sinal externo é composto: cada lote errado piora a entrega da
// campanha seguinte, então aqui vale a régua mais dura do produto.
export const CAPI_SIGNAL_VERSION = "andromeda-v2";
/** Etapas que valem como evidência comercial para o sinal externo. */
export const CAPI_QUALIFIED_STAGES = CAMPAIGN_QUALITY_COMMERCIAL_STAGES;

// Vocabulário alinhado ao funil já reportado em meta_conversion_events
// (QualifiedLead/ConvertedLead) + evento próprio de descarte. O descarte usa um
// event_name custom porque o vocabulário padrão da Meta não tem "disqualified"
// como conversão — a categoria da taxonomia viaja em custom_data.
export const CAPI_EVENT_NAMES = {
  qualified: "QualifiedLead",
  won: "ConvertedLead",
  discarded: "LeadDisqualified",
} as const;

// --- Normalização + hash (especificação Meta: SHA-256 hex, lowercase/trim) ---

function sha256Hex(value: string) {
  // Mesma semântica de hashMetaValue (lib/meta/conversions.ts): trim +
  // lowercase antes do hash, garantindo paridade de correspondência/dedupe
  // com o sender existente sem importar o módulo (que puxa o admin client).
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mail → trim/lowercase → SHA-256 hex. Retorna null se inválido. Nunca devolve o valor em claro. */
export function normalizeAndHashEmail(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) return null;
  return sha256Hex(normalized);
}

/**
 * Telefone → só dígitos, prefixo 55 quando vier sem DDI (10-11 dígitos, padrão
 * BR — mesma regra de normalizeMetaPhone/normalizePhoneE164) → SHA-256 hex.
 * Retorna null se não formar um E.164 plausível. Nunca devolve o valor em claro.
 */
export function normalizeAndHashPhone(value: unknown): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^\d{10,15}$/.test(digits)) return null;
  return sha256Hex(digits);
}

function hashExternalId(organizationId: string, leadId: string) {
  // Padrão idêntico ao sender existente: hashMetaValue(`atlas:${org}:${lead}`).
  return sha256Hex(`atlas:${organizationId}:${leadId}`);
}

// --- Tipos de entrada (colunas VIVAS de leads / lead_events, lição F1) ---

export type CapiLeadRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  score_ia?: number | string | null;
  temperature?: string | null;
  campaign_id?: string | null;
  created_at?: string | null;
  budget_min?: number | string | null;
  budget_max?: number | string | null;
};

export type CapiDiscardEventRow = {
  lead_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type CapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "system_generated";
  user_data: { em?: string[]; ph?: string[]; external_id: string[] };
  custom_data: Record<string, unknown>;
};

export type CapiBatch = {
  events: CapiEvent[];
  summary: {
    total: number;
    byEventName: Record<string, number>;
    byDisqualificationReason: Record<string, number>;
    skipped: { missingIdentifiers: number; invalidTimestamp: number; discardLeadMissing: number };
    /**
     * Leads com cadastro qualificado (score >= 70 ou "quente") que NÃO viraram
     * QualifiedLead por falta de lastro comercial. Ausência explicada e
     * contável: mede exatamente o que a régua nova deixou de ensinar à Meta.
     */
    suppressed: { registrationQualifiedWithoutCommercialEvidence: number };
  };
  taxonomyVersion: number;
  signalVersion: string;
};

function toUnixSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  // event_time no futuro é rejeitado pela Meta; clock skew vira "agora".
  return Math.min(Math.floor(parsed / 1000), Math.floor(Date.now() / 1000));
}

function buildUserData(organizationId: string, lead: CapiLeadRow) {
  const userData: CapiEvent["user_data"] = { external_id: [hashExternalId(organizationId, lead.id)] };
  const em = normalizeAndHashEmail(lead.email);
  const ph = normalizeAndHashPhone(lead.phone);
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  return { userData, matchable: Boolean(em || ph) };
}

function budgetValue(lead: CapiLeadRow): number | null {
  // Valor da conversão: melhor aproximação viva é o orçamento declarado
  // (budget_max, com fallback budget_min). Sem orçamento → conversão sem valor.
  for (const raw of [lead.budget_max, lead.budget_min]) {
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
  }
  return null;
}

/**
 * Qualificação COMERCIAL — o único lastro que vira sinal externo: o lead chegou
 * a visita, proposta, contrato ou ganho. score_ia/temperature medem cadastro
 * (quantos campos foram preenchidos), e ensinar isso à Meta faz o algoritmo
 * trazer lead bem cadastrado em vez de comprador. Sem evidência, sem sinal.
 */
function isQualified(lead: CapiLeadRow) {
  return isCommerciallyQualifiedLead({ status: lead.status ?? null });
}

/** Qualificação de CADASTRO — usada só para CONTAR o que foi suprimido, nunca para emitir evento. */
function isRegistrationQualified(lead: CapiLeadRow) {
  return isQualifiedLead({ score_ia: lead.score_ia ?? null, temperature: lead.temperature ?? null });
}

/**
 * Converte linhas vivas do CRM em payloads CAPI:
 *   - qualificado COMERCIALMENTE (etapa canônica visita/proposta/contrato/ganho)
 *     → QualifiedLead. Cadastro bem preenchido NÃO gera sinal;
 *   - ganho (status canônico "ganho") → ConvertedLead com currency BRL e value
 *     quando houver orçamento declarado;
 *   - descartado (lead_events event_type=lead_discarded) → LeadDisqualified com
 *     metaCategory/reasonKey da taxonomia em custom_data.
 * Eventos sem pelo menos um identificador correspondível (em/ph) são
 * descartados e contados em summary.skipped — regra já vigente no sender.
 */
export function buildCapiLeadEvents(input: {
  organizationId: string;
  leads: CapiLeadRow[];
  discardEvents: CapiDiscardEventRow[];
}): CapiBatch {
  const events: CapiEvent[] = [];
  const byEventName: Record<string, number> = {};
  const byDisqualificationReason: Record<string, number> = {};
  const skipped = { missingIdentifiers: 0, invalidTimestamp: 0, discardLeadMissing: 0 };
  const suppressed = { registrationQualifiedWithoutCommercialEvidence: 0 };

  const leadById = new Map(input.leads.map((lead) => [lead.id, lead]));

  const push = (event: CapiEvent) => {
    events.push(event);
    byEventName[event.event_name] = (byEventName[event.event_name] ?? 0) + 1;
  };

  const baseCustomData = (lead: CapiLeadRow) => ({
    campaign_id: lead.campaign_id ?? null,
    atlas_signal_version: CAPI_SIGNAL_VERSION,
  });

  for (const lead of input.leads) {
    const qualified = isQualified(lead);
    const won = canonicalPipelineStage(lead.status) === "ganho";
    if (!qualified && isRegistrationQualified(lead)) {
      suppressed.registrationQualifiedWithoutCommercialEvidence += 1;
    }
    if (!qualified && !won) continue;

    const { userData, matchable } = buildUserData(input.organizationId, lead);
    const eventTime = toUnixSeconds(lead.created_at);
    const candidates = Number(qualified) + Number(won);
    if (!matchable) {
      skipped.missingIdentifiers += candidates;
      continue;
    }
    if (eventTime === null) {
      skipped.invalidTimestamp += candidates;
      continue;
    }

    if (qualified) {
      push({
        event_name: CAPI_EVENT_NAMES.qualified,
        // LIMITAÇÃO CONHECIDA (não corrigida aqui): event_time continua sendo a
        // criação do lead, não a data da visita/proposta — o CRM não tem, nas
        // colunas de leads, a data da mudança de etapa, e derivá-la de
        // updated_at/created_at seria fabricar data de evento. Corrigir exige
        // ler o lead_event "pipeline_stage_changed" e mudar o critério de
        // seleção do lote; enquanto isso, a data é a de origem do lead.
        event_time: eventTime,
        event_id: `crm-stage-${lead.id}-qualificacao`,
        action_source: "system_generated",
        user_data: userData,
        custom_data: {
          ...baseCustomData(lead),
          lead_status: "qualified",
          // Declara o lastro do sinal — auditável do lado da Meta.
          qualification_basis: "commercial_stage",
          qualification_stage: canonicalPipelineStage(lead.status),
        },
      });
    }
    if (won) {
      const value = budgetValue(lead);
      push({
        event_name: CAPI_EVENT_NAMES.won,
        event_time: eventTime,
        event_id: `crm-stage-${lead.id}-ganho`,
        action_source: "system_generated",
        user_data: userData,
        custom_data: {
          ...baseCustomData(lead),
          lead_status: "converted",
          ...(value !== null ? { currency: "BRL", value } : {}),
        },
      });
    }
  }

  for (const row of input.discardEvents) {
    const lead = row.lead_id ? leadById.get(row.lead_id) : undefined;
    if (!lead) {
      skipped.discardLeadMissing += 1;
      continue;
    }
    const { userData, matchable } = buildUserData(input.organizationId, lead);
    if (!matchable) {
      skipped.missingIdentifiers += 1;
      continue;
    }
    const eventTime = toUnixSeconds(row.created_at);
    if (eventTime === null) {
      skipped.invalidTimestamp += 1;
      continue;
    }
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const reasonKey = String(metadata.reasonKey ?? "").trim().toLowerCase();
    const reason = getDiscardReason(reasonKey);
    const metaCategory = reason?.metaCategory
      ?? (typeof metadata.metaCategory === "string" && metadata.metaCategory ? metadata.metaCategory : "other");
    byDisqualificationReason[metaCategory] = (byDisqualificationReason[metaCategory] ?? 0) + 1;
    push({
      event_name: CAPI_EVENT_NAMES.discarded,
      event_time: eventTime,
      event_id: `crm-discard-${lead.id}`,
      action_source: "system_generated",
      user_data: userData,
      custom_data: {
        ...baseCustomData(lead),
        lead_status: "disqualified",
        disqualification_reason: metaCategory,
        disqualification_reason_key: reasonKey || "motivo_ausente",
        taxonomy_version: DISCARD_TAXONOMY_VERSION,
      },
    });
  }

  return {
    events,
    summary: { total: events.length, byEventName, byDisqualificationReason, skipped, suppressed },
    taxonomyVersion: DISCARD_TAXONOMY_VERSION,
    signalVersion: CAPI_SIGNAL_VERSION,
  };
}

// --- Envio (gated) ---

export type CapiSendOutcome =
  | { sent: false; reason: "flag_disabled" | "missing_token" | "missing_dataset" | "empty_batch"; message: string }
  | { sent: true; datasetId: string; batches: number; eventsSent: number; responses: unknown[] };

const CAPI_MAX_EVENTS_PER_REQUEST = 500;

/**
 * Envia o lote à Meta CAPI SOMENTE quando ATLAS_META_CAPI_ENABLED === "true",
 * META_CONVERSIONS_ACCESS_TOKEN existe e META_CAPI_DATASET_ID é válido. Fora
 * disso retorna { sent: false, reason } SEM nenhuma chamada de rede — os gates
 * ficam antes de qualquer fetch, verificável por leitura. Erros HTTP da Meta
 * viram throw (o chamador decide status/retry); event_id determinístico torna
 * o retryUnsafe do resilientFetch seguro (dedupe do lado da Meta).
 */
export async function sendCapiBatch(events: CapiEvent[]): Promise<CapiSendOutcome> {
  if (process.env.ATLAS_META_CAPI_ENABLED !== "true") {
    return { sent: false, reason: "flag_disabled", message: "ATLAS_META_CAPI_ENABLED está desligada — nenhum evento sai do Atlas (somente export/dry-run)." };
  }
  const accessToken = process.env.META_CONVERSIONS_ACCESS_TOKEN;
  if (!accessToken) {
    return { sent: false, reason: "missing_token", message: "META_CONVERSIONS_ACCESS_TOKEN não configurado — envio bloqueado." };
  }
  const datasetId = String(process.env.META_CAPI_DATASET_ID ?? "").trim();
  if (!/^\d{5,30}$/.test(datasetId)) {
    return { sent: false, reason: "missing_dataset", message: "META_CAPI_DATASET_ID ausente ou inválido (esperado apenas dígitos) — envio bloqueado." };
  }
  if (!events.length) {
    return { sent: false, reason: "empty_batch", message: "Nenhum evento elegível na janela — nada a enviar." };
  }

  const apiVersion = metaGraphVersion();
  const responses: unknown[] = [];
  for (let index = 0; index < events.length; index += CAPI_MAX_EVENTS_PER_REQUEST) {
    const batch = events.slice(index, index + CAPI_MAX_EVENTS_PER_REQUEST);
    const response = await resilientFetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(datasetId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: batch }),
    }, { timeoutMs: 30_000, retries: 1, retryUnsafe: true, operation: "Meta Conversions API" });
    const data = await response.json() as { events_received?: number; error?: { message?: string } };
    if (!response.ok) throw new Error(describeMetaGraphFailure(response.status, data));
    responses.push(data);
  }

  return { sent: true, datasetId, batches: responses.length, eventsSent: events.length, responses };
}

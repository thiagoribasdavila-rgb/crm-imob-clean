import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toLearningEventRow, type CommercialFact } from "@/lib/ai/learning-loop";
import { calculateLeadScore } from "@/lib/atlas/scoring";
import { isMissingColumn, isMissingRelation } from "@/lib/compat/legacy-v2";
import type { AtlasLead } from "@/types/atlas";

type LeadEventInput = {
  organizationId: string;
  leadId: string;
  actorId: string;
  type: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordLiveLeadEvent(admin: SupabaseClient, input: LeadEventInput) {
  const description = [input.title.trim(), input.description?.trim()].filter(Boolean).join(" — ").slice(0, 4000);
  const { data, error } = await admin
    .from("lead_events")
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      created_by: input.actorId,
      event_type: input.type,
      type: input.type,
      description,
      metadata: { title: input.title.trim(), ...(input.metadata ?? {}) },
    })
    .select("id,lead_id,event_type,type,description,metadata,created_by,created_at")
    .single();
  return { data, error };
}

/**
 * Ponto ÚNICO de gravação do aprendizado comercial (ai_learning_events).
 *
 * Concentrar aqui existe para a tabela não virar lixo: se cada rota inventar o
 * próprio shape, a contagem de "o que converte" deixa de ser somável e o
 * aprendizado perde o valor antes de existir.
 *
 * Nunca lança e nunca reverte nada: o chamador o coloca no Promise.allSettled
 * best-effort ao lado da movimentação comercial, porque falha de aprendizado
 * jamais pode desfazer uma venda que o corretor acabou de registrar.
 *
 * O preço de ser best-effort é que a falha some. Por isso `drift`: tabela ou
 * coluna ausente é uma classe de erro diferente de indisponibilidade momentânea
 * — ela significa que NENHUMA linha será gravada nunca, e o chamador precisa
 * conseguir distinguir isso para registrar como erro, não como aviso. Um
 * aprendizado que falha em silêncio para sempre entrega zero com aparência de
 * entrega verde.
 */
export async function recordCommercialLearningEvent(admin: SupabaseClient, fact: CommercialFact) {
  const row = toLearningEventRow(fact);
  // null aqui é decisão do núcleo puro (etapa fora da taxonomia, sem lead ou
  // organização): silêncio deliberado, não falha — por isso `skipped`.
  if (!row) return { data: null, error: null, skipped: true, drift: false };
  try {
    const { data, error } = await admin
      .from("ai_learning_events")
      .insert(row)
      .select("id,lead_id,event_type,converted,conversion_stage,created_at")
      .single();
    return { data, error, skipped: false, drift: isMissingRelation(error) || isMissingColumn(error) };
  } catch (cause) {
    return { data: null, error: { message: cause instanceof Error ? cause.message : String(cause) }, skipped: false, drift: false };
  }
}

export function mapLiveLeadEvent(row: Record<string, unknown>) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  return {
    id: row.id,
    user_id: row.created_by ?? null,
    title: typeof metadata.title === "string" ? metadata.title : row.event_type ?? row.type ?? "Atividade",
    description: row.description ?? null,
    type: row.event_type ?? row.type ?? "note",
    metadata,
    occurred_at: row.created_at ?? null,
  };
}

const PURPOSE_IN_NOTES = /Objetivo declarado:\s*(moradia|investimento|loca[cç][aã]o)\.?/i;

/** Número finito 0–100 arredondado; null quando não há score declarado (0 inclusive). */
function readDeclaredScore(value: unknown): number | null {
  const parsed = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  const bounded = Math.min(100, Math.max(0, Math.round(parsed)));
  // 0 nunca é declaração: o Lead 360 devolve 0 quando a coluna está null, e um
  // lead válido (exige telefone ou e-mail) sempre pontua acima de zero.
  return bounded > 0 ? bounded : null;
}

function readCurrentNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : null;
}

function purposeFromNotes(value: unknown): string {
  const match = typeof value === "string" ? value.match(PURPOSE_IN_NOTES) : null;
  if (!match) return "";
  const normalized = match[1].toLocaleLowerCase("pt-BR");
  return normalized.startsWith("loca") ? "locacao" : normalized;
}

/**
 * Payload de UPDATE do lead (substituição total da linha).
 *
 * Regra de ouro desta função: campo AUSENTE no corpo preserva o valor atual —
 * nunca vira null, 0 ou "frio". O PATCH parcial rebaixava o lead em silêncio
 * (score_ia = 0 e temperature = "frio"), e esses dois campos comandam fila do
 * dia, distribuição e filtro de min_score.
 *
 * score_ia é DERIVADO dos dados (mesma função da criação, lib/atlas/scoring),
 * não declarado pelo cliente: a tela devolve o score que leu, então tratar esse
 * eco como declaração congelaria o número para sempre — preencher orçamento e
 * região nunca elevaria o score. Só um valor DIFERENTE do atual é aceito como
 * override deliberado de um cliente de API.
 */
export function liveLeadUpdatePayload(
  body: Record<string, unknown>,
  currentStatus: unknown,
  currentLead: Record<string, unknown> = {},
) {
  const sent = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  const budgetMinRaw = body.budget_min === null || body.budget_min === "" ? null : Number(body.budget_min);
  const budgetMaxRaw = body.budget_max === null || body.budget_max === "" ? null : Number(body.budget_max);
  const bedroomsRaw = body.bedrooms === null || body.bedrooms === "" ? null : Number(body.bedrooms);
  const budgetMin = sent("budget_min")
    ? (Number.isFinite(budgetMinRaw) ? budgetMinRaw : null)
    : readCurrentNumber(currentLead.budget_min);
  const budgetMax = sent("budget_max")
    ? (Number.isFinite(budgetMaxRaw) ? budgetMaxRaw : null)
    : readCurrentNumber(currentLead.budget_max);
  const bedrooms = sent("bedrooms")
    ? (Number.isFinite(bedroomsRaw) ? bedroomsRaw : null)
    : readCurrentNumber(currentLead.preferred_bedrooms);

  const currentNeighborhoods = Array.isArray(currentLead.preferred_neighborhoods)
    ? currentLead.preferred_neighborhoods.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
    : [];
  const preferredNeighborhoods = sent("preferred_regions")
    ? (Array.isArray(body.preferred_regions)
      ? body.preferred_regions.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
      : [])
    : currentNeighborhoods;

  const currentNotes = typeof currentLead.notes === "string" ? currentLead.notes : "";
  const purpose = sent("purpose") && typeof body.purpose === "string"
    ? body.purpose.trim()
    : purposeFromNotes(currentNotes);
  const notesSource = sent("notes") && typeof body.notes === "string" ? body.notes : currentNotes;
  const notes = notesSource
    .replace(/^Objetivo declarado:\s*(moradia|investimento|loca[cç][aã]o)\.?\s*/i, "")
    .trim();
  const enrichedNotes = [purpose ? `Objetivo declarado: ${purpose}.` : "", notes].filter(Boolean).join("\n").slice(0, 5000) || null;

  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.replace(/\D/g, "") : null;
  const status = typeof body.status === "string" && body.status.trim()
    ? body.status.trim().toLowerCase()
    : String(currentStatus || "novo").toLowerCase();

  // Mapeamento snake→camel explícito: calculateLeadScore lê AtlasLead. Passar a
  // linha do banco direto produziria score sobre objeto vazio.
  // lastInteractionAt/nextActionAt ficam de fora de propósito — a criação também
  // não os informa, e incluí-los aqui daria scores diferentes para o mesmo lead
  // dependendo do caminho de escrita.
  const scoringInput: Partial<AtlasLead> = {
    email,
    phone,
    budgetMax: budgetMax ?? null,
    preferredRegions: preferredNeighborhoods,
    bedrooms: bedrooms ?? null,
    purpose: purpose || null,
    status,
  };
  const derived = calculateLeadScore(scoringInput);
  const declaredScore = readDeclaredScore(body.score);
  const storedScore = readDeclaredScore(currentLead.score_ia);
  const scoreIa = declaredScore !== null && declaredScore !== storedScore ? declaredScore : derived.score;

  const currentTemperature = typeof currentLead.temperature === "string" && currentLead.temperature.trim()
    ? currentLead.temperature.trim().toLowerCase()
    : null;
  // Temperatura é declarada por humano na Lead 360: o valor enviado vence, o
  // atual é preservado na omissão, e só na ausência dos dois cai na derivada.
  const temperature = typeof body.temperature === "string" && body.temperature.trim()
    ? body.temperature.trim().toLowerCase()
    : currentTemperature ?? derived.temperature;

  return {
    name: typeof body.name === "string" ? body.name.trim() : null,
    email,
    phone,
    source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : null,
    status,
    temperature,
    // A criação grava as duas colunas de temperatura; o PATCH só gravava uma e
    // deixava classificacao_ia congelada no valor do nascimento do lead.
    classificacao_ia: temperature,
    score_ia: scoreIa,
    budget_min: budgetMin,
    budget_max: budgetMax,
    preferred_bedrooms: bedrooms,
    preferred_neighborhoods: preferredNeighborhoods,
    notes: enrichedNotes,
  };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toLearningEventRow, type CommercialFact } from "@/lib/ai/learning-loop";
import { isMissingColumn, isMissingRelation } from "@/lib/compat/legacy-v2";

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

export { liveLeadUpdatePayload } from "@/lib/compat/payload-de-lead";

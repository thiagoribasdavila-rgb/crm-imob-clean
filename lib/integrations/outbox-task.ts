import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Garantia de tarefa no outbox — a fronteira onde um lead PAGO se perdia.
 *
 * O padrão anterior era `insert` cego logo depois do insert do agregado. Quando
 * o agregado já existia (reenvio da Meta batendo no unique de
 * meta_lead_events.external_lead_id), o código pulava fora ANTES de chegar ao
 * insert do outbox — e o evento ficava `received` para sempre, sem tarefa, sem
 * erro, sem dead letter, sem reaper que o encontrasse. O mecanismo de retry que
 * deveria salvar o lead era justamente o que o enterrava.
 *
 * Aqui a operação é IDEMPOTENTE por (organização, tópico, agregado): existe →
 * não duplica; não existe → cria; corrida perdida (unique_violation) → aceita
 * que o concorrente criou. A corrida só é fechada de verdade com o índice
 * parcial de 20260722191000_outbox_live_task_unique.sql; sem ele o pior caso é
 * uma tarefa duplicada — que os guards do worker (`status !== 'imported'`)
 * absorvem — em vez de nenhuma tarefa, que é perda definitiva.
 *
 * Falha de leitura/escrita NUNCA vira sucesso silencioso: o chamador recebe
 * `ok: false` e decide (o webhook devolve 500 para a Meta reenviar).
 */

const UNIQUE_VIOLATION = "23505";

export type OutboxTaskOutcome =
  | { ok: true; state: "created" | "already_queued" }
  | { ok: false; reason: string; code: string | null };

export type MetaLeadFetchOutcome =
  | OutboxTaskOutcome
  | { ok: true; state: "already_imported" | "aggregate_not_visible" };

export async function ensureOutboxTask(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    topic: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<OutboxTaskOutcome> {
  const existing = await admin
    .from("integration_outbox")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("topic", input.topic)
    .eq("aggregate_id", input.aggregateId)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, reason: existing.error.message, code: existing.error.code ?? null };
  }
  // Qualquer estado conta como "já enfileirada", inclusive terminal: um evento
  // entregue já foi processado (ou pulado pelo guard do agregado) e recriar a
  // tarefa reprocessaria o mesmo lead.
  if (existing.data?.id) return { ok: true, state: "already_queued" };

  const inserted = await admin.from("integration_outbox").insert({
    organization_id: input.organizationId,
    topic: input.topic,
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    payload: input.payload,
  });
  if (inserted.error) {
    if (inserted.error.code === UNIQUE_VIOLATION) return { ok: true, state: "already_queued" };
    return { ok: false, reason: inserted.error.message, code: inserted.error.code ?? null };
  }
  return { ok: true, state: "created" };
}

/**
 * Recuperação do caso concreto: o lead da Meta já foi recebido (o insert bateu
 * no unique) e é preciso descobrir se a tarefa correspondente existe.
 *
 * A busca é escopada pela organização porque `meta_lead_events.external_lead_id`
 * é unique GLOBAL: uma colisão vinda de outra organização não é um lead desta
 * para recuperar, e tocar nela seria escrever no dado de outro. Nesse caso o
 * resultado é `aggregate_not_visible` — ausência explicada, para o chamador
 * registrar em vez de contar como recuperado.
 */
export async function ensureMetaLeadFetchTask(
  admin: SupabaseClient,
  input: { organizationId: string; externalLeadId: string },
): Promise<MetaLeadFetchOutcome> {
  const found = await admin
    .from("meta_lead_events")
    .select("id,status")
    .eq("organization_id", input.organizationId)
    .eq("external_lead_id", input.externalLeadId)
    .limit(1)
    .maybeSingle();
  if (found.error) {
    return { ok: false, reason: found.error.message, code: found.error.code ?? null };
  }
  if (!found.data?.id) return { ok: true, state: "aggregate_not_visible" };
  if (found.data.status === "imported") return { ok: true, state: "already_imported" };

  return ensureOutboxTask(admin, {
    organizationId: input.organizationId,
    topic: "meta.lead.fetch",
    aggregateType: "meta_lead_event",
    aggregateId: found.data.id,
    payload: { externalLeadId: input.externalLeadId },
  });
}

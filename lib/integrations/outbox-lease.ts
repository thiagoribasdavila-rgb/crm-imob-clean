import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/**
 * Encerramento de evento no outbox — o único ponto em que o worker devolve o
 * lease. Falhando calado, o evento fica preso em 'processing': fora da fila,
 * fora das falhas, fora do dead letter, invisível para sempre.
 *
 * Dois campos deste caminho dependem de DDL que pode não estar aplicado no
 * banco alvo: `cause` (20260722150000) e o status 'blocked' (20260722190000).
 * Sem a coluna o PostgREST devolve 42703; sem o CHECK novo, 23514. Nos dois
 * casos a informação acessória se perde, mas o evento NÃO pode ficar preso —
 * então há uma segunda tentativa degradada, registrada no log em vez de
 * silenciada. A ordem certa continua sendo DDL antes do código
 * (docs/POST_DEPLOY_CHECKLIST.md); isto é rede para o acidente, não substituto.
 */
export async function closeOutboxEvent(
  admin: SupabaseClient,
  eventId: string,
  patch: Record<string, unknown>,
  fallbackStatus?: string,
): Promise<boolean> {
  const first = await admin.from("integration_outbox").update(patch).eq("id", eventId);
  if (!first.error) return true;

  const degraded: Record<string, unknown> = { ...patch };
  delete degraded.cause;
  if (fallbackStatus) degraded.status = fallbackStatus;
  const second = await admin.from("integration_outbox").update(degraded).eq("id", eventId);
  logger.warn("outbox.close_degraded", {
    eventId,
    code: first.error.code ?? null,
    requestedStatus: patch.status ?? null,
    appliedStatus: second.error ? null : degraded.status ?? null,
    closed: !second.error,
  });
  if (second.error) logger.error("outbox.close_failed", new Error(second.error.message), { eventId, code: second.error.code ?? null });
  return !second.error;
}

// Lease expirado: worker que morre no meio (deploy, OOM, timeout de cron)
// deixava o evento em 'processing' para sempre. locked_at/locked_by eram
// ESCRITOS no claim e nunca lidos em lugar nenhum do repositório — cada morte
// consumia um lead pago em silêncio, fora da contagem de tentativas e fora do
// dead letter. 15 minutos ficam bem acima do maior tempo possível de um evento
// (as chamadas externas têm timeout de 30s).
export const LEASE_TIMEOUT_MINUTES = 15;
const LEASE_RECOVERY_LIMIT = 50;

// Reenfileirar só é seguro onde o REPROCESSAMENTO é guardado por estado do
// agregado: meta.lead.fetch e portal.lead.ingest saem cedo com
// `status === 'imported'`, e meta.conversion.send tem event_id determinístico
// (a Meta deduplica) além do estado próprio do evento de conversão.
// message.send NÃO entra: a Graph do WhatsApp não recebe chave de idempotência
// aqui, e reenviar por expiração de lock é mandar a mensagem DE NOVO para o
// cliente — dano visível e, em lote de reativação, risco de opt-out.
// whatsapp.inbound.analyze também fica de fora: reprocessar gasta crédito de IA
// sem ninguém ter pedido.
const LEASE_REPLAYABLE_TOPICS = new Set(["meta.lead.fetch", "meta.conversion.send", "portal.lead.ingest"]);
const DELIVERED_MESSAGE_STATUSES = new Set(["sent", "delivered", "read"]);

export type LeaseRecoveryReport =
  | { measured: true; requeued: number; closed: number; escalated: number }
  | { measured: false; reason: string };

export async function recoverExpiredLeases(admin: SupabaseClient): Promise<LeaseRecoveryReport> {
  const cutoff = new Date(Date.now() - LEASE_TIMEOUT_MINUTES * 60_000).toISOString();
  const { data: stuck, error } = await admin
    .from("integration_outbox")
    .select("id,organization_id,topic,aggregate_id,payload,attempts,locked_at")
    .eq("status", "processing")
    .lt("locked_at", cutoff)
    .order("locked_at", { ascending: true })
    .limit(LEASE_RECOVERY_LIMIT);
  // Lacuna explicada, nunca zero inventado: sem a leitura não há como afirmar
  // que não existe evento preso.
  if (error) return { measured: false, reason: error.message };

  const now = new Date().toISOString();
  let requeued = 0, closed = 0, escalated = 0;

  for (const event of stuck ?? []) {
    if (LEASE_REPLAYABLE_TOPICS.has(event.topic)) {
      const ok = await closeOutboxEvent(admin, event.id, { status: "pending", available_at: now, locked_at: null, locked_by: null, last_error: "Lease expirado: o worker anterior morreu antes de encerrar o evento." });
      if (ok) requeued += 1;
      continue;
    }

    if (event.topic === "message.send" && event.aggregate_id) {
      const { data: message } = await admin.from("messages").select("status").eq("id", event.aggregate_id).maybeSingle();
      if (message && DELIVERED_MESSAGE_STATUSES.has(String(message.status))) {
        const ok = await closeOutboxEvent(admin, event.id, { status: "delivered", delivered_at: now, locked_at: null, locked_by: null, last_error: "Lease expirado depois da entrega: a mensagem já constava enviada." });
        if (ok) closed += 1;
        continue;
      }
    }

    // Sem prova de entrega o worker não decide sozinho: o evento vai para o
    // canal humano que já existe (dead letter + /api/v3/dlq/retry), onde
    // reenviar é ato de gente. Ficar em 'processing' era a única saída pior,
    // porque é invisível.
    const ok = await closeOutboxEvent(admin, event.id, { status: "dead_letter", locked_at: null, locked_by: null, last_error: "Lease expirado sem prova de entrega: reenvio exige decisão humana." });
    if (!ok) continue;
    await admin.from("dead_letter_events").insert({
      organization_id: event.organization_id,
      outbox_event_id: event.id,
      topic: event.topic,
      payload: event.payload,
      error_message: `Lease expirado (locked_at ${event.locked_at}) sem prova de entrega. Reenvio exige decisão humana.`,
      attempts: Number(event.attempts || 0),
    });
    escalated += 1;
    logger.warn("outbox.lease_escalated", { eventId: event.id, topic: event.topic, lockedAt: event.locked_at });
  }

  return { measured: true, requeued, closed, escalated };
}

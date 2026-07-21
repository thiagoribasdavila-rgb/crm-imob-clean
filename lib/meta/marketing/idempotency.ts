/**
 * Idempotência de execução na Meta — impede que um reenvio (duplo clique, retry
 * de rede, reprocessamento) CRIE a campanha duas vezes e cobre em dobro.
 *
 * A Marketing API não honra idempotency-key própria, então o Atlas guarda o
 * resultado por chave. Duas camadas:
 *  1) EM MEMÓRIA (imediata): protege o caso comum — mesmo processo, segundos de
 *     diferença — mesmo sem banco. TTL curto.
 *  2) BANCO (durável, best-effort): tabela meta_executions com unique na chave;
 *     sobrevive a reinício e a múltiplas instâncias. Ausente (pré-Fase 0) →
 *     degrada para só a camada de memória, honestamente.
 *
 * Registro guarda o resultado (ids criados) para DEVOLVER em vez de recriar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type IdempotencyRecord = { key: string; result: unknown; at: number };

const g = globalThis as typeof globalThis & { __atlasMetaExec?: Map<string, IdempotencyRecord> };
const mem = g.__atlasMetaExec ?? new Map<string, IdempotencyRecord>();
g.__atlasMetaExec = mem;

export const IDEMPOTENCY_TTL_MS = 10 * 60_000; // 10 min cobre retries/reenvios humanos
const MAX_ENTRIES = 2_000;

/**
 * Procura um resultado já executado para a chave (memória → banco).
 * Retorna o resultado anterior, ou null se a chave é nova.
 */
export async function findPriorExecution(admin: SupabaseClient | null, key: string): Promise<unknown | null> {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < IDEMPOTENCY_TTL_MS) return hit.result;
  if (hit) mem.delete(key);

  if (admin) {
    try {
      const { data, error } = await admin
        .from("meta_executions").select("result").eq("idempotency_key", key).maybeSingle();
      if (!error && data) {
        // reidrata a memória para os próximos acessos
        mem.set(key, { key, result: data.result, at: Date.now() });
        return data.result;
      }
    } catch {
      // sem tabela / erro → só a camada de memória vale (honesto)
    }
  }
  return null;
}

/** Grava o resultado da execução (memória sempre; banco best-effort). */
export async function recordExecution(
  admin: SupabaseClient | null,
  key: string,
  organizationId: string,
  result: unknown,
): Promise<void> {
  if (mem.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of mem) if (now - v.at >= IDEMPOTENCY_TTL_MS) mem.delete(k);
    if (mem.size >= MAX_ENTRIES) mem.clear();
  }
  mem.set(key, { key, result, at: Date.now() });

  if (admin) {
    try {
      await admin.from("meta_executions").upsert(
        { idempotency_key: key, organization_id: organizationId, result, created_at: new Date().toISOString() },
        { onConflict: "idempotency_key" },
      );
    } catch {
      // tabela ausente → memória já protege o caso comum
    }
  }
}

/** Reserva a chave ANTES de executar, para barrar corrida de duplo clique
 *  concorrente no mesmo processo. Retorna false se já reservada/executada. */
export function tryReserve(key: string): boolean {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.at < IDEMPOTENCY_TTL_MS) return false;
  mem.set(key, { key, result: { reserved: true }, at: Date.now() });
  return true;
}

/** Libera uma reserva que não chegou a virar execução (ex.: falhou antes do POST). */
export function releaseReservation(key: string): void {
  const hit = mem.get(key);
  if (hit && typeof hit.result === "object" && hit.result !== null && "reserved" in hit.result) {
    mem.delete(key);
  }
}

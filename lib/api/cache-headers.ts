/**
 * Cache-Control para respostas de LEITURA autenticadas (dado por org/usuário).
 *
 * Sempre `private`: só o navegador do próprio usuário reaproveita — nunca um
 * cache compartilhado (CDN/proxy), porque o payload é escopado por organização
 * e papel. Com TTL curto + stale-while-revalidate, o cliente reusa a última
 * resposta por alguns segundos e revalida em background, aliviando o backend
 * sem servir dado de um usuário para outro.
 *
 * Núcleo puro/determinístico: sem I/O, sem relógio, sem aleatoriedade. Recebe
 * os TTLs e devolve apenas o objeto de header — quem responde decide onde aplicar.
 */

export type CacheHeadersInput = {
  /** Tempo (segundos) que o cliente reusa a resposta sem revalidar. */
  maxAge: number;
  /**
   * Janela (segundos) em que uma resposta expirada ainda é servida enquanto
   * revalida em background. Opcional; 0/omitido = sem stale-while-revalidate.
   */
  swr?: number;
};

/** Normaliza para inteiro >= 0 (segundos). Valores inválidos viram 0. */
function toSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/**
 * Monta o header `Cache-Control` privado para uma resposta de sucesso de
 * leitura. Retorna sempre um objeto pronto para espalhar em `headers`.
 *
 * Exemplos:
 *   cacheHeaders({ maxAge: 60, swr: 120 })
 *     → { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" }
 *   cacheHeaders({ maxAge: 30 })
 *     → { "Cache-Control": "private, max-age=30" }
 *   cacheHeaders({ maxAge: 0 })
 *     → { "Cache-Control": "private, no-store" }  // sem TTL não faz cache
 */
export function cacheHeaders(input: CacheHeadersInput): { "Cache-Control": string } {
  const maxAge = toSeconds(input.maxAge);
  const swr = toSeconds(input.swr ?? 0);

  if (maxAge === 0) {
    // Sem TTL positivo não há o que cachear — mantém privado e sem store.
    return { "Cache-Control": "private, no-store" };
  }

  const parts = ["private", `max-age=${maxAge}`];
  if (swr > 0) parts.push(`stale-while-revalidate=${swr}`);
  return { "Cache-Control": parts.join(", ") };
}

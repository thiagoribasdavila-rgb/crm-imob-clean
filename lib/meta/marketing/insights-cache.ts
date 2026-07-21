/**
 * Cache TTL de leituras da Meta (performance + proteção de rate limit).
 *
 * O hub atualiza a cada 60s e cada tela paga 1–2 idas à Graph API (300–800ms
 * cada). Insights de campanha mudam devagar — cacheamos POR CHAVE (conta +
 * nível + período) com TTL de 5 min. Só resultados de SUCESSO entram no cache
 * (erro nunca é cacheado — a próxima tentativa vai à rede). O primeiro
 * chamador em voo segura os demais (dedupe de chamadas concorrentes).
 */

const globalCache = globalThis as typeof globalThis & {
  __atlasMetaInsightsCache?: Map<string, { at: number; data: unknown }>;
  __atlasMetaInsightsInflight?: Map<string, Promise<unknown>>;
};
const cache = globalCache.__atlasMetaInsightsCache ?? new Map<string, { at: number; data: unknown }>();
globalCache.__atlasMetaInsightsCache = cache;
const inflight = globalCache.__atlasMetaInsightsInflight ?? new Map<string, Promise<unknown>>();
globalCache.__atlasMetaInsightsInflight = inflight;

export const META_INSIGHTS_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 200;

/**
 * Executa `fn` com cache TTL. `isCacheable` decide o que pode ser guardado
 * (default: arrays — o shape de sucesso das leituras da Meta; MetaReadError
 * não é array e portanto nunca é cacheado).
 */
export async function cachedMetaRead<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { ttlMs?: number; isCacheable?: (value: T) => boolean } = {},
): Promise<T> {
  const ttl = opts.ttlMs ?? META_INSIGHTS_TTL_MS;
  const cacheable = opts.isCacheable ?? ((value: T) => Array.isArray(value));

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;

  // dedupe: se já há uma leitura idêntica em voo, aguarda a mesma promessa
  const flying = inflight.get(key);
  if (flying) return flying as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fn();
      if (cacheable(value)) {
        if (cache.size >= MAX_ENTRIES) {
          const now = Date.now();
          for (const [k, v] of cache) if (now - v.at >= ttl) cache.delete(k);
          if (cache.size >= MAX_ENTRIES) cache.clear();
        }
        cache.set(key, { at: Date.now(), data: value });
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/** Invalida tudo (ex.: após o executor criar/alterar campanha). */
export function invalidateMetaReads(): void {
  cache.clear();
}

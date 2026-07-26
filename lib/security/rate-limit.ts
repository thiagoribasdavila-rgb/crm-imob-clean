/**
 * TETO DE REQUISIÇÃO — algoritmo e armazenamento únicos do projeto.
 *
 * Este arquivo é a ÚNICA implementação de janela deslizante do Atlas.
 * `enforceRateLimit`, em `lib/api/security.ts`, é adaptador HTTP em cima daqui:
 * monta a chave, traduz o veredito em 429 e cabeçalhos. Não conta nada por conta
 * própria.
 *
 * ── POR QUE ISTO FOI UNIFICADO ──────────────────────────────────────────────
 *
 * Havia dois helpers com o mesmo papel e DOIS mapas independentes:
 * `checkRateLimit` (22 arquivos, sobretudo rotas de IA) e `enforceRateLimit`
 * (137 rotas). Duas consequências, ambas medidas:
 *
 * 1. Uma auditoria desta mesma entrega concluiu que "as rotas de IA não têm
 *    teto". Tinham — pelo outro helper. Duas formas de fazer a mesma coisa de
 *    segurança terminam com uma delas esquecida na hora de conferir.
 *
 * 2. Pior, e este é defeito de verdade: o mapa daqui era **local ao módulo**. O
 *    Next instancia o mesmo módulo em bundles distintos (rota, middleware,
 *    server action), e cada cópia ganhava um mapa zerado. O teto de 20/min das
 *    rotas de IA valia 20 POR BUNDLE. O outro helper já fixava o mapa em
 *    `globalThis` e não sofria disso.
 *
 * Unificar preservou o comportamento correto (mapa global) e as duas assinaturas
 * públicas, para não tocar nos 159 arquivos que chamam.
 *
 * ── O QUE ESTE TETO NÃO É ───────────────────────────────────────────────────
 *
 * Contagem em memória do processo. Com várias instâncias, cada uma tem a sua —
 * o teto efetivo é `limite × instâncias`. Serve para barrar laço de UI, clique
 * nervoso e varredura ingênua, que é o risco real aqui. Não substitui WAF nem
 * teto distribuído, e o dia em que o Atlas rodar com réplicas isto vira Redis.
 */

type Bucket = { count: number; resetAt: number };

/**
 * O mapa mora em `globalThis` sob a MESMA chave que `lib/api/security.ts` já
 * usava. Assim os dois caminhos contam no mesmo lugar, e o hot reload do dev não
 * zera o teto a cada salvamento — o que, em desenvolvimento, escondia justamente
 * os laços de UI que este módulo existe para pegar.
 */
const armazem = globalThis as typeof globalThis & {
  __atlasRateBuckets?: Map<string, Bucket>;
};
const buckets = armazem.__atlasRateBuckets ?? new Map<string, Bucket>();
armazem.__atlasRateBuckets = buckets;

const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Poda o mapa quando ele cresce demais. Primeiro descarta o que já expirou, que
 * é o caso comum; só se ainda estiver cheio derruba os mais antigos — cenário de
 * varredura com chave sempre nova, em que segurar tudo é que seria o problema.
 */
function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  const excedente = buckets.size - MAX_BUCKETS + Math.ceil(MAX_BUCKETS * 0.1);
  const antigos = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
  for (const [key] of antigos.slice(0, excedente)) buckets.delete(key);
}

/**
 * Conta uma requisição na chave e diz se ela passa.
 *
 * Conta SEMPRE, inclusive depois de estourado: quem insiste durante o bloqueio
 * não deve ver a janela reabrir antes da hora.
 */
export function checkRateLimit(
  key: string,
  options: { limit?: number; windowMs?: number } = {},
): RateLimitResult {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const now = Date.now();
  prune(now);

  const atual = buckets.get(key);
  const bucket = !atual || atual.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : atual;

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Chave por origem para quem tem `Request` cru (rotas de IA, handlers de borda).
 * O namespace separa os tetos: estourar a geração de texto não pode bloquear o
 * login do mesmo escritório.
 */
export function clientKey(request: Request, namespace: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return `${namespace}:${forwarded || realIp || "unknown"}`;
}

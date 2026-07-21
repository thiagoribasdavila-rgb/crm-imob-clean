/**
 * Cliente Graph resiliente da Meta (Marketing/Insights API) — o que separa uma
 * leitura de brinquedo de uma leitura de produção: paginação real via
 * paging.cursors.after, backoff exponencial com jitter determinístico em erros
 * transitórios/rate-limit, e falha rápida em erros de auth/permissão (retentar
 * não resolve token expirado nem falta de permissão).
 *
 * Puro e testável: o fetcher e o sleep são injetáveis; nenhuma dependência de
 * ambiente. O token vai só no header Authorization e é sanitizado de qualquer
 * mensagem de erro — NUNCA vaza no retorno.
 */

/** Erro estruturado de leitura da Graph — sem token, com família classificada. */
export type GraphReadError = {
  ok: false;
  code: number | string;
  subcode?: number | string;
  message: string;
  kind: "auth_expired" | "rate_limit" | "transient" | "permission" | "other";
};

/**
 * Classifica o erro da Graph em uma família acionável.
 * - 190/102, ou subcode 463/467 → auth_expired (token expirado/inválido)
 * - 4/17/32/613/80004 → rate_limit (limites de chamada/uso)
 * - 1/2/500 → transient (falha temporária do lado da Meta)
 * - 10/200/294 → permission (permissão/escopo insuficiente)
 * - resto → other
 * O subcode de sessão (463/467) tem prioridade: mesmo com outro code, é auth.
 */
export function classifyGraphError(err: {
  code?: number;
  error_subcode?: number;
  message?: string;
}): GraphReadError["kind"] {
  const sub = err.error_subcode;
  if (sub === 463 || sub === 467) return "auth_expired";
  const code = err.code;
  if (code === 190 || code === 102) return "auth_expired";
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80004) return "rate_limit";
  if (code === 1 || code === 2 || code === 500) return "transient";
  if (code === 10 || code === 200 || code === 294) return "permission";
  return "other";
}

type FbError = { code?: number; error_subcode?: number; message?: string };
type GraphPage<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
  error?: FbError;
};

/** Resultado de UMA página: linhas + cursor de continuação, ou erro estruturado. */
type PageResult<T> = { data: T[]; after?: string } | GraphReadError;

type GraphGetAllOpts = {
  fetcher?: typeof fetch;
  maxPages?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

/** Remove qualquer ocorrência do token da mensagem antes de expô-la. */
function sanitizeToken(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join("[REDACTED]");
}

/**
 * Atraso de backoff determinístico por tentativa: base 500ms dobrando por
 * tentativa (500, 1000, 2000, ...) + jitter determinístico limitado. O jitter
 * é sempre menor que o degrau exponencial, então a sequência é estritamente
 * crescente (sem thundering herd, mas testável).
 */
function backoffDelay(attempt: number): number {
  const base = 500 * 2 ** attempt;
  const jitter = ((attempt + 1) * 97) % 251;
  return base + jitter;
}

/** Anexa/atualiza o cursor `after` na URL preservando os demais parâmetros. */
function withAfter(url: string, after: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("after", after);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}after=${encodeURIComponent(after)}`;
  }
}

function isGraphError(x: unknown): x is GraphReadError {
  return typeof x === "object" && x !== null && (x as { ok?: boolean }).ok === false;
}

/**
 * Busca UMA página com resiliência: em rate_limit/transient faz backoff e
 * retenta (até `retries` vezes); em auth_expired/permission falha rápido (não
 * retenta). Erro de rede é tratado como transitório (retentável). Token nunca
 * aparece no erro.
 */
async function getPage<T>(
  url: string,
  token: string,
  fetcher: typeof fetch,
  retries: number,
  sleep: (ms: number) => Promise<void>,
): Promise<PageResult<T>> {
  let attempt = 0;
  for (;;) {
    let json: GraphPage<T>;
    try {
      const res = await fetcher(url, { headers: { Authorization: `Bearer ${token}` } });
      json = (await res.json().catch(() => ({}))) as GraphPage<T>;
      // HTTP de erro SEM envelope JSON (ex.: 500/HTML) não pode virar data:[]
      // (falso sucesso). res.ok === false (explícito) e sem error estruturado
      // = erro real. (=== false, não !res.ok, para mocks sem .ok seguirem ok.)
      if (res.ok === false && !(json && json.error)) {
        const kind = res.status >= 500 || res.status === 408 || res.status === 429 ? "transient" : "other";
        if (kind === "transient" && attempt < retries) {
          await sleep(backoffDelay(attempt));
          attempt += 1;
          continue;
        }
        return { ok: false, code: `http_${res.status}`, message: `HTTP ${res.status} sem corpo de erro da Graph`, kind };
      }
    } catch (err) {
      const message = sanitizeToken(err instanceof Error ? err.message : String(err), token);
      if (attempt < retries) {
        await sleep(backoffDelay(attempt));
        attempt += 1;
        continue;
      }
      return { ok: false, code: "network", message, kind: "transient" };
    }
    if (json && json.error) {
      const e = json.error;
      const kind = classifyGraphError(e);
      if ((kind === "rate_limit" || kind === "transient") && attempt < retries) {
        await sleep(backoffDelay(attempt));
        attempt += 1;
        continue;
      }
      return {
        ok: false,
        code: e.code ?? "?",
        subcode: e.error_subcode,
        message: sanitizeToken(String(e.message ?? "erro Meta"), token),
        kind,
      };
    }
    return { data: json.data ?? [], after: json.paging?.cursors?.after };
  }
}

/**
 * GET paginado e resiliente: segue paging.cursors.after até `maxPages` (default
 * 10), concatenando todos os data[]. Backoff exponencial (base 500ms, jitter
 * determinístico, `retries` default 3) em rate_limit/transient via `sleep`
 * injetável; auth_expired/permission falham rápido. Devolve a lista concatenada
 * ou o primeiro GraphReadError encontrado. O token vai só no header.
 */
export async function graphGetAll<T>(
  url: string,
  token: string,
  opts: GraphGetAllOpts = {},
): Promise<T[] | GraphReadError> {
  const fetcher = opts.fetcher ?? fetch;
  const maxPages = opts.maxPages ?? 10;
  const retries = opts.retries ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const out: T[] = [];
  let nextUrl: string | null = url;
  let pages = 0;

  while (nextUrl !== null && pages < maxPages) {
    const pageResult: PageResult<T> = await getPage<T>(nextUrl, token, fetcher, retries, sleep);
    if (isGraphError(pageResult)) return pageResult;
    for (const item of pageResult.data) out.push(item);
    pages += 1;
    nextUrl = pageResult.after ? withAfter(nextUrl, pageResult.after) : null;
  }
  return out;
}

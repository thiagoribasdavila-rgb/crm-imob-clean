/**
 * Ponto único de comunicação com a Graph API da Meta.
 *
 * Antes, a versão da API era declarada em 5+ lugares (`META_GRAPH_API_VERSION ||
 * "v23.0"`) e cada chamador interpretava erro do seu jeito (na maioria, só o
 * message — perdendo code/subcode/fbtrace_id, que é o que o suporte da Meta pede
 * e o que distingue token expirado de permissão faltando ou rate-limit).
 *
 * Este módulo centraliza: versão, montagem de URL e o parse do envelope de erro
 * padrão da Graph (`{ error: { message, type, code, error_subcode, fbtrace_id } }`)
 * num formato legível para logs e UI. Sem side effects; os chamadores continuam
 * donos de retry/timeout (resilientFetch) e de tokens via Authorization header —
 * nunca token em query string.
 */

const DEFAULT_GRAPH_VERSION = "v23.0";

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION;
}

/** URL da Graph API para um caminho já codificado (sem barra inicial). */
export function metaGraphUrl(path: string): string {
  return `https://graph.facebook.com/${metaGraphVersion()}/${path}`;
}

export type MetaGraphError = {
  message: string;
  type: string | null;
  code: number | null;
  subcode: number | null;
  fbtraceId: string | null;
};

type GraphErrorEnvelope = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

/** Extrai o erro estruturado do corpo de resposta da Graph (ou null se não houver). */
export function parseMetaGraphError(payload: unknown): MetaGraphError | null {
  const envelope = payload as GraphErrorEnvelope | null;
  const raw = envelope?.error;
  if (!raw || (!raw.message && raw.code === undefined)) return null;
  return {
    message: raw.message || "Erro não descrito pela Meta.",
    type: raw.type ?? null,
    code: raw.code ?? null,
    subcode: raw.error_subcode ?? null,
    fbtraceId: raw.fbtrace_id ?? null,
  };
}

/**
 * Mensagem legível e diagnosticável para logs/UI — inclui code/subcode/fbtrace
 * quando existem, e traduz os códigos mais comuns da operação Lead Ads/CAPI.
 */
export function describeMetaGraphFailure(status: number, payload: unknown): string {
  const parsed = parseMetaGraphError(payload);
  if (!parsed) return `Meta Graph HTTP ${status} (sem envelope de erro).`;
  const hints: Record<number, string> = {
    190: "token inválido ou expirado — renovar o access token",
    10: "permissão faltando no app/token",
    4: "rate limit do app atingido — reduzir frequência",
    17: "rate limit do usuário atingido",
    100: "parâmetro inválido ou objeto inexistente",
  };
  const hint = parsed.code !== null && hints[parsed.code] ? ` · ${hints[parsed.code]}` : "";
  const trace = parsed.fbtraceId ? ` · fbtrace ${parsed.fbtraceId}` : "";
  const codes = parsed.code !== null ? ` [code ${parsed.code}${parsed.subcode !== null ? `/${parsed.subcode}` : ""}]` : "";
  return `Meta Graph HTTP ${status}${codes}: ${parsed.message}${hint}${trace}`;
}

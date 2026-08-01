/**
 * Listagem dos formulários de lead (Lead Ads) de uma Página do Facebook.
 *
 * Read-only: GET /{page_id}/leadgen_forms com token de Página ou System User
 * (pages_manage_ads + leads_retrieval). Devolve id/nome/status e a contagem de
 * perguntas de cada formulário, seguindo a paginação por cursor até esgotar ou
 * um teto de segurança.
 *
 * Reusa o idioma do cliente de leitura (MetaReadError, classificação de erro,
 * versão da Graph por env), mas com fetcher INJETÁVEL — a rede sempre passa por
 * `opts.fetcher`, então o núcleo é testável sem tocar a Meta. O token nunca
 * viaja na URL (vai no header Authorization) e é higienizado de qualquer
 * mensagem de erro.
 */

import type { MetaReadError } from "./campaign-read";

const GRAPH = "https://graph.facebook.com";
const MAX_PAGES = 5;

export type LeadForm = { id: string; name: string; status: string; questionCount: number };

function version(v?: string): string {
  return v || process.env.META_GRAPH_API_VERSION || "v23.0";
}

/** Remove o token de qualquer texto — nunca vaza a credencial numa mensagem. */
function sanitize(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join("[token]");
}

type LeadgenResponse = {
  error?: { code?: number; error_subcode?: number; message?: string; fbtrace_id?: string };
  data?: Array<{ id?: string; name?: string; status?: string; questions?: unknown }>;
  paging?: { cursors?: { after?: string }; next?: string };
};

/**
 * Lista os formulários de lead da Página. Segue o cursor `after` até a Meta
 * parar de mandar `paging.next` ou até MAX_PAGES (teto de segurança). Erros
 * voltam estruturados (MetaReadError); 190/463 = token expirado, marcado na
 * mensagem como TOKEN_EXPIRADO.
 */
export async function fetchLeadForms(
  pageId: string,
  token: string,
  opts?: { fetcher?: typeof fetch; graphVersion?: string },
): Promise<LeadForm[] | MetaReadError> {
  const id = String(pageId ?? "").trim();
  if (!id) {
    return { ok: false, code: "invalid_request", message: "pageId obrigatório." };
  }
  const doFetch = opts?.fetcher ?? fetch;
  const v = version(opts?.graphVersion);
  const forms: LeadForm[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const qs = new URLSearchParams({ fields: "id,name,status,questions", limit: "100" });
    if (after) qs.set("after", after);

    let json: LeadgenResponse;
    try {
      const res = await doFetch(`${GRAPH}/${v}/${encodeURIComponent(id)}/leadgen_forms?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      json = (await res.json().catch(() => ({}))) as LeadgenResponse;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return { ok: false, code: "network", message: sanitize(raw, token) };
    }

    if (json.error) {
      const e = json.error;
      const expired = e.code === 190 || e.error_subcode === 463 || e.code === 463;
      const base = String(e.message ?? "erro Meta");
      return {
        ok: false,
        code: e.code ?? "?",
        subcode: e.error_subcode,
        message: sanitize(expired ? `TOKEN_EXPIRADO: ${base}` : base, token),
        fbtrace: e.fbtrace_id,
      };
    }

    for (const f of json.data ?? []) {
      forms.push({
        id: String(f.id ?? ""),
        name: String(f.name ?? ""),
        status: String(f.status ?? ""),
        questionCount: Array.isArray(f.questions) ? f.questions.length : 0,
      });
    }

    // Só continua se a Meta anunciar próxima página E devolver o cursor.
    if (!json.paging?.next) break;
    const next = json.paging?.cursors?.after;
    if (!next) break;
    after = next;
  }

  return forms;
}

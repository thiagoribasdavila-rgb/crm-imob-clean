import "server-only";

/**
 * Paginação exaustiva contra o max-rows do PostgREST (1000 no Supabase).
 *
 * Um `.limit(20000)` é letra morta: o servidor corta a resposta em 1000
 * linhas SEM erro, e agregados calculados sobre a amostra truncada saem
 * errados em silêncio (lição F1 desta base — ver attention-signals e
 * capi-feedback, que carregam variantes locais deste mesmo padrão).
 *
 * Este é o helper canônico para rotas de agregação: devolve as linhas, o
 * primeiro erro encontrado (para o chamador decidir 503 vs degradação) e a
 * flag honesta de truncamento quando o teto de páginas é atingido.
 */
export type PagedRows<T> = {
  rows: T[];
  error: { code?: string; message?: string } | null;
  truncated: boolean;
};

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  options: { maxPages?: number } = {},
): Promise<PagedRows<T>> {
  const maxPages = options.maxPages ?? 30;
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error, truncated: false };
    if (!data?.length) return { rows, error: null, truncated: false };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { rows, error: null, truncated: false };
  }
  return { rows, error: null, truncated: true };
}

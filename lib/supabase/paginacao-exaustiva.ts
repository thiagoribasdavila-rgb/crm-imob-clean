/**
 * ── PAGINAÇÃO EXAUSTIVA CONTRA O max-rows DO POSTGREST — módulo PURO ────────
 *
 * Esta função morava inteira em `lib/supabase/fetch-all-rows.ts`, que importa
 * `server-only`. Consequência medida: NENHUMA tela de cliente conseguia
 * carregá-la, e as telas de cliente foram as que ficaram com `.limit(5000)`.
 *
 * `app/(crm)/reports/page.tsx` é a tela canônica de relatório do diretor. Ela
 * pedia `.limit(5000)` sem paginação e SEM NENHUMA sentinela — enquanto o
 * próprio repositório já documentava, em
 * `app/api/v1/analytics/sala-de-comando/route.ts`, que o PostgREST corta em
 * 1000 SEM erro. São 490 leads hoje: o número coincide, o relatório fecha, e
 * ninguém percebe. No dia em que a operação passar de 1000, TODO agregado da
 * tela (funil, conversão, VGV, origem) passa a ser calculado sobre as 1000
 * primeiras linhas e a tela continua verde.
 *
 * Separar daqui não é organização: é o que torna a regra alcançável por quem
 * precisa dela. `fetch-all-rows.ts` reexporta, então nenhum chamador de
 * servidor muda.
 *
 * `truncated` é a parte que não pode ser opcional. Um agregado sobre amostra
 * cortada não é "quase certo": é errado, e errado em silêncio. Quem chama
 * precisa poder DIZER na tela que o número está cortado — que é a diferença
 * entre um relatório e um chute bem formatado.
 */
export type PagedRows<T> = {
  rows: T[];
  error: { code?: string; message?: string } | null;
  truncated: boolean;
};

/** Teto de linhas por resposta do PostgREST no Supabase (`db-max-rows`). */
export const PAGE_SIZE = 1000;

/** Teto de páginas padrão: 30 × 1000 = 30.000 linhas antes de declarar corte. */
export const DEFAULT_MAX_PAGES = 30;

export async function fetchAllRowsPure<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
  options: { maxPages?: number } = {},
): Promise<PagedRows<T>> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
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

/**
 * A frase que a tela mostra quando o corte aconteceu.
 *
 * Existe aqui, e não no JSX, porque a mesma tela tem quatro blocos de números
 * derivados da mesma leitura: o aviso precisa ser UM texto, com o total que de
 * fato entrou na conta, e não quatro redações que podem discordar.
 */
export function avisoDeTruncamento(linhas: number): string {
  return `Relatório calculado sobre as primeiras ${linhas.toLocaleString("pt-BR")} leads: a leitura atingiu o teto de páginas e foi CORTADA. `
    + "Os números abaixo são de uma amostra, não da base inteira — não decida verba com eles até o corte ser resolvido.";
}

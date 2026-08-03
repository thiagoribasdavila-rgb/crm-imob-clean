/**
 * A PÁGINA DA ORGANIZAÇÃO VEM DO BANCO, NÃO DA VARIÁVEL DE AMBIENTE.
 *
 * ── O defeito que este módulo existe para tornar impossível ────────────────
 *
 * `/api/v1/marketing/held-leads` lia `process.env.META_PAGE_ID` e, sem ela,
 * respondia **200 OK com `totalRepresado: 0`**. Medido em 03/08/2026: a
 * variável NÃO existe no ambiente do servidor, e havia 103 leads pagas paradas
 * na Meta. O diretor via zero. Sem erro, sem alerta, sem nada para clicar — o
 * pior desfecho possível, porque um zero silencioso não pede investigação.
 *
 * E o ID estava a uma consulta de distância: `meta_lead_sources.page_id`, na
 * mesma tabela que a rota já lia para outra coluna. A configuração da operação
 * é a fonte da verdade; a variável de ambiente é compatibilidade.
 *
 * ── Por que "a Página com mais fontes ativas", e não a primeira ────────────
 *
 * Uma organização pode ter mais de uma Página registrada — inclusive uma
 * cadastrada por engano. Escolher a primeira por ordem de inserção elegeria a
 * errada em silêncio. A que tem mais fontes ATIVAS é a que a operação de fato
 * atende, e `ambigua` avisa quando a escolha não foi óbvia, para quem chama
 * poder dizer isso na tela em vez de fingir certeza.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PaginaDaOrganizacao = {
  /** `null` quando a organização não tem nenhuma fonte Meta registrada. */
  pageId: string | null;
  /** Quantas Páginas distintas existem — >1 significa que houve escolha. */
  paginasDistintas: number;
  /** Verdadeiro quando havia mais de uma candidata e uma foi eleita. */
  ambigua: boolean;
  fontesAtivas: number;
  fontesTotais: number;
};

const VAZIO: PaginaDaOrganizacao = {
  pageId: null,
  paginasDistintas: 0,
  ambigua: false,
  fontesAtivas: 0,
  fontesTotais: 0,
};

/**
 * Elege a Página a partir das fontes registradas. Pura na decisão, para poder
 * ser testada sem banco: recebe as linhas, devolve o veredito.
 */
export function elegerPagina(
  linhas: Array<{ page_id: string | null; active?: boolean | null }>,
): PaginaDaOrganizacao {
  const porPagina = new Map<string, { ativas: number; totais: number }>();
  for (const linha of linhas) {
    const pagina = String(linha.page_id ?? "").trim();
    if (!pagina) continue;
    const atual = porPagina.get(pagina) ?? { ativas: 0, totais: 0 };
    atual.totais += 1;
    if (linha.active) atual.ativas += 1;
    porPagina.set(pagina, atual);
  }

  if (!porPagina.size) return VAZIO;

  // Desempate declarado e estável: mais ativas, depois mais totais, depois o id
  // em ordem. Sem o terceiro critério a escolha mudaria entre execuções com o
  // mesmo dado — e um valor que oscila é pior que um valor errado, porque não
  // dá para reproduzir.
  const eleita = [...porPagina.entries()].sort(
    (a, b) => b[1].ativas - a[1].ativas || b[1].totais - a[1].totais || a[0].localeCompare(b[0]),
  )[0];

  return {
    pageId: eleita[0],
    paginasDistintas: porPagina.size,
    ambigua: porPagina.size > 1,
    fontesAtivas: eleita[1].ativas,
    fontesTotais: eleita[1].totais,
  };
}

/**
 * Lê as fontes da organização e elege a Página.
 *
 * Erro de consulta devolve o vazio — e quem chama precisa tratar `pageId: null`
 * como "não sei", nunca como "não tem". A diferença é o que separa este módulo
 * do defeito que ele corrige.
 */
export async function paginaDaOrganizacao(
  admin: SupabaseClient,
  organizationId: string,
): Promise<PaginaDaOrganizacao> {
  const { data, error } = await admin
    .from("meta_lead_sources")
    .select("page_id,active")
    .eq("organization_id", organizationId)
    .limit(1000);

  if (error || !data) return VAZIO;
  return elegerPagina(data as Array<{ page_id: string | null; active: boolean | null }>);
}

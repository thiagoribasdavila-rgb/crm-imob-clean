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
 * TODAS as Páginas com pelo menos uma fonte ATIVA.
 *
 * ── Por que esta função existe ao lado de `elegerPagina` ──────────────────
 *
 * De manhã, 03/08/2026, `elegerPagina` consertou a represa: ela lia a Página de
 * uma variável de ambiente ausente e devolvia zero com 103 leads esperando.
 * À tarde, conectada a Página da Inside, o produto passou a ter DUAS — e a
 * represa devolveu zero de novo, agora com 198 leads esperando lá.
 *
 * A rota SABIA que havia duas: respondia `paginasRegistradas: 2, ambigua: true`.
 * Eu tinha construído o aviso e não a cobertura. Marcar "houve escolha" é
 * inútil quando a escolha não devia existir — represa não é uma pergunta sobre
 * UMA Página, é sobre tudo que a operação paga e não recebe.
 *
 * As duas convivem porque respondem perguntas diferentes:
 *   · `elegerPagina`   → "qual Página preencho neste campo?" (uma, com aviso)
 *   · `paginasRegistradas` → "de onde pode estar entrando lead?" (todas)
 *
 * Só ATIVAS: consultar a Graph por uma Página cujas fontes a operação desligou
 * gasta cota e não muda decisão nenhuma — fonte inativa descarta a lead de
 * qualquer jeito.
 */
export function paginasRegistradas(
  linhas: Array<{ page_id: string | null; active?: boolean | null }>,
): Array<{ pageId: string; fontesAtivas: number; fontesTotais: number }> {
  const porPagina = new Map<string, { ativas: number; totais: number }>();
  for (const linha of linhas) {
    const pagina = String(linha.page_id ?? "").trim();
    if (!pagina) continue;
    const atual = porPagina.get(pagina) ?? { ativas: 0, totais: 0 };
    atual.totais += 1;
    if (linha.active) atual.ativas += 1;
    porPagina.set(pagina, atual);
  }

  return [...porPagina.entries()]
    .filter(([, v]) => v.ativas > 0)
    .sort((a, b) => b[1].ativas - a[1].ativas || a[0].localeCompare(b[0]))
    .map(([pageId, v]) => ({ pageId, fontesAtivas: v.ativas, fontesTotais: v.totais }));
}

/**
 * Lê as fontes da organização e devolve TODAS as Páginas com fonte ativa.
 *
 * Erro de consulta devolve lista vazia — e quem chama precisa saber distinguir
 * isso de "não há Página". Por isso devolve também `falhou`: vazio com
 * `falhou: true` é "não consegui olhar", e nunca pode virar zero na tela.
 */
export async function paginasDaOrganizacao(
  admin: SupabaseClient,
  organizationId: string,
): Promise<{ paginas: Array<{ pageId: string; fontesAtivas: number; fontesTotais: number }>; falhou: boolean }> {
  const { data, error } = await admin
    .from("meta_lead_sources")
    .select("page_id,active")
    .eq("organization_id", organizationId)
    .limit(1000);

  if (error || !data) return { paginas: [], falhou: true };
  return { paginas: paginasRegistradas(data as Array<{ page_id: string | null; active: boolean | null }>), falhou: false };
}

/**
 * Lê as fontes da organização e elege UMA Página.
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

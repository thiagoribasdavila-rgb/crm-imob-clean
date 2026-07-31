/**
 * AS REGRAS DO INVESTIMENTO DE MÍDIA, SEM BANCO E SEM REDE.
 *
 * Este arquivo existe separado de `importa-investimento.ts` por um motivo
 * prático: aquele importa `server-only` e o cliente do Supabase, e um contrato
 * que precise carregá-lo arrastaria meio produto junto — o que na prática faz o
 * contrato não ser escrito. Aqui não há import nenhum, então a regra pode ser
 * exercitada de verdade, e não por leitura de código.
 *
 * A distinção importa neste repositório: um `check-meta-forecast` já ficou verde
 * durante semanas provando que uma função EXISTIA, enquanto nenhum consumidor a
 * chamava. Contrato que não executa é conforto, não prova.
 */

/** Uma linha de gasto como a Meta devolve, já normalizada por dia. */
export type LinhaDaMeta = {
  date: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
};

/** Uma linha de `marketing_spend`, pronta para gravar. */
export type LinhaDeInvestimento = {
  organization_id: string;
  campaign_id: string;
  spend_date: string;
  amount: number;
  impressions: number | null;
  clicks: number | null;
};

/**
 * A plataforma é gravada em MAIÚSCULAS porque é assim que a linha que já existe
 * em `marketing_campaigns` está gravada (`platform = 'META'`, registrada pelo
 * caminho de atribuição em 26/07). O índice único do banco é
 * (organization_id, platform, external_campaign_id) — gravar `'meta'` criaria
 * uma SEGUNDA campanha para o mesmo anúncio, e o gasto se dividiria entre as
 * duas sem que tela nenhuma acusasse erro.
 *
 * É a doença desta base: duas verdades para o mesmo fato. Aqui ela é evitada por
 * uma constante e um contrato que a compara com o valor real do banco.
 */
export const PLATAFORMA_META = "META";

/** Prefixo que o caminho de atribuição usa quando só conhece o id externo. */
export const PREFIXO_NOME_PROVISORIO = "[auto]";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Agrupa as linhas da Meta por (campanha, dia).
 *
 * A Meta normalmente devolve uma linha por combinação, mas a paginação por
 * cursor pode repetir a linha de borda quando a conta recebe dado novo durante a
 * leitura. Somar cegamente dobraria o gasto daquele dia; descartar a repetição
 * poderia perder a versão mais recente. Substituir pela última leitura resolve
 * os dois casos.
 */
export function agrupaInvestimentoPorDia(linhas: LinhaDaMeta[]): LinhaDaMeta[] {
  const porChave = new Map<string, LinhaDaMeta>();
  for (const linha of linhas) {
    if (!linha?.campaignId || !DATA_ISO.test(String(linha.date))) continue;
    porChave.set(`${linha.campaignId}|${linha.date}`, {
      ...linha,
      spend: Number.isFinite(linha.spend) ? linha.spend : 0,
      impressions: Number.isFinite(linha.impressions) ? linha.impressions : 0,
      clicks: Number.isFinite(linha.clicks) ? linha.clicks : 0,
    });
  }
  return [...porChave.values()].sort((a, b) => (a.date === b.date ? a.campaignId.localeCompare(b.campaignId) : a.date.localeCompare(b.date)));
}

/**
 * Converte linhas da Meta em linhas de `marketing_spend`, resolvendo o id
 * externo da campanha para o uuid interno.
 *
 * Linha cuja campanha não está no mapa é DESCARTADA e contada, nunca gravada com
 * campanha nula: a coluna é `not null` e tem chave estrangeira composta com a
 * organização. Gasto sem campanha seria dinheiro sem dono — exatamente o que
 * este código existe para acabar.
 */
export function linhasParaGravar(
  organizationId: string,
  linhas: LinhaDaMeta[],
  campanhaPorExterno: Map<string, string>,
): { gravar: LinhaDeInvestimento[]; semCampanha: string[] } {
  const gravar: LinhaDeInvestimento[] = [];
  const semCampanha: string[] = [];
  for (const linha of linhas) {
    const campaignId = campanhaPorExterno.get(linha.campaignId);
    if (!campaignId) {
      if (!semCampanha.includes(linha.campaignId)) semCampanha.push(linha.campaignId);
      continue;
    }
    gravar.push({
      organization_id: organizationId,
      campaign_id: campaignId,
      spend_date: linha.date,
      // Gasto é dinheiro: arredondar para centavos aqui evita que a soma de 30
      // dias carregue resíduo binário de 30 casas decimais diferentes.
      amount: Math.round(linha.spend * 100) / 100,
      impressions: Math.round(linha.impressions),
      clicks: Math.round(linha.clicks),
    });
  }
  return { gravar, semCampanha };
}

/**
 * Decide se o nome vindo da Meta deve substituir o nome guardado.
 *
 * Substitui só o nome PROVISÓRIO (`[auto] …`), que o caminho de atribuição grava
 * quando conhece apenas o id externo — o próprio texto dele diz "nome real só a
 * Meta tem", e agora a Meta contou. Nome digitado por gente nunca é
 * sobrescrito: quem renomeou a campanha na tela tinha um motivo, e o importador
 * não é dono dessa decisão.
 */
export function deveAtualizarNome(nomeGuardado: string | null | undefined, nomeDaMeta: string): boolean {
  if (!nomeDaMeta || !nomeDaMeta.trim()) return false;
  const atual = (nomeGuardado || "").trim();
  if (!atual) return true;
  if (atual === nomeDaMeta.trim()) return false;
  return atual.startsWith(PREFIXO_NOME_PROVISORIO);
}

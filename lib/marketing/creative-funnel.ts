/**
 * FUNIL REAL DE CADA CRIATIVO.
 *
 * A pergunta que uma agência precisa responder e nenhuma ferramenta externa
 * consegue: **qual peça traz lead que a operação fecha.**
 *
 * A Meta sabe CTR, custo por clique e frequência. Ela não sabe se a lead foi
 * atendida, se visitou, se recebeu proposta ou se comprou — isso está no CRM. E
 * CTR alto com lead que não fecha é criativo ruim vestido de bom: gasta verba,
 * enche a fila e não vira venda.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────────
 *
 * Não afirma causa. Um criativo com conversão alta pode estar rodando para um
 * público melhor, num empreendimento mais barato, numa semana de feirão. O
 * módulo entrega a MEDIÇÃO e a amostra; a leitura é de quem decide, e a
 * governança de criativo do produto já proíbe alegação causal explicitamente.
 *
 * Não recomenda pausar nada sozinho. Verba é irreversível dentro do dia.
 *
 * ── A REGRA DA AMOSTRA ──────────────────────────────────────────────────────
 *
 * Abaixo de `AMOSTRA_MINIMA` leads, a peça aparece com os números crus e SEM
 * classificação. Três leads e uma venda dão 33% de conversão, que é ruído com
 * cara de descoberta — e decisão de verba tomada em cima disso é o jeito mais
 * caro de aprender estatística.
 */

/** Abaixo disso não se classifica peça. A governança do produto já usa 30. */
export const AMOSTRA_MINIMA = 30;

export type LeadDoCriativo = {
  /** Houve primeiro contato registrado? */
  contatada: boolean;
  /** Passou do estágio de qualificação? */
  qualificada: boolean;
  visitou: boolean;
  recebeuProposta: boolean;
  comprou: boolean;
};

export type CriativoMedido = {
  versionId: string;
  nome: string;
  adId: string | null;
  empreendimento: string | null;
  formato: string;
  angulo: string;
  /** Situação da revisão da diretoria. */
  revisao: string;
};

export type LinhaDoFunil = CriativoMedido & {
  leads: number;
  contatadas: number;
  qualificadas: number;
  visitas: number;
  propostas: number;
  vendas: number;
  /**
   * Fração de 0 a 1, ou `null` quando não houve lead. Zero leads não é 0% de
   * conversão — é ausência de medição, e a diferença decide se a peça é ruim ou
   * apenas nova.
   */
  taxaDeAtendimento: number | null;
  taxaDeVisita: number | null;
  taxaDeVenda: number | null;
  /** `null` até a peça atingir a amostra mínima. */
  classificacao: "ganhando" | "aprendendo" | "perdendo" | null;
  /** Por que a peça está sem classificação, quando está. */
  semClassificacao: string | null;
};

export type VereditoCriativo = {
  linhas: LinhaDoFunil[];
  total: {
    criativos: number;
    comAmostra: number;
    leads: number;
    /** Leads que chegaram sem nenhum anúncio identificado. */
    leadsSemCriativo: number;
  };
  /** O que não pôde ser medido, dito com a razão. */
  naoMedido: string[];
  resumo: string;
  executaSozinho: false;
};

const fracao = (parte: number, todo: number) => (todo > 0 ? parte / todo : null);

/**
 * Classifica a peça pelo funil de BAIXO, não pelo topo.
 *
 * A ordem das perguntas é deliberada: venda primeiro, depois visita, e
 * atendimento por último. Uma peça cujo lead ninguém atendeu não é uma peça
 * ruim — é uma operação parada, e culpar o criativo por isso faria trocar a
 * peça certa pelo motivo errado.
 */
function classificar(linha: {
  leads: number;
  contatadas: number;
  visitas: number;
  vendas: number;
  medianaDaBase: { visita: number | null; venda: number | null };
}): { classificacao: LinhaDoFunil["classificacao"]; semClassificacao: string | null } {
  if (linha.leads < AMOSTRA_MINIMA) {
    return {
      classificacao: null,
      semClassificacao: `${linha.leads} de ${AMOSTRA_MINIMA} leads — amostra insuficiente para classificar`,
    };
  }
  if (linha.contatadas === 0) {
    return {
      classificacao: null,
      semClassificacao: "nenhuma lead desta peça foi atendida — o funil abaixo não pode ser julgado",
    };
  }

  const taxaDeVenda = fracao(linha.vendas, linha.leads);
  const taxaDeVisita = fracao(linha.visitas, linha.leads);
  const { visita, venda } = linha.medianaDaBase;

  if (venda !== null && taxaDeVenda !== null) {
    if (taxaDeVenda > venda) return { classificacao: "ganhando", semClassificacao: null };
    if (taxaDeVenda < venda) return { classificacao: "perdendo", semClassificacao: null };
  }
  if (visita !== null && taxaDeVisita !== null) {
    if (taxaDeVisita > visita) return { classificacao: "ganhando", semClassificacao: null };
    if (taxaDeVisita < visita) return { classificacao: "perdendo", semClassificacao: null };
  }
  return { classificacao: "aprendendo", semClassificacao: null };
}

/** Mediana de uma lista, ou null quando não há amostra. */
function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

export function medirFunilDosCriativos(entrada: {
  criativos: CriativoMedido[];
  /** Leads agrupadas pelo `ad_id` do anúncio. */
  leadsPorAnuncio: Map<string, LeadDoCriativo[]>;
  /** Leads que não trazem anúncio nenhum. */
  leadsSemCriativo: number;
}): VereditoCriativo {
  const brutas = entrada.criativos.map((criativo) => {
    const leads = criativo.adId ? entrada.leadsPorAnuncio.get(criativo.adId) ?? [] : [];
    return {
      criativo,
      leads: leads.length,
      contatadas: leads.filter((l) => l.contatada).length,
      qualificadas: leads.filter((l) => l.qualificada).length,
      visitas: leads.filter((l) => l.visitou).length,
      propostas: leads.filter((l) => l.recebeuProposta).length,
      vendas: leads.filter((l) => l.comprou).length,
    };
  });

  // A referência é a MEDIANA das peças com amostra, não uma meta inventada.
  // Comparar contra um número escolhido a dedo faria toda a carteira parecer
  // ruim (ou boa) conforme o humor de quem escolheu.
  const comAmostra = brutas.filter((b) => b.leads >= AMOSTRA_MINIMA);
  const medianaDaBase = {
    visita: mediana(comAmostra.map((b) => b.visitas / b.leads)),
    venda: mediana(comAmostra.map((b) => b.vendas / b.leads)),
  };

  const linhas: LinhaDoFunil[] = brutas.map((b) => {
    const { classificacao, semClassificacao } = classificar({ ...b, medianaDaBase });
    return {
      ...b.criativo,
      leads: b.leads,
      contatadas: b.contatadas,
      qualificadas: b.qualificadas,
      visitas: b.visitas,
      propostas: b.propostas,
      vendas: b.vendas,
      taxaDeAtendimento: fracao(b.contatadas, b.leads),
      taxaDeVisita: fracao(b.visitas, b.leads),
      taxaDeVenda: fracao(b.vendas, b.leads),
      classificacao,
      semClassificacao,
    };
  });

  linhas.sort((a, b) => b.leads - a.leads || a.nome.localeCompare(b.nome));

  const totalDeLeads = brutas.reduce((soma, b) => soma + b.leads, 0);
  const semAnuncio = linhas.filter((l) => !l.adId).length;
  const totalContatadas = brutas.reduce((soma, b) => soma + b.contatadas, 0);

  const naoMedido: string[] = [];
  if (semAnuncio > 0) {
    naoMedido.push(
      `${semAnuncio} criativo(s) sem anúncio vinculado. Sem o id do anúncio não há como saber que lead veio de qual peça — informe o anúncio na ficha do criativo.`,
    );
  }
  if (entrada.leadsSemCriativo > 0) {
    naoMedido.push(
      `${entrada.leadsSemCriativo} lead(s) chegaram sem anúncio identificado e ficam fora desta conta. Elas existem e contam no total da operação; só não dá para creditá-las a nenhuma peça.`,
    );
  }
  if (comAmostra.length === 0 && totalDeLeads > 0) {
    naoMedido.push(
      `Nenhuma peça atingiu ${AMOSTRA_MINIMA} leads. Os números aparecem crus, sem classificação — abaixo dessa amostra a taxa é ruído com cara de descoberta.`,
    );
  }
  if (totalDeLeads > 0 && totalContatadas === 0) {
    naoMedido.push(
      "Nenhuma lead vinda de anúncio foi atendida. Enquanto isso durar, o funil abaixo do primeiro contato não mede criativo — mede a operação parada.",
    );
  }

  const resumo = totalDeLeads === 0
    ? "Nenhuma lead vinculada a criativo no período."
    : totalContatadas === 0
      ? `${totalDeLeads} lead(s) de ${linhas.filter((l) => l.leads > 0).length} peça(s), nenhuma atendida — o gargalo não é o criativo.`
      : `${totalDeLeads} lead(s) de ${linhas.filter((l) => l.leads > 0).length} peça(s), ${comAmostra.length} com amostra para classificar.`;

  return {
    linhas,
    total: {
      criativos: linhas.length,
      comAmostra: comAmostra.length,
      leads: totalDeLeads,
      leadsSemCriativo: entrada.leadsSemCriativo,
    },
    naoMedido,
    resumo,
    executaSozinho: false,
  };
}

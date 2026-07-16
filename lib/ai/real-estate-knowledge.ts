export type MarketSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  verifiedAt: string;
  facts: string[];
  useFor: string[];
};

export const REAL_ESTATE_MARKET_SOURCES: MarketSource[] = [
  {
    id: "bcb-selic-2026-06",
    title: "279ª reunião do Copom",
    publisher: "Banco Central do Brasil",
    url: "https://www.bcb.gov.br/controleinflacao/comunicadoscopom",
    verifiedAt: "2026-07-16",
    facts: [
      "A meta Selic foi reduzida para 14,25% ao ano em 17/06/2026.",
      "O Copom manteve sinalização de cautela diante da inflação e da incerteza externa.",
    ],
    useFor: ["crédito imobiliário", "capacidade de compra", "cenário macroeconômico"],
  },
  {
    id: "ibge-sinapi-2026-06",
    title: "SINAPI - junho de 2026",
    publisher: "IBGE",
    url: "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/47537-indice-nacional-da-construcao-civil-acelera-para-1-19-em-junho",
    verifiedAt: "2026-07-16",
    facts: [
      "O custo nacional da construção variou 1,19% em junho de 2026.",
      "O acumulado em 12 meses foi de 7,26% e o custo nacional atingiu R$ 1.976,37 por m².",
      "Materiais acumularam 5,54% e mão de obra 9,59% em 12 meses.",
    ],
    useFor: ["custos", "precificação", "margem", "reajuste de tabela"],
  },
  {
    id: "mcmv-portaria-333-2026",
    title: "Faixas do Minha Casa, Minha Vida",
    publisher: "Ministério das Cidades",
    url: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/sobre-o-minha-casa-minha-vida-1",
    verifiedAt: "2026-07-16",
    facts: [
      "Faixa 1 urbana: renda familiar mensal de até R$ 3.200.",
      "Faixa 2: de R$ 3.200,01 a R$ 5.000; Faixa 3: de R$ 5.000,01 a R$ 9.600.",
      "A Faixa 4 atende renda mensal de até R$ 13.000.",
    ],
    useFor: ["enquadramento inicial", "segmentação de leads", "produto econômico"],
  },
  {
    id: "mcmv-financiamento-2026",
    title: "Minha Casa, Minha Vida - linha financiada",
    publisher: "Ministério das Cidades",
    url: "https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/mcmv-fgts",
    verifiedAt: "2026-07-16",
    facts: [
      "O prazo máximo informado para os financiamentos é de 35 anos.",
      "Taxas, limites de imóvel e subsídios variam conforme renda, região e condição de cotista do FGTS.",
      "A aprovação final depende da análise do agente financeiro.",
    ],
    useFor: ["simulação preliminar", "objeção de entrada", "qualificação financeira"],
  },
  {
    id: "cbic-iin-2026-q1",
    title: "Indicadores Imobiliários Nacionais - 1º trimestre de 2026",
    publisher: "CBIC",
    url: "https://cbic.org.br/cbic-divulga-indicadores-imobiliarios-nacionais-do-1o-trimestre-de-2026/",
    verifiedAt: "2026-07-16",
    facts: [
      "A pesquisa nacional acompanha lançamentos, vendas, oferta final, preços e participação do MCMV.",
      "Indicadores nacionais devem ser usados como referência de cenário, não como substitutos dos dados locais do empreendimento.",
    ],
    useFor: ["benchmark", "velocidade de vendas", "oferta e demanda"],
  },
];

export const REAL_ESTATE_OPERATING_PLAYBOOK = [
  "Lead sem próxima ação deve ser tratado como risco operacional, não como lead perdido.",
  "Priorização comercial combina intenção, aderência financeira, recência, resposta e disponibilidade real de produto.",
  "Nunca prometa unidade, preço, subsídio, taxa ou aprovação de crédito sem validar estoque, tabela vigente e agente financeiro.",
  "Na comparação de unidades, explicite área, tipologia, andar, posição, vaga, preço, fluxo e status de disponibilidade.",
  "Para gestores, diferencie volume, conversão, velocidade, aging, SLA, forecast e qualidade da carteira.",
  "Para corretores, responda com uma próxima ação executável, argumento de atendimento e dado que ainda precisa ser confirmado.",
  "Recomendação de preço ou investimento deve separar dado interno, referência externa, hipótese e risco.",
  "Dados pessoais de leads não devem aparecer em respostas agregadas nem ser enviados sem necessidade.",
];

export function marketKnowledgeForPrompt() {
  return REAL_ESTATE_MARKET_SOURCES.map((source) => [
    `[${source.id}] ${source.publisher} - ${source.title}`,
    `Verificado em ${source.verifiedAt}.`,
    ...source.facts.map((fact) => `- ${fact}`),
    `URL: ${source.url}`,
  ].join("\n")).join("\n\n");
}

export function relevantMarketSources(question: string) {
  const terms = question.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
  const ranked = REAL_ESTATE_MARKET_SOURCES.map((source) => ({
    source,
    score: terms.filter((term) => `${source.title} ${source.useFor.join(" ")} ${source.facts.join(" ")}`.toLowerCase().includes(term)).length,
  })).sort((a, b) => b.score - a.score);
  const selected = ranked.filter((item) => item.score > 0).slice(0, 3).map((item) => item.source);
  return selected.length ? selected : REAL_ESTATE_MARKET_SOURCES.slice(0, 3);
}

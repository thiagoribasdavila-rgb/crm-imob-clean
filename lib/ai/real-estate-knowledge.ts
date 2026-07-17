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
  {
    id: "fipezap-methodology-2026",
    title: "Índice FipeZAP e metodologia",
    publisher: "Fundação Instituto de Pesquisas Econômicas - Fipe",
    url: "https://www.fipe.org.br/pt-br/indices/fipezap/",
    verifiedAt: "2026-07-17",
    facts: [
      "O índice acompanha preços anunciados de venda e locação, e não preços finais de escrituras ou contratos.",
      "As séries residenciais cobrem apartamentos prontos em cidades selecionadas e podem apoiar comparação regional e tendência.",
    ],
    useFor: ["preço anunciado", "tendência regional", "benchmark", "liquidez", "concorrência"],
  },
  {
    id: "ibge-pnad-regional-2026-q1",
    title: "PNAD Contínua Trimestral - 1º trimestre de 2026",
    publisher: "IBGE",
    url: "https://agenciadenoticias.ibge.gov.br/agencia-sala-de-imprensa/2013-agencia-de-noticias/releases/46676-pnad-continua-trimestral-desocupacao-sobe-em-15-das-27-ufs-no-1-trimestre-de-2026",
    verifiedAt: "2026-07-17",
    facts: [
      "A PNAD permite acompanhar desocupação, subutilização e diferenças entre unidades da federação.",
      "Renda e emprego regionais são contexto de capacidade de compra, mas não substituem a qualificação financeira individual nem a análise de crédito.",
    ],
    useFor: ["renda regional", "emprego", "capacidade de compra", "risco macroeconômico"],
  },
  {
    id: "bcb-credit-statistics-2026-06",
    title: "Estatísticas monetárias e de crédito - junho de 2026",
    publisher: "Banco Central do Brasil",
    url: "https://www.bcb.gov.br/content/estatisticas/hist_estatisticasmonetariascredito/202606_Texto_de_estatisticas_monetarias_e_de_credito.pdf",
    verifiedAt: "2026-07-17",
    facts: [
      "As estatísticas do Banco Central acompanham saldos e condições agregadas de crédito, incluindo financiamento imobiliário.",
      "Crédito agregado ajuda a interpretar o cenário, mas taxa e aprovação de uma pessoa dependem do agente financeiro e do perfil individual.",
    ],
    useFor: ["crédito imobiliário", "funding", "capacidade de compra", "cenário financeiro"],
  },
  {
    id: "secovi-sp-pmi-2026-05",
    title: "Pesquisa Mensal do Mercado Imobiliário - maio de 2026",
    publisher: "Secovi-SP",
    url: "https://secovi.com.br/secovi-sp-divulga-dados-de-maio-do-mercado-imobiliario/",
    verifiedAt: "2026-07-17",
    facts: [
      "Na cidade de São Paulo, maio de 2026 registrou 13.130 unidades residenciais novas lançadas, 9.993 vendidas e oferta final de 88,8 mil unidades.",
      "A VSO mensal foi de 10,1% e a VSO acumulada em 12 meses foi de 55,9%.",
      "Dois dormitórios, imóveis de 30 m² a 45 m² e produtos enquadrados no MCMV lideraram diversos indicadores do mês.",
      "Os recortes por zona, tipologia, área e preço devem ser comparados apenas com projetos equivalentes na cidade de São Paulo.",
    ],
    useFor: ["São Paulo", "VSO", "lançamentos", "vendas", "oferta final", "tipologia", "metragem", "MCMV", "zona"],
  },
  {
    id: "secovi-sp-interior-2026-q1",
    title: "Mercado do interior, Baixada Santista e Região Metropolitana - 1º trimestre de 2026",
    publisher: "Secovi-SP",
    url: "https://secovi.com.br/secovi-sp-aponta-mercado-imobiliario-resiliente-no-interior-paulista-apesar-de-desafios-economicos-e-politicos/",
    verifiedAt: "2026-07-17",
    facts: [
      "O levantamento abrange 42 cidades do interior, Baixada Santista e Região Metropolitana de São Paulo.",
      "A pesquisa acompanha lançamentos, vendas, estoque, valor de metro quadrado e VGV vendido em polos paulistas.",
      "Resultados agregados das 42 cidades não substituem o recorte específico da cidade, microrregião e produto do empreendimento.",
    ],
    useFor: ["interior de São Paulo", "Baixada Santista", "RMSP", "estoque", "metro quadrado", "VGV", "demanda regional"],
  },
];

export const CUSTOMER_EXPERIENCE_SOURCES: MarketSource[] = [
  {
    id: "meta-whatsapp-template-pacing-2026",
    title: "Template pacing",
    publisher: "Meta for Developers",
    url: "https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pacing",
    verifiedAt: "2026-07-16",
    facts: ["A Meta usa sinais iniciais de qualidade para controlar a velocidade de entrega de templates.", "Feedback negativo e baixa qualidade devem interromper escala e provocar revisão do template, público e consentimento."],
    useFor: ["WhatsApp", "reativação", "pacing", "qualidade", "campanha"],
  },
  {
    id: "twilio-whatsapp-best-practices-2026",
    title: "WhatsApp best practices and FAQs",
    publisher: "Twilio Docs",
    url: "https://www.twilio.com/docs/whatsapp/best-practices-and-faqs",
    verifiedAt: "2026-07-16",
    facts: ["Mensagens iniciadas pela empresa devem usar templates aprovados e respeitar opt-in.", "Conteúdo esperado, relevante e com saída clara protege experiência e qualidade."],
    useFor: ["WhatsApp", "consentimento", "opt-out", "template", "experiência"],
  },
  {
    id: "microsoft-conversation-best-practices-2026",
    title: "Conversational language understanding best practices",
    publisher: "Microsoft Learn",
    url: "https://learn.microsoft.com/en-us/azure/ai-services/language-service/conversational-language-understanding/concepts/best-practices",
    verifiedAt: "2026-07-16",
    facts: ["Modelos conversacionais devem ser testados com variações reais de linguagem e monitorados após publicação.", "Classes ambíguas e dados desequilibrados reduzem a qualidade das decisões."],
    useFor: ["experiência", "classificação", "monitoramento", "calibração", "linguagem"],
  },
  {
    id: "google-dialogflow-best-practices-2026",
    title: "Dialogflow service use best practices",
    publisher: "Google Cloud",
    url: "https://cloud.google.com/dialogflow/es/docs/best-practices",
    verifiedAt: "2026-07-16",
    facts: ["Fluxos conversacionais devem tratar falhas e ambiguidades de forma explícita.", "A experiência deve oferecer recuperação e encaminhamento humano quando a automação não tem confiança suficiente."],
    useFor: ["experiência", "fallback", "encaminhamento humano", "confiança"],
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
  "Previsão de conversão deve exibir probabilidade, confiança, fatores favoráveis, riscos e dados ausentes; nunca apresentar score como garantia.",
  "Resultado local ganho ou perdido, velocidade por etapa e qualidade do atendimento têm prioridade sobre benchmarks nacionais na recalibração.",
  "Preço anunciado, renda regional, juros e oferta são contexto; não devem ser tratados isoladamente como causa da compra individual.",
  "Para projetos paulistas, use VSO, oferta, lançamentos e vendas do Secovi-SP somente no mesmo recorte de cidade, zona, tipologia, metragem e faixa de preço.",
  "Dados pessoais de leads não devem aparecer em respostas agregadas nem ser enviados sem necessidade.",
  "Em reativação, detectar atrito não autoriza troca automática: explique o sinal, ofereça recuperação ou troca e preserve a decisão humana.",
  "Escalar WhatsApp exige opt-in, template aprovado, pacing, monitoramento de qualidade e pausa rápida diante de falhas ou feedback negativo.",
];

export function marketKnowledgeForPrompt() {
  return [...REAL_ESTATE_MARKET_SOURCES, ...CUSTOMER_EXPERIENCE_SOURCES].map((source) => [
    `[${source.id}] ${source.publisher} - ${source.title}`,
    `Verificado em ${source.verifiedAt}.`,
    ...source.facts.map((fact) => `- ${fact}`),
    `URL: ${source.url}`,
  ].join("\n")).join("\n\n");
}

export function relevantMarketSources(question: string) {
  const terms = question.toLowerCase().split(/\W+/).filter((term) => term.length > 3);
  const allSources = [...REAL_ESTATE_MARKET_SOURCES, ...CUSTOMER_EXPERIENCE_SOURCES];
  const ranked = allSources.map((source) => ({
    source,
    score: terms.filter((term) => `${source.title} ${source.useFor.join(" ")} ${source.facts.join(" ")}`.toLowerCase().includes(term)).length,
  })).sort((a, b) => b.score - a.score);
  const selected = ranked.filter((item) => item.score > 0).slice(0, 3).map((item) => item.source);
  return selected.length ? selected : REAL_ESTATE_MARKET_SOURCES.slice(0, 3);
}

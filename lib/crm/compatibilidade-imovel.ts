/**
 * COMPATIBILIDADE CLIENTE × IMÓVEL — por REGRAS, e honesta com a ausência.
 *
 * ── O QUE ESTE MÓDULO É ─────────────────────────────────────────────────────
 *
 * Um motor PURO (sem banco, sem `server-only`, sem IA) que responde: quais dos
 * imóveis do catálogo combinam com este cliente, e — mais importante — o que
 * AINDA NÃO SE SABE para poder responder.
 *
 * "Regras determinísticas antes de IA" não é preferência de estilo aqui: é a
 * única forma de o corretor poder DISCORDAR do resultado. Um score que ninguém
 * consegue auditar não é recomendação, é palpite com autoridade.
 *
 * ── A DECISÃO DE DESENHO QUE VEIO DA MEDIÇÃO ────────────────────────────────
 *
 * Medido no banco canônico em 2026-07-30, e é isto que dita o desenho inteiro:
 *
 *   LADO DA OFERTA (4 empreendimentos em `developments`)
 *     price_min / price_max ......... 0 de 4    ← o critério que mais decide
 *     delivery_date ................ 0 de 4
 *     latitude / longitude ......... 0 de 4    ← raio é incalculável, sempre
 *     bedrooms_min / max ........... 2 de 4
 *     private_area_min / max ....... 2 de 4
 *     neighborhood ................. 3 de 4
 *     sales_cycle_status ........... 4 de 4  (todos "planning")
 *     updated_at ................... 4 de 4
 *
 *   `development_typologies` (6 linhas, TODAS de um único empreendimento)
 *     price_from / price_to ........ 0 de 6
 *     bedrooms ..................... 0 de 6   (mas o NOME diz "1 dormitório")
 *     parking_spaces ............... 0 de 6   (mas o NOME diz "sem vaga")
 *     units_available .............. 0 de 6
 *     private_area ................. 6 de 6
 *
 *   `inventory_units` 0 linhas · `units` 0 linhas · `properties` 0 linhas
 *   `developer_payment_flow_rules` 0 linhas  ← nenhuma condição de pagamento
 *
 *   LADO DO CLIENTE (`leads`)
 *     budget_min 8 · budget_max 1 · preferred_bedrooms 12 ·
 *     preferred_neighborhoods 6 · purpose 178
 *     monthly_income · available_down_payment · fgts_balance ·
 *     desired_monthly_payment · financing_required · financing_term_months ·
 *     financial_restrictions · payment_method · purchase_timeline ·
 *     preferred_min_area · bedrooms · preferred_regions ..... TODOS ZERO
 *
 * Duas consequências que o motor tem de encarar de frente:
 *
 * 1. **PREÇO ESTÁ MORTO NOS DOIS LADOS.** Não adianta o cliente ter orçamento:
 *    nenhum imóvel tem preço. Por isso a ausência é classificada por DONO —
 *    `falta_cliente` (o corretor pergunta) contra `falta_oferta` (a operação
 *    preenche o catálogo). São problemas de pessoas diferentes, e misturá-los
 *    faria o painel mandar o corretor ligar para o cliente para resolver uma
 *    lacuna que só o cadastro resolve.
 *
 * 2. **AUSENTE NÃO É "NÃO ATENDIDO".** Um critério sem dado tem um TERCEIRO
 *    estado. Tratá-lo como reprovação inventa incompatibilidade; tratá-lo como
 *    aprovação inventa compatibilidade. As duas mentiras têm o mesmo custo: o
 *    corretor liga confiando num número que ninguém mediu.
 *
 * ── O QUE ESTE MÓDULO SE PROÍBE ─────────────────────────────────────────────
 *
 * · NÃO chuta faixa de preço a partir de renda, bairro ou "perfil".
 * · NÃO calcula parcela: parcela exige juros e prazo, e
 *   `developer_payment_flow_rules` tem ZERO linhas. `calculatePaymentScenario`
 *   (lib/commercial/explainable-payment-simulation.ts) já toma essa posição —
 *   sem regra da incorporadora, ele devolve componente nulo em vez de inventar
 *   taxa. Este motor segue a mesma regra: critério que depende de condição de
 *   pagamento fica `falta_oferta` até existir regra declarada.
 * · NÃO deduz dormitório/vaga do TEXTO da tipologia. O nome
 *   "NR 1 dormitório — 35 a 42 m², sem vaga" tem a informação, e a coluna está
 *   NULA — mas ler prosa para preencher coluna estruturada é adivinhação com
 *   cara de dado. O motor relata a lacuna; o conserto é backfill de 6 linhas.
 * · NÃO devolve percentual sozinho. `aderencia` só viaja acompanhada de
 *   `cobertura`: 100% de aderência sobre 1 critério de 14 não é compatibilidade,
 *   é ignorância bem apresentada.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * OS ESTADOS DE UM CRITÉRIO
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Quatro estados, não dois. Os dois de ausência são separados porque têm DONOS
 * diferentes: `falta_cliente` é pergunta para o corretor fazer, `falta_oferta` é
 * cadastro para a operação preencher.
 */
export type EstadoDoCriterio = "atendido" | "nao_atendido" | "falta_cliente" | "falta_oferta";

export type ChaveDeCriterio =
  | "faixaDePreco"
  | "valorDeEntrada"
  | "rendaEstimada"
  | "financiamento"
  | "bairro"
  | "raio"
  | "dormitorios"
  | "metragem"
  | "vagas"
  | "estagioDaObra"
  | "dataDeEntrega"
  | "finalidade"
  | "disponibilidade"
  | "atualizacaoDoEstoque";

export type AvaliacaoDeCriterio = {
  chave: ChaveDeCriterio;
  rotulo: string;
  peso: number;
  decisivo: boolean;
  estado: EstadoDoCriterio;
  /** Frase curta que explica o veredito com os NÚMEROS que o produziram. */
  detalhe: string;
};

/* ────────────────────────────────────────────────────────────────────────────
 * O CATÁLOGO DE CRITÉRIOS — a única fonte dos pesos
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Os 14 critérios, com peso, dono da lacuna e a frase que destrava cada um.
 *
 * ── SOBRE OS PESOS ──────────────────────────────────────────────────────────
 *
 * Peso é escolha de ENGENHARIA declarada, não métrica comercial medida: não
 * existe, nesta base, histórico de venda ligado a critério de matching que
 * permitisse calibrar peso por observação (`conversion_outcome_labels` não
 * carrega critério de imóvel). Por isso os pesos moram AQUI, em voz alta, num
 * lugar só — e não espalhados por comparações soltas dentro de um `if`.
 *
 * A ordem de grandeza segue o que trava negócio imobiliário na prática: preço e
 * localização eliminam, tipologia filtra, prazo e obra ajustam. Trocar qualquer
 * número aqui muda o ranking do produto inteiro, e é por isso que a mutação M-C1
 * ataca exatamente esta constante.
 *
 * ── DECISIVO: A TRAVA CONTRA "PARECE QUE FUNCIONA" ──────────────────────────
 *
 * `decisivo` marca os critérios sem os quais recomendar é encenação. Se NENHUM
 * decisivo pôde ser avaliado, o motor se RECUSA a devolver os três imóveis e
 * devolve as perguntas. É a regra mais importante do arquivo.
 */
export const CRITERIOS: ReadonlyArray<{
  chave: ChaveDeCriterio;
  rotulo: string;
  peso: number;
  decisivo: boolean;
  /** O que perguntar ao cliente quando falta do lado dele. */
  pergunta: string;
  /** O que cadastrar quando falta do lado da oferta. */
  preencher: string;
}> = [
  {
    chave: "faixaDePreco",
    rotulo: "Faixa de preço",
    peso: 25,
    decisivo: true,
    pergunta: "Qual faixa de valor você considera para o imóvel?",
    preencher: "developments.price_min / price_max (ou development_typologies.price_from / price_to)",
  },
  {
    chave: "bairro",
    rotulo: "Bairro",
    peso: 18,
    decisivo: true,
    pergunta: "Em quais bairros você quer morar ou investir?",
    preencher: "developments.neighborhood",
  },
  {
    chave: "dormitorios",
    rotulo: "Dormitórios",
    peso: 14,
    decisivo: true,
    pergunta: "De quantos dormitórios você precisa?",
    preencher: "developments.bedrooms_min / bedrooms_max (ou development_typologies.bedrooms)",
  },
  {
    chave: "valorDeEntrada",
    rotulo: "Valor de entrada",
    peso: 9,
    decisivo: false,
    pergunta: "Quanto você tem disponível para a entrada, somando FGTS?",
    preencher: "developer_payment_flow_rules (percentual de entrada) + preço do imóvel",
  },
  {
    chave: "rendaEstimada",
    rotulo: "Renda estimada",
    peso: 8,
    decisivo: false,
    pergunta: "Qual a renda mensal que entra na composição?",
    preencher: "developer_payment_flow_rules (parcelas) + preço do imóvel",
  },
  {
    chave: "metragem",
    rotulo: "Metragem",
    peso: 7,
    decisivo: false,
    pergunta: "Qual metragem mínima atende sua necessidade?",
    preencher: "developments.private_area_min / private_area_max",
  },
  {
    chave: "financiamento",
    rotulo: "Financiamento",
    peso: 5,
    decisivo: false,
    pergunta: "Você pretende financiar ou pagar à vista?",
    preencher: "developer_payment_flow_rules (fluxo aceito pela incorporadora)",
  },
  {
    chave: "finalidade",
    rotulo: "Finalidade",
    peso: 4,
    decisivo: false,
    pergunta: "O imóvel é para morar ou para investir?",
    preencher: "developments.market_segment / product_type",
  },
  {
    chave: "dataDeEntrega",
    rotulo: "Data de entrega",
    peso: 4,
    decisivo: false,
    pergunta: "Em quanto tempo você precisa das chaves?",
    preencher: "developments.delivery_date",
  },
  {
    chave: "estagioDaObra",
    rotulo: "Estágio da obra",
    peso: 3,
    decisivo: false,
    pergunta: "Você aceita imóvel na planta ou precisa de pronto para morar?",
    preencher: "developments.sales_cycle_status",
  },
  {
    chave: "vagas",
    rotulo: "Vagas",
    peso: 3,
    decisivo: false,
    pergunta: "Você precisa de vaga de garagem? Quantas?",
    preencher: "development_typologies.parking_spaces",
  },
  {
    chave: "disponibilidade",
    rotulo: "Disponibilidade",
    peso: 3,
    decisivo: false,
    pergunta: "(não depende do cliente)",
    preencher: "development_typologies.units_available ou inventory_units",
  },
  {
    chave: "raio",
    rotulo: "Raio de distância",
    peso: 2,
    decisivo: false,
    pergunta: "Qual endereço de referência (trabalho, escola) deve ficar perto?",
    preencher: "developments.latitude / longitude",
  },
  {
    chave: "atualizacaoDoEstoque",
    rotulo: "Atualização do estoque",
    peso: 2,
    decisivo: false,
    pergunta: "(não depende do cliente)",
    preencher: "developments.updated_at / development_typologies.updated_at",
  },
];

const PESO_TOTAL = CRITERIOS.reduce((soma, c) => soma + c.peso, 0);
const POR_CHAVE = new Map(CRITERIOS.map((c) => [c.chave, c]));

/* ────────────────────────────────────────────────────────────────────────────
 * OS LIMITES DECLARADOS — todos aqui, nenhum enterrado num `if`
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Quantos critérios DECISIVOS precisam ter sido avaliados para o motor aceitar
 * recomendar. Um é o mínimo defensável: abaixo disso a lista de três imóveis
 * seria só a ordem do catálogo com aparência de análise.
 */
export const MINIMO_DE_DECISIVOS_PARA_RECOMENDAR = 1;

/** Quantos imóveis o motor devolve. Pedido do dono: os TRÊS mais compatíveis. */
export const QUANTOS_RECOMENDAR = 3;

/**
 * Idade do cadastro a partir da qual o estoque é declarado suspeito.
 *
 * 30 dias não é métrica de mercado medida — é o limite operacional declarado
 * para este motor, e está aqui em voz alta para poder ser discutido e trocado
 * num lugar só. O que ele protege é concreto: preço e disponibilidade de
 * lançamento mudam por tabela nova, e recomendar sobre cadastro de meses atrás
 * é oferecer o que talvez não exista mais.
 */
export const DIAS_PARA_ESTOQUE_SUSPEITO = 30;

/** Fração de peso avaliável a partir da qual a leitura é "alta"/"média". */
export const COBERTURA_ALTA = 0.6;
export const COBERTURA_MEDIA = 0.3;

/**
 * Fração da renda que se admite comprometida com a parcela.
 *
 * ── POR QUE ISTO É UMA SUPOSIÇÃO DECLARADA, E NÃO UMA MÉTRICA ───────────────
 *
 * 0,30 é o teto de comprometimento que os bancos brasileiros usam para crédito
 * imobiliário. NÃO é métrica medida desta operação: não existe, nesta base,
 * histórico de aprovação de crédito que permitisse calibrá-lo (0 linhas em
 * `commercial_simulations`, 0 em `developer_payment_flow_rules`).
 *
 * Por isso ele fica: (a) num lugar só, nomeado; (b) DENTRO da frase que o
 * corretor lê, para nunca passar por número apurado; e (c) só é usado quando o
 * cliente NÃO disse quanto quer pagar por mês — a palavra do cliente ganha da
 * convenção do banco, sempre.
 */
export const FRACAO_DA_RENDA_PARA_PARCELA = 0.3;

/* ────────────────────────────────────────────────────────────────────────────
 * NORMALIZAÇÃO — porque o dado real chega sujo
 * ──────────────────────────────────────────────────────────────────────────── */

function semAcento(texto: unknown): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Bairro comparável.
 *
 * ── POR QUE ISTO NÃO É `toLowerCase()` ──────────────────────────────────────
 *
 * Os 6 valores reais de `preferred_neighborhoods` medidos hoje são
 * `brooklin`, `vilaolímpia`, `perdizes`, `perdizes/pompeia`. Do lado da oferta:
 * `Paraíso`, `Perdizes`, `Aclimação`.
 *
 * Dois defeitos aparecem só olhando o dado de verdade:
 *   · "vilaolímpia" chegou SEM ESPAÇO — comparar com "Vila Olímpia" falharia.
 *   · "perdizes/pompeia" são DOIS bairros num campo — comparação direta com
 *     "Perdizes" falharia, e o cliente que pediu Perdizes não veria Perdizes.
 *
 * Por isso: sem acento, sem espaço, e a barra vira separador.
 */
export function normalizarBairro(texto: unknown): string[] {
  return semAcento(texto)
    .split(/[/,;|]+/)
    .map((parte) => parte.replace(/[^a-z0-9]+/g, ""))
    .filter((parte) => parte.length > 0);
}

/**
 * Finalidade canônica: `moradia` | `investimento` | null.
 *
 * Medido: a coluna `purpose` tem SEIS grafias para duas ideias — `morar` (58),
 * `Moradia` (42), `investir` (37), `Investimento` (35), `investimento` (3),
 * `moradia` (3). Comparar texto cru trataria `morar` e `Moradia` como coisas
 * diferentes e quebraria o critério para 100 clientes que responderam.
 */
export function normalizarFinalidade(texto: unknown): "moradia" | "investimento" | null {
  const t = semAcento(texto);
  if (!t) return null;
  if (/invest|renda|alug|locac/.test(t)) return "investimento";
  if (/morar|morad|residi|propri|famili/.test(t)) return "moradia";
  return null;
}

/**
 * Número usável, ou null. String vazia, NaN e NEGATIVO não são número.
 *
 * O corte em negativo é deliberado: preço, metragem, renda e entrada negativos
 * são lixo de importação, e aceitá-los produziria faixa invertida.
 *
 * ⚠ NÃO serve para coordenada — veja `coordenada()` logo abaixo.
 */
function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Coordenada usável, ou null — e o motivo de ela não passar por `numero()`.
 *
 * ── O DEFEITO QUE ISTO CONSERTA (pego pelo próprio contrato, 2026-07-30) ────
 *
 * `numero()` recusa negativo. Latitude e longitude de São Paulo são NEGATIVAS
 * (-23,53 / -46,68) — ou seja, o Brasil inteiro caía como ausente. O critério
 * "raio" respondia `falta_oferta` com a frase "Imóvel sem latitude/longitude"
 * para um imóvel que TEM as duas colunas preenchidas.
 *
 * O custo não seria um score errado, seria pior: a resposta manda a operação
 * preencher uma coluna que já está preenchida. Este repositório já pagou por
 * essa classe de erro uma vez — o painel "Clientes 360" cobrava `development_id`
 * e `purpose` de 174 clientes que tinham os dois, e o efeito foi a operação
 * aprender a ignorar o painel.
 *
 * O dado real do catálogo tem geo nulo em 4 de 4 empreendimentos, então a
 * medição viva NÃO teria exposto isto: os dois caminhos devolvem `falta_oferta`
 * pelo dado de hoje. Só a execução com imóvel sintético COMPLETO separou "não
 * tem coordenada" de "tem coordenada e o código não a lê".
 */
function coordenada(valor: unknown, limite: 90 | 180): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < -limite || n > limite) return null;
  // Zero exato é o Golfo da Guiné, não São Paulo: em cadastro imobiliário
  // brasileiro é preenchimento de placeholder, e tratá-lo como local válido
  // colocaria todo imóvel mal cadastrado a 6.000 km do cliente com aparência de
  // medição real.
  return n === 0 ? null : n;
}

/**
 * Duas faixas se cruzam? Bordas nulas são ABERTAS, não zero.
 *
 * Importa porque o dado real é meia-faixa: 8 clientes têm `budget_min` e apenas
 * 1 tem `budget_max`. Ler o max ausente como 0 fecharia a faixa em [min, 0] e
 * reprovaria todo mundo — incompatibilidade inventada.
 *
 * Devolve `null` quando não há bordas suficientes para decidir: é o que faz o
 * critério cair em ausência em vez de virar veredito.
 */
export function faixasSeCruzam(
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
): boolean | null {
  if (aMin === null && aMax === null) return null;
  if (bMin === null && bMax === null) return null;
  const inicioA = aMin ?? Number.NEGATIVE_INFINITY;
  const fimA = aMax ?? Number.POSITIVE_INFINITY;
  const inicioB = bMin ?? Number.NEGATIVE_INFINITY;
  const fimB = bMax ?? Number.POSITIVE_INFINITY;
  return inicioA <= fimB && inicioB <= fimA;
}

/* ────────────────────────────────────────────────────────────────────────────
 * AS FORMAS DE ENTRADA
 * ──────────────────────────────────────────────────────────────────────────── */

/** O cliente, como as colunas de `leads` realmente existem. */
export type ClienteParaMatching = {
  id?: string | null;
  name?: string | null;
  budget_min?: number | string | null;
  budget_max?: number | string | null;
  preferred_bedrooms?: number | null;
  bedrooms?: number | null;
  preferred_min_area?: number | string | null;
  preferred_neighborhoods?: string[] | null;
  preferred_regions?: string[] | null;
  purpose?: string | null;
  monthly_income?: number | string | null;
  available_down_payment?: number | string | null;
  fgts_balance?: number | string | null;
  desired_monthly_payment?: number | string | null;
  financing_required?: boolean | null;
  financing_term_months?: number | null;
  payment_method?: string | null;
  purchase_timeline?: string | null;
  /** Quantas vagas o cliente precisa. Nenhuma coluna guarda isso hoje. */
  vagas_desejadas?: number | null;
  /** Prazo em meses para receber as chaves. Nenhuma coluna guarda isso hoje. */
  prazo_entrega_meses?: number | null;
  /** Endereço de referência para o raio. Nenhuma coluna guarda isso hoje. */
  latitude?: number | string | null;
  longitude?: number | string | null;
  raio_km?: number | null;
};

/** O imóvel, como `developments` + `development_typologies` realmente existem. */
export type OfertaParaMatching = {
  id: string;
  name?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  market_segment?: string | null;
  product_type?: string | null;
  bedrooms_min?: number | null;
  bedrooms_max?: number | null;
  private_area_min?: number | string | null;
  private_area_max?: number | string | null;
  price_min?: number | string | null;
  price_max?: number | string | null;
  sales_cycle_status?: string | null;
  delivery_date?: string | null;
  updated_at?: string | null;
  /** Vagas e disponibilidade vivem na tipologia, agregadas para cá. */
  parking_spaces_max?: number | null;
  units_available?: number | null;
  /**
   * Existe REGRA de pagamento declarada para este imóvel? 0 linhas hoje.
   * Só responde "a incorporadora declarou um fluxo?", nada sobre valores.
   */
  tem_regra_de_pagamento?: boolean | null;
  /**
   * Os NÚMEROS da regra, quando ela existe — `down_payment_percent` e
   * `installments_count` de `developer_payment_flow_rules`.
   *
   * ⚠ Vieram substituir uma MENTIRA LATENTE. Antes, entrada e renda eram
   * avaliadas com base apenas no booleano acima: bastava o cliente ter qualquer
   * entrada (> 0) para o critério sair "atendido", com a frase "contra regra
   * declarada do imóvel" — uma comparação que o código NUNCA fazia. Como não há
   * regra cadastrada hoje, o ramo era inalcançável e a suíte ficava verde; no
   * dia em que alguém cadastrasse a primeira regra, o motor passaria a aprovar
   * quem tem R$ 1 de entrada dizendo que conferiu.
   */
  entrada_percentual?: number | null;
  parcelas?: number | null;
};

/* ────────────────────────────────────────────────────────────────────────────
 * A AVALIAÇÃO, CRITÉRIO POR CRITÉRIO
 * ──────────────────────────────────────────────────────────────────────────── */

function monta(
  chave: ChaveDeCriterio,
  estado: EstadoDoCriterio,
  detalhe: string,
): AvaliacaoDeCriterio {
  const def = POR_CHAVE.get(chave)!;
  return { chave, rotulo: def.rotulo, peso: def.peso, decisivo: def.decisivo, estado, detalhe };
}

function avaliarFaixaDePreco(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const cMin = numero(c.budget_min);
  const cMax = numero(c.budget_max);
  const oMin = numero(o.price_min);
  const oMax = numero(o.price_max);
  // A oferta primeiro, de propósito: hoje é ela que falta em 100% do catálogo, e
  // culpar o cliente por uma lacuna de cadastro manda o corretor ligar em vão.
  if (oMin === null && oMax === null) {
    return monta("faixaDePreco", "falta_oferta", "Imóvel sem preço cadastrado — impossível comparar com orçamento.");
  }
  if (cMin === null && cMax === null) {
    return monta("faixaDePreco", "falta_cliente", "Cliente sem faixa de orçamento informada.");
  }
  const cruza = faixasSeCruzam(cMin, cMax, oMin, oMax);
  return monta(
    "faixaDePreco",
    cruza ? "atendido" : "nao_atendido",
    `Orçamento ${cMin ?? "—"}–${cMax ?? "—"} contra preço ${oMin ?? "—"}–${oMax ?? "—"}.`,
  );
}

/**
 * Entrada e renda: dependem de CONDIÇÃO DE PAGAMENTO, que não se inventa.
 *
 * Sem `developer_payment_flow_rules` (0 linhas hoje) não existe percentual de
 * entrada nem número de parcelas declarado pela incorporadora. Calcular parcela
 * exigiria arbitrar juros — exatamente o "inventar condições" proibido. Então o
 * critério fica `falta_oferta`, com o nome da regra que falta.
 */
function avaliarValorDeEntrada(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const preco = numero(o.price_min);
  const percentual = numero(o.entrada_percentual);
  if (preco === null || percentual === null) {
    return monta(
      "valorDeEntrada",
      "falta_oferta",
      "Sem regra de pagamento declarada (developer_payment_flow_rules.down_payment_percent) e/ou sem preço: a entrada exigida é desconhecida e NÃO será estimada.",
    );
  }
  const disponivel = (numero(c.available_down_payment) ?? 0) + (numero(c.fgts_balance) ?? 0);
  const temCliente = numero(c.available_down_payment) !== null || numero(c.fgts_balance) !== null;
  if (!temCliente) {
    return monta("valorDeEntrada", "falta_cliente", "Cliente sem valor de entrada nem saldo de FGTS informados.");
  }
  // A MESMA fórmula de `calculatePaymentScenario`: entrada = preço × percentual.
  // Sem juros, sem correção — as premissas que aquele módulo já declara.
  const exigida = Math.round((preco * percentual) / 100);
  return monta(
    "valorDeEntrada",
    disponivel >= exigida ? "atendido" : "nao_atendido",
    `Entrada disponível ${disponivel} contra ${exigida} exigidos (${percentual}% de ${preco}, pela regra declarada).`,
  );
}

function avaliarRendaEstimada(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const preco = numero(o.price_min);
  const percentual = numero(o.entrada_percentual);
  const parcelas = numero(o.parcelas);
  if (preco === null || percentual === null || parcelas === null || parcelas === 0) {
    return monta(
      "rendaEstimada",
      "falta_oferta",
      "Sem regra de parcelamento declarada (developer_payment_flow_rules.installments_count) e/ou sem preço: a parcela não é calculável e NÃO será arbitrada.",
    );
  }
  const desejada = numero(c.desired_monthly_payment);
  const renda = numero(c.monthly_income);
  if (desejada === null && renda === null) {
    return monta("rendaEstimada", "falta_cliente", "Cliente sem renda mensal nem parcela desejada informadas.");
  }
  // Parcela LINEAR, igual à do simulador que já existe: saldo ÷ quantidade.
  const entrada = (preco * percentual) / 100;
  const parcela = Math.round((preco - entrada) / parcelas);

  // A palavra do CLIENTE ganha da convenção do banco: se ele disse quanto quer
  // pagar por mês, é esse o número comparado — sem suposição nenhuma no meio.
  if (desejada !== null) {
    return monta(
      "rendaEstimada",
      parcela <= desejada ? "atendido" : "nao_atendido",
      `Parcela linear de ${parcela} contra ${desejada} que o cliente declarou querer pagar (sem juros, pela regra declarada).`,
    );
  }
  const teto = Math.round(renda! * FRACAO_DA_RENDA_PARA_PARCELA);
  return monta(
    "rendaEstimada",
    parcela <= teto ? "atendido" : "nao_atendido",
    `Parcela linear de ${parcela} contra teto de ${teto} — SUPOSIÇÃO declarada de ${Math.round(FRACAO_DA_RENDA_PARA_PARCELA * 100)}% da renda de ${renda}, não análise de crédito.`,
  );
}

function avaliarFinanciamento(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const querFinanciar = c.financing_required;
  const forma = semAcento(c.payment_method);
  if (querFinanciar === null || querFinanciar === undefined) {
    if (!forma) {
      return monta("financiamento", "falta_cliente", "Cliente sem forma de pagamento nem necessidade de financiamento informadas.");
    }
  }
  if (!o.tem_regra_de_pagamento) {
    return monta("financiamento", "falta_oferta", "Imóvel sem fluxo de pagamento declarado pela incorporadora.");
  }
  return monta("financiamento", "atendido", "Fluxo declarado do imóvel comporta a forma de pagamento do cliente.");
}

function avaliarBairro(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const desejados = [
    ...(Array.isArray(c.preferred_neighborhoods) ? c.preferred_neighborhoods : []),
    ...(Array.isArray(c.preferred_regions) ? c.preferred_regions : []),
  ].flatMap((b) => normalizarBairro(b));
  const daOferta = [...normalizarBairro(o.neighborhood), ...normalizarBairro(o.city)];
  if (daOferta.length === 0) {
    return monta("bairro", "falta_oferta", "Imóvel sem bairro nem cidade cadastrados.");
  }
  if (desejados.length === 0) {
    return monta("bairro", "falta_cliente", "Cliente sem bairros de preferência informados.");
  }
  const bate = desejados.some((d) => daOferta.includes(d));
  return monta(
    "bairro",
    bate ? "atendido" : "nao_atendido",
    `Preferência [${desejados.join(", ")}] contra localização [${daOferta.join(", ")}].`,
  );
}

function avaliarRaio(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const oLat = coordenada(o.latitude, 90);
  const oLon = coordenada(o.longitude, 180);
  if (oLat === null || oLon === null) {
    return monta("raio", "falta_oferta", "Imóvel sem latitude/longitude — distância é incalculável.");
  }
  const cLat = coordenada(c.latitude, 90);
  const cLon = coordenada(c.longitude, 180);
  const raio = numero(c.raio_km);
  if (cLat === null || cLon === null || raio === null) {
    return monta("raio", "falta_cliente", "Cliente sem endereço de referência e raio aceitável.");
  }
  const km = distanciaKm(cLat, cLon, oLat, oLon);
  return monta(
    "raio",
    km <= raio ? "atendido" : "nao_atendido",
    `Distância ${km.toFixed(1)} km contra raio aceito de ${raio} km.`,
  );
}

/** Haversine. Determinístico, sem serviço externo, sem custo. */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Dormitórios. `0` é STUDIO e é resposta legítima — `?? null` em vez de `||`.
 *
 * Medido: 2 clientes reais pedem `preferred_bedrooms = 0`, e o Tiê Aclimação tem
 * `bedrooms_min = 0`. Um `||` trataria os dois zeros como ausência e perderia
 * justamente o encaixe de studio, que é o produto principal do catálogo.
 */
function avaliarDormitorios(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const querido = c.preferred_bedrooms ?? c.bedrooms ?? null;
  const min = o.bedrooms_min ?? null;
  const max = o.bedrooms_max ?? null;
  if (min === null && max === null) {
    return monta("dormitorios", "falta_oferta", "Imóvel sem faixa de dormitórios cadastrada.");
  }
  if (querido === null) {
    return monta("dormitorios", "falta_cliente", "Cliente sem número de dormitórios informado.");
  }
  const dentro = querido >= (min ?? querido) && querido <= (max ?? querido);
  return monta(
    "dormitorios",
    dentro ? "atendido" : "nao_atendido",
    `Cliente quer ${querido} dorm.; imóvel oferece ${min ?? "—"} a ${max ?? "—"}.`,
  );
}

function avaliarMetragem(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const minimo = numero(c.preferred_min_area);
  const oMin = numero(o.private_area_min);
  const oMax = numero(o.private_area_max);
  if (oMin === null && oMax === null) {
    return monta("metragem", "falta_oferta", "Imóvel sem metragem privativa cadastrada.");
  }
  if (minimo === null) {
    return monta("metragem", "falta_cliente", "Cliente sem metragem mínima informada.");
  }
  const teto = oMax ?? oMin!;
  return monta(
    "metragem",
    teto >= minimo ? "atendido" : "nao_atendido",
    `Mínimo de ${minimo} m² contra ${oMin ?? "—"}–${oMax ?? "—"} m² do imóvel.`,
  );
}

function avaliarVagas(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const vagas = o.parking_spaces_max ?? null;
  if (vagas === null) {
    return monta(
      "vagas",
      "falta_oferta",
      "Tipologias sem parking_spaces preenchido — a informação existe no NOME da tipologia, mas ler prosa não vira dado.",
    );
  }
  const querido = c.vagas_desejadas ?? null;
  if (querido === null) {
    return monta("vagas", "falta_cliente", "Cliente sem necessidade de vaga informada.");
  }
  return monta("vagas", vagas >= querido ? "atendido" : "nao_atendido", `Precisa ${querido}; imóvel tem até ${vagas}.`);
}

/**
 * Estágio da obra contra prazo do cliente.
 *
 * `planning` significa planta: quem precisa de chave logo NÃO é atendido. É o
 * único critério em que o catálogo de hoje tem dado suficiente para REPROVAR —
 * e reprovar com razão vale mais que aprovar por ignorância.
 */
function avaliarEstagioDaObra(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const estagio = semAcento(o.sales_cycle_status);
  if (!estagio) {
    return monta("estagioDaObra", "falta_oferta", "Imóvel sem estágio de ciclo de venda cadastrado.");
  }
  const prazo = c.prazo_entrega_meses ?? null;
  const urgencia = semAcento(c.purchase_timeline);
  if (prazo === null && !urgencia) {
    return monta("estagioDaObra", "falta_cliente", "Cliente sem prazo desejado para as chaves.");
  }
  const naPlanta = /planning|planta|pre_?lanc|lancamento/.test(estagio);
  const comPressa = (prazo !== null && prazo <= 12) || /imediat|urgent|30|60|90|3 ?mes/.test(urgencia);
  if (naPlanta && comPressa) {
    return monta("estagioDaObra", "nao_atendido", `Imóvel em "${estagio}" e cliente precisa de chaves em curto prazo.`);
  }
  return monta("estagioDaObra", "atendido", `Estágio "${estagio}" comporta o prazo do cliente.`);
}

function avaliarDataDeEntrega(c: ClienteParaMatching, o: OfertaParaMatching, agora: Date): AvaliacaoDeCriterio {
  if (!o.delivery_date) {
    return monta("dataDeEntrega", "falta_oferta", "Imóvel sem data de entrega cadastrada.");
  }
  const prazo = c.prazo_entrega_meses ?? null;
  if (prazo === null) {
    return monta("dataDeEntrega", "falta_cliente", "Cliente sem prazo desejado para as chaves.");
  }
  const entrega = new Date(o.delivery_date);
  if (Number.isNaN(entrega.getTime())) {
    return monta("dataDeEntrega", "falta_oferta", "Data de entrega cadastrada em formato inválido.");
  }
  const meses = (entrega.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  return monta(
    "dataDeEntrega",
    meses <= prazo ? "atendido" : "nao_atendido",
    `Entrega em ~${Math.round(meses)} meses contra prazo de ${prazo} meses.`,
  );
}

function avaliarFinalidade(c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const finalidade = normalizarFinalidade(c.purpose);
  const segmento = semAcento(o.market_segment);
  const produto = semAcento(o.product_type);
  if (!segmento && !produto) {
    return monta("finalidade", "falta_oferta", "Imóvel sem segmento nem tipo de produto cadastrados.");
  }
  if (!finalidade) {
    return monta("finalidade", "falta_cliente", "Cliente sem finalidade (morar/investir) informada.");
  }
  // Residencial serve às DUAS finalidades: studio para investir é o produto mais
  // vendido do catálogo. Reprovar investidor em residencial seria regra inventada.
  const residencial = /residencial|apartamento|studio|casa/.test(`${segmento} ${produto}`);
  return monta(
    "finalidade",
    residencial ? "atendido" : "nao_atendido",
    `Finalidade "${finalidade}" contra produto "${segmento || produto}".`,
  );
}

/**
 * Disponibilidade. Ausência aqui NÃO é "disponível".
 *
 * `status = 'active'` no empreendimento diz que o CADASTRO está ativo, não que
 * exista unidade à venda. Com `units_available` nulo em 6 de 6 tipologias e
 * `inventory_units` vazia, a resposta honesta é "não se sabe".
 */
function avaliarDisponibilidade(_c: ClienteParaMatching, o: OfertaParaMatching): AvaliacaoDeCriterio {
  const disponiveis = o.units_available ?? null;
  if (disponiveis === null) {
    return monta(
      "disponibilidade",
      "falta_oferta",
      "Sem contagem de unidades disponíveis (units_available nulo, inventory_units vazia). Cadastro ativo NÃO é estoque disponível.",
    );
  }
  return monta(
    "disponibilidade",
    disponiveis > 0 ? "atendido" : "nao_atendido",
    `${disponiveis} unidade(s) disponível(is).`,
  );
}

function avaliarAtualizacaoDoEstoque(o: OfertaParaMatching, agora: Date): AvaliacaoDeCriterio {
  if (!o.updated_at) {
    return monta("atualizacaoDoEstoque", "falta_oferta", "Imóvel sem updated_at — idade do cadastro é desconhecida.");
  }
  const quando = new Date(o.updated_at);
  if (Number.isNaN(quando.getTime())) {
    return monta("atualizacaoDoEstoque", "falta_oferta", "updated_at em formato inválido.");
  }
  const dias = Math.floor((agora.getTime() - quando.getTime()) / (1000 * 60 * 60 * 24));
  return monta(
    "atualizacaoDoEstoque",
    dias <= DIAS_PARA_ESTOQUE_SUSPEITO ? "atendido" : "nao_atendido",
    `Cadastro atualizado há ${dias} dia(s); limite declarado é ${DIAS_PARA_ESTOQUE_SUSPEITO}.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * PONTUAÇÃO DE UM IMÓVEL
 * ──────────────────────────────────────────────────────────────────────────── */

export type PontuacaoDeOferta = {
  ofertaId: string;
  nome: string;
  criterios: AvaliacaoDeCriterio[];
  atendidos: AvaliacaoDeCriterio[];
  naoAtendidos: AvaliacaoDeCriterio[];
  faltaDoCliente: AvaliacaoDeCriterio[];
  faltaDaOferta: AvaliacaoDeCriterio[];
  /** Peso somado dos critérios ATENDIDOS. É por isto que o ranking ordena. */
  pontos: number;
  /** Peso somado dos critérios que deu para avaliar (atendido + não atendido). */
  pontosAvaliaveis: number;
  /** Peso somado de todos os 14. Constante, exposto para a conta ser auditável. */
  pontosTotais: number;
  /** `pontos / pontosAvaliaveis` — NUNCA viaja sem `cobertura`. */
  aderencia: number | null;
  /** `pontosAvaliaveis / pontosTotais` — quanto do questionário deu para usar. */
  cobertura: number;
  confianca: "alta" | "media" | "baixa" | "insuficiente";
  decisivosAvaliados: number;
  riscoDeEstoque: { suspeito: boolean; motivo: string; diasDesdeAtualizacao: number | null };
};

export function pontuarCompatibilidade(
  cliente: ClienteParaMatching,
  oferta: OfertaParaMatching,
  opcoes: { agora?: Date } = {},
): PontuacaoDeOferta {
  const agora = opcoes.agora ?? new Date();
  const criterios: AvaliacaoDeCriterio[] = [
    avaliarFaixaDePreco(cliente, oferta),
    avaliarBairro(cliente, oferta),
    avaliarDormitorios(cliente, oferta),
    avaliarValorDeEntrada(cliente, oferta),
    avaliarRendaEstimada(cliente, oferta),
    avaliarMetragem(cliente, oferta),
    avaliarFinanciamento(cliente, oferta),
    avaliarFinalidade(cliente, oferta),
    avaliarDataDeEntrega(cliente, oferta, agora),
    avaliarEstagioDaObra(cliente, oferta),
    avaliarVagas(cliente, oferta),
    avaliarDisponibilidade(cliente, oferta),
    avaliarRaio(cliente, oferta),
    avaliarAtualizacaoDoEstoque(oferta, agora),
  ];

  const atendidos = criterios.filter((c) => c.estado === "atendido");
  const naoAtendidos = criterios.filter((c) => c.estado === "nao_atendido");
  const faltaDoCliente = criterios.filter((c) => c.estado === "falta_cliente");
  const faltaDaOferta = criterios.filter((c) => c.estado === "falta_oferta");

  const pontos = atendidos.reduce((s, c) => s + c.peso, 0);
  const pontosAvaliaveis = pontos + naoAtendidos.reduce((s, c) => s + c.peso, 0);
  const cobertura = PESO_TOTAL === 0 ? 0 : pontosAvaliaveis / PESO_TOTAL;
  const decisivosAvaliados = criterios.filter(
    (c) => c.decisivo && (c.estado === "atendido" || c.estado === "nao_atendido"),
  ).length;

  const confianca: PontuacaoDeOferta["confianca"] =
    decisivosAvaliados < MINIMO_DE_DECISIVOS_PARA_RECOMENDAR
      ? "insuficiente"
      : cobertura >= COBERTURA_ALTA
        ? "alta"
        : cobertura >= COBERTURA_MEDIA
          ? "media"
          : "baixa";

  const atualizacao = criterios.find((c) => c.chave === "atualizacaoDoEstoque")!;
  const disponibilidade = criterios.find((c) => c.chave === "disponibilidade")!;
  const dias = /há (\d+) dia/.exec(atualizacao.detalhe);
  // ── O RISCO DE ESTOQUE VELHO, SEM SE ENGANAR COM O PRÓPRIO CADASTRO ───────
  //
  // Cadastro recém-editado NÃO é estoque conferido. Medido hoje: os 4
  // empreendimentos foram atualizados há poucos dias e NENHUM tem contagem de
  // unidades. Dizer "estoque fresco" com base no `updated_at` seria trocar a
  // pergunta ("quantas unidades sobraram?") por outra que é fácil de responder.
  const semContagem = disponibilidade.estado === "falta_oferta";
  const riscoDeEstoque = {
    suspeito: atualizacao.estado === "nao_atendido" || semContagem,
    motivo:
      atualizacao.estado === "nao_atendido"
        ? `Cadastro sem atualização além do limite de ${DIAS_PARA_ESTOQUE_SUSPEITO} dias.`
        : semContagem
          ? "Cadastro recente, porém SEM contagem de unidades: frescor do registro não é frescor do estoque."
          : "Cadastro atualizado e com contagem de unidades.",
    diasDesdeAtualizacao: dias ? Number(dias[1]) : null,
  };

  return {
    ofertaId: oferta.id,
    nome: String(oferta.name ?? oferta.id),
    criterios,
    atendidos,
    naoAtendidos,
    faltaDoCliente,
    faltaDaOferta,
    pontos,
    pontosAvaliaveis,
    pontosTotais: PESO_TOTAL,
    aderencia: pontosAvaliaveis === 0 ? null : pontos / pontosAvaliaveis,
    cobertura,
    confianca,
    decisivosAvaliados,
    riscoDeEstoque,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * A RECOMENDAÇÃO DO CLIENTE
 * ──────────────────────────────────────────────────────────────────────────── */

export type PerguntaQueDestrava = {
  chave: ChaveDeCriterio;
  rotulo: string;
  peso: number;
  decisivo: boolean;
  pergunta: string;
  /** Quantos imóveis do catálogo destravariam com esta resposta. */
  destravaOfertas: number;
};

export type LacunaDoCatalogo = {
  chave: ChaveDeCriterio;
  rotulo: string;
  peso: number;
  decisivo: boolean;
  preencher: string;
  /** Em quantos imóveis do catálogo esta coluna está vazia. */
  ofertasAfetadas: number;
};

export type RecomendacaoDoCliente = {
  clienteId: string | null;
  nome: string | null;
  /** A trava: falso quando nenhum critério DECISIVO pôde ser avaliado. */
  recomendavel: boolean;
  motivoDaRecusa: string | null;
  /** Vazio quando `recomendavel` é falso. Nunca "três imóveis por desencargo". */
  top: PontuacaoDeOferta[];
  /**
   * Imóveis DELIBERADAMENTE fora do top porque nenhum critério decisivo pôde ser
   * avaliado para eles. Não é a mesma coisa que "incompatível" — e some do
   * ranking justamente para não passar por recomendação.
   */
  ofertasNaoAvaliaveis: Array<{ ofertaId: string; nome: string; porque: string }>;
  /** O que perguntar ao CLIENTE, em ordem de peso destravado. */
  perguntasQueDestravam: PerguntaQueDestrava[];
  /** O que a OPERAÇÃO precisa cadastrar. Lacuna de catálogo, não do cliente. */
  lacunasDoCatalogo: LacunaDoCatalogo[];
  alternativaMaisBarata:
    | { ofertaId: string; nome: string; preco: number; economia: number | null }
    | { indisponivel: true; motivo: string };
  alternativaProxima:
    | { ofertaId: string; nome: string; bairro: string | null; porque: string }
    | { indisponivel: true; motivo: string };
  /** Quantos imóveis foram considerados. Sem isto o "top 3" não é auditável. */
  ofertasAvaliadas: number;
  geradoEm: string;
};

export function recomendarPara(
  cliente: ClienteParaMatching,
  ofertas: ReadonlyArray<OfertaParaMatching>,
  opcoes: { agora?: Date; quantos?: number } = {},
): RecomendacaoDoCliente {
  const agora = opcoes.agora ?? new Date();
  const quantos = opcoes.quantos ?? QUANTOS_RECOMENDAR;
  const pontuadas = ofertas.map((o) => pontuarCompatibilidade(cliente, o, { agora }));

  // ── ORDENAÇÃO: peso ABSOLUTO atendido, não a razão ────────────────────────
  //
  // Ordenar por `aderencia` premiaria o imóvel de que MENOS se sabe: um cadastro
  // com uma única coluna preenchida e batendo dá 100%, e passaria na frente de
  // outro que atende preço, bairro e dormitórios. A razão é diagnóstico; o
  // ranking é evidência. Empate desce para cobertura e, por último, nome — sem
  // esse terceiro critério a ordem depende do `sort` e o "top 3" muda sozinho.
  const ordenadas = [...pontuadas].sort(
    (a, b) =>
      b.pontos - a.pontos || b.cobertura - a.cobertura || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  // ── A TRAVA, APLICADA IMÓVEL POR IMÓVEL ───────────────────────────────────
  //
  // Executado contra o catálogo real em 2026-07-30, isto pegou um defeito que a
  // versão anterior deixava passar: para o lead c5eb4a8c (que informou
  // dormitórios mas nenhum bairro), o "Inside Perdizes" entrava no top 3 com
  // aderência 100% e cobertura 5,6% — os únicos critérios que deram para avaliar
  // nele foram Finalidade e Atualização do estoque. Nenhum decisivo. Ou seja: um
  // imóvel de que quase nada se sabe aparecia como terceira melhor opção, com
  // 100% estampado ao lado.
  //
  // Um imóvel sem nenhum critério decisivo avaliável não é "pouco compatível" —
  // é DESCONHECIDO, e desconhecido não entra em ranking. Ele sai para
  // `ofertasNaoAvaliaveis` com o motivo, que é onde a lacuna de cadastro fica
  // visível em vez de virar recomendação.
  const avaliaveis = ordenadas.filter((p) => p.decisivosAvaliados >= MINIMO_DE_DECISIVOS_PARA_RECOMENDAR);
  const naoAvaliaveis = ordenadas
    .filter((p) => p.decisivosAvaliados < MINIMO_DE_DECISIVOS_PARA_RECOMENDAR)
    .map((p) => {
      const decisivos = p.criterios.filter((c) => c.decisivo);
      const semCadastro = decisivos.filter((c) => c.estado === "falta_oferta").map((c) => c.rotulo);
      const semResposta = decisivos.filter((c) => c.estado === "falta_cliente").map((c) => c.rotulo);
      const partes: string[] = [];
      if (semCadastro.length) partes.push(`falta no CADASTRO do imóvel: ${semCadastro.join(", ")}`);
      if (semResposta.length) partes.push(`falta o cliente informar: ${semResposta.join(", ")}`);
      return { ofertaId: p.ofertaId, nome: p.nome, porque: partes.join(" · ") };
    });
  const recomendavel = avaliaveis.length > 0;

  // ── AS PERGUNTAS, EM ORDEM DE QUANTO DESTRAVAM ────────────────────────────
  //
  // Um critério só entra como PERGUNTA se a lacuna for do lado do cliente em
  // algum imóvel. Preço sem cadastro não vira pergunta ao cliente: perguntar
  // orçamento para depois não ter preço com que comparar é fazer o corretor
  // gastar a ligação e não destravar nada.
  const perguntas: PerguntaQueDestrava[] = [];
  const lacunas: LacunaDoCatalogo[] = [];
  for (const def of CRITERIOS) {
    const doCliente = pontuadas.filter((p) =>
      p.faltaDoCliente.some((c) => c.chave === def.chave),
    ).length;
    const daOferta = pontuadas.filter((p) =>
      p.faltaDaOferta.some((c) => c.chave === def.chave),
    ).length;
    if (doCliente > 0) {
      perguntas.push({
        chave: def.chave,
        rotulo: def.rotulo,
        peso: def.peso,
        decisivo: def.decisivo,
        pergunta: def.pergunta,
        destravaOfertas: doCliente,
      });
    }
    if (daOferta > 0) {
      lacunas.push({
        chave: def.chave,
        rotulo: def.rotulo,
        peso: def.peso,
        decisivo: def.decisivo,
        preencher: def.preencher,
        ofertasAfetadas: daOferta,
      });
    }
  }
  perguntas.sort((a, b) => Number(b.decisivo) - Number(a.decisivo) || b.peso - a.peso);
  lacunas.sort((a, b) => Number(b.decisivo) - Number(a.decisivo) || b.peso - a.peso);

  const top = avaliaveis.slice(0, quantos);

  // ── ALTERNATIVA MAIS BARATA: indisponível COM MOTIVO ──────────────────────
  //
  // Devolver `null` calado deixaria a tela escrever "não há alternativa mais
  // barata", que é falso: o que não há é PREÇO. A recusa nomeada é o que faz a
  // lacuna virar tarefa de alguém.
  const comPreco = ofertas.filter((o) => numero(o.price_min) !== null);
  let alternativaMaisBarata: RecomendacaoDoCliente["alternativaMaisBarata"];
  if (comPreco.length === 0) {
    alternativaMaisBarata = {
      indisponivel: true,
      motivo: `Nenhum dos ${ofertas.length} imóvel(is) do catálogo tem preço cadastrado — não existe "mais barato" a comparar.`,
    };
  } else {
    const escolhidos = new Set(top.map((t) => t.ofertaId));
    const referencia = top[0] ? numero(ofertas.find((o) => o.id === top[0].ofertaId)?.price_min) : null;
    const candidatas = comPreco
      .filter((o) => !escolhidos.has(o.id))
      .sort((a, b) => (numero(a.price_min) ?? 0) - (numero(b.price_min) ?? 0));
    const barata = candidatas[0];
    alternativaMaisBarata = barata
      ? {
          ofertaId: barata.id,
          nome: String(barata.name ?? barata.id),
          preco: numero(barata.price_min)!,
          economia: referencia === null ? null : referencia - numero(barata.price_min)!,
        }
      : { indisponivel: true, motivo: "Todos os imóveis com preço já estão entre os recomendados." };
  }

  // ── ALTERNATIVA PRÓXIMA: bairro pedido, fora do top ───────────────────────
  const desejados = [
    ...(Array.isArray(cliente.preferred_neighborhoods) ? cliente.preferred_neighborhoods : []),
    ...(Array.isArray(cliente.preferred_regions) ? cliente.preferred_regions : []),
  ].flatMap((b) => normalizarBairro(b));
  let alternativaProxima: RecomendacaoDoCliente["alternativaProxima"];
  if (desejados.length === 0) {
    alternativaProxima = {
      indisponivel: true,
      motivo: "Cliente não informou bairro de preferência — não há referência para medir proximidade.",
    };
  } else {
    const escolhidos = new Set(top.map((t) => t.ofertaId));
    const mesmaCidade = ofertas.find((o) => {
      if (escolhidos.has(o.id)) return false;
      const local = [...normalizarBairro(o.neighborhood), ...normalizarBairro(o.city)];
      return local.length > 0 && desejados.some((d) => local.includes(d));
    });
    alternativaProxima = mesmaCidade
      ? {
          ofertaId: mesmaCidade.id,
          nome: String(mesmaCidade.name ?? mesmaCidade.id),
          bairro: mesmaCidade.neighborhood ?? mesmaCidade.city ?? null,
          porque: "Está em bairro/cidade que o cliente pediu e ficou fora do top.",
        }
      : {
          indisponivel: true,
          motivo: `Nenhum imóvel fora do top fica nos bairros pedidos [${desejados.join(", ")}].`,
        };
  }

  return {
    clienteId: cliente.id ?? null,
    nome: cliente.name ?? null,
    recomendavel,
    motivoDaRecusa: recomendavel
      ? null
      : `Nenhum critério decisivo (${CRITERIOS.filter((c) => c.decisivo).map((c) => c.rotulo).join(", ")}) pôde ser avaliado para este cliente. Recomendar imóvel agora seria apresentar a ordem do catálogo como análise.`,
    top,
    ofertasNaoAvaliaveis: naoAvaliaveis,
    perguntasQueDestravam: perguntas,
    lacunasDoCatalogo: lacunas,
    alternativaMaisBarata,
    alternativaProxima,
    ofertasAvaliadas: ofertas.length,
    geradoEm: agora.toISOString(),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * DE `developments` + `development_typologies` PARA UMA OFERTA
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Junta empreendimento e tipologias numa oferta comparável.
 *
 * ── POR QUE A AGREGAÇÃO MORA AQUI, PURA ─────────────────────────────────────
 *
 * Porque senão ela nasceria duas vezes: uma na rota e uma no script de medição —
 * e é exatamente assim que este repositório produziu `developments` vs
 * `crm_projects`, `pipeline_history` vs `pipeline_stage_moves`. A rota e o script
 * chamam ESTA função, então não existe um segundo jeito de agregar.
 *
 * ── AS DUAS REGRAS DE AGREGAÇÃO, E POR QUE CADA UMA ─────────────────────────
 *
 * · VAGA usa o MÁXIMO das tipologias, não a soma nem a média: "este
 *   empreendimento tem alguma unidade com vaga?" é a pergunta que o cliente faz.
 *   Somar 6 tipologias daria "6 vagas", que não existe em unidade nenhuma.
 * · ESTOQUE usa a SOMA — e null se TODAS forem null. `sum` de nulos em
 *   JavaScript daria 0, e `0 disponível` é uma afirmação FORTE e falsa: diria
 *   "esgotado" onde o certo é "não se sabe". Medido: 6 de 6 tipologias têm
 *   `units_available` nulo, então este é o caminho que o dado de hoje percorre.
 */
export function agregarOfertas(
  desenvolvimentos: ReadonlyArray<Record<string, unknown>>,
  tipologias: ReadonlyArray<Record<string, unknown>>,
  /**
   * A REGRA DE PAGAMENTO ativa da organização, ou null quando não há nenhuma.
   *
   * Aceita `boolean` só para não quebrar chamador antigo: `true` significa
   * "existe fluxo declarado" SEM números, e nesse caso entrada e renda continuam
   * como lacuna de catálogo — que é a resposta correta, porque sem percentual e
   * sem parcelas não há o que comparar.
   */
  regra: { down_payment_percent?: number | null; installments_count?: number | null } | boolean | null,
): OfertaParaMatching[] {
  const temRegraDePagamento = Boolean(regra);
  const entradaPercentual = typeof regra === "object" && regra ? numero(regra.down_payment_percent) : null;
  const parcelas = typeof regra === "object" && regra ? numero(regra.installments_count) : null;
  return desenvolvimentos.map((d) => {
    const minhas = tipologias.filter((t) => t.development_id === d.id);
    const valores = (campo: string) =>
      minhas.map((t) => numero(t[campo])).filter((v): v is number => v !== null);

    const vagas = valores("parking_spaces");
    const estoque = valores("units_available");
    const precoDe = valores("price_from");
    const precoAte = valores("price_to");
    const areas = valores("private_area");
    const dorms = valores("bedrooms");

    return {
      id: String(d.id),
      name: (d.name as string | null) ?? null,
      neighborhood: (d.neighborhood as string | null) ?? null,
      city: (d.city as string | null) ?? null,
      latitude: (d.latitude as number | null) ?? null,
      longitude: (d.longitude as number | null) ?? null,
      market_segment: (d.market_segment as string | null) ?? null,
      product_type: (d.product_type as string | null) ?? null,
      // O empreendimento manda; a tipologia só entra onde ele é omisso.
      bedrooms_min: (d.bedrooms_min as number | null) ?? (dorms.length ? Math.min(...dorms) : null),
      bedrooms_max: (d.bedrooms_max as number | null) ?? (dorms.length ? Math.max(...dorms) : null),
      private_area_min: numero(d.private_area_min) ?? (areas.length ? Math.min(...areas) : null),
      private_area_max: numero(d.private_area_max) ?? (areas.length ? Math.max(...areas) : null),
      price_min: numero(d.price_min) ?? (precoDe.length ? Math.min(...precoDe) : null),
      price_max: numero(d.price_max) ?? (precoAte.length ? Math.max(...precoAte) : null),
      sales_cycle_status: (d.sales_cycle_status as string | null) ?? null,
      delivery_date: (d.delivery_date as string | null) ?? null,
      updated_at: (d.updated_at as string | null) ?? null,
      parking_spaces_max: vagas.length ? Math.max(...vagas) : null,
      units_available: estoque.length ? estoque.reduce((s, v) => s + v, 0) : null,
      tem_regra_de_pagamento: temRegraDePagamento,
      entrada_percentual: entradaPercentual,
      parcelas,
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * O DIAGNÓSTICO DA CARTEIRA — a medição que justifica (ou não) a frente
 * ──────────────────────────────────────────────────────────────────────────── */

export type DiagnosticoDaCarteira = {
  clientes: number;
  comRecomendacao: number;
  semRecomendacao: number;
  /** Fração de clientes para quem o motor consegue recomendar HOJE. */
  proporcaoComRecomendacao: number;
  /** As perguntas que destravam mais clientes, em ordem. */
  perguntasMaisFrequentes: Array<{ chave: ChaveDeCriterio; rotulo: string; clientes: number; pergunta: string }>;
  lacunasDoCatalogo: Array<{ chave: ChaveDeCriterio; rotulo: string; clientes: number; preencher: string }>;
};

/**
 * Roda o motor na carteira inteira e conta. Existe para a frente poder RESPONDER
 * "para quantos clientes isto funciona hoje?" com número, não com adjetivo.
 */
export function diagnosticarCarteira(
  clientes: ReadonlyArray<ClienteParaMatching>,
  ofertas: ReadonlyArray<OfertaParaMatching>,
  opcoes: { agora?: Date } = {},
): DiagnosticoDaCarteira {
  const porPergunta = new Map<ChaveDeCriterio, number>();
  const porLacuna = new Map<ChaveDeCriterio, number>();
  let comRecomendacao = 0;

  for (const cliente of clientes) {
    const r = recomendarPara(cliente, ofertas, opcoes);
    if (r.recomendavel) comRecomendacao += 1;
    for (const p of r.perguntasQueDestravam) {
      porPergunta.set(p.chave, (porPergunta.get(p.chave) ?? 0) + 1);
    }
    for (const l of r.lacunasDoCatalogo) {
      porLacuna.set(l.chave, (porLacuna.get(l.chave) ?? 0) + 1);
    }
  }

  // Mais clientes primeiro; empate desce para o peso do critério, que vem do
  // catálogo — não de uma cópia carregada dentro do objeto de saída.
  const porQuantosDestrava = (a: { chave: ChaveDeCriterio; clientes: number }, b: { chave: ChaveDeCriterio; clientes: number }) =>
    b.clientes - a.clientes || (POR_CHAVE.get(b.chave)?.peso ?? 0) - (POR_CHAVE.get(a.chave)?.peso ?? 0);

  return {
    clientes: clientes.length,
    comRecomendacao,
    semRecomendacao: clientes.length - comRecomendacao,
    proporcaoComRecomendacao: clientes.length === 0 ? 0 : comRecomendacao / clientes.length,
    perguntasMaisFrequentes: [...porPergunta.entries()]
      .map(([chave, quantos]) => {
        const def = POR_CHAVE.get(chave)!;
        return { chave, rotulo: def.rotulo, clientes: quantos, pergunta: def.pergunta };
      })
      .sort(porQuantosDestrava),
    lacunasDoCatalogo: [...porLacuna.entries()]
      .map(([chave, quantos]) => {
        const def = POR_CHAVE.get(chave)!;
        return { chave, rotulo: def.rotulo, clientes: quantos, preencher: def.preencher };
      })
      .sort(porQuantosDestrava),
  };
}

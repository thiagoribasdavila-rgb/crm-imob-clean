/**
 * AS REGRAS QUE IMPEDEM A SALA DE COMANDO DE DESENHAR FALHA DE LEITURA COMO SAÚDE.
 *
 * ── O QUE FOI MEDIDO EM 02/08/2026, NA ORGANIZAÇÃO REAL ────────────────────
 *
 * A rota `app/api/v1/analytics/sala-de-comando/route.ts` faz SETE leituras.
 * Três delas não tinham conferência de erro nenhuma:
 *
 *   `pipeline_stage_settings` → `.data ?? []` cai em `mergePipelineStageSettings`,
 *      que devolve a régua PADRÃO. Nesta organização a régua padrão e a
 *      configurada são idênticas — o funil ficaria igual, e ninguém veria. É a
 *      pior forma da falha: a que só aparece na empresa que configurou diferente.
 *
 *   `marketing_spend` → `importado: rows.length > 0` vira FALSE quando a leitura
 *      falha, e a tela imprime "Nenhum investimento importado ainda. O worker
 *      investimento-de-midia grava o gasto..." — acusando o worker por um erro
 *      de banco. Hoje a tabela tem 102 linhas: a frase seria falsa em duas
 *      camadas, e mandaria alguém depurar o worker certo pelo motivo errado.
 *
 *   `lead_attribution_touches` → mesma história do lado das leads atribuídas.
 *
 * E `pipeline_stage_moves`, que tinha flag para as saídas e para a frase da
 * etapa vazia, continuava publicando `movimentosNaJanelaAnterior: 0` com a
 * frase "Na janela anterior não há um único movimento registrado" — uma
 * afirmação sobre o banco feita sem ter conseguido ler o banco.
 *
 * ── A REGRA, EM UMA LINHA ──────────────────────────────────────────────────
 *
 * "Não há trabalho" e "não consegui ler" são estados DIFERENTES e mandam fazer
 * coisas OPOSTAS: o primeiro manda esperar, o segundo manda ir consertar. Zero
 * é resposta; ausência de leitura é pergunta. Este módulo é onde essa diferença
 * vira tipo, para os contratos poderem EXECUTAR a regra em vez de procurá-la
 * com grep.
 *
 * Módulo PURO: sem banco, sem rede, sem `server-only`, sem `@/` (o alias não
 * existe sob `node --test`). Contrato: tests/contracts/sala-de-comando-nao-inventa-zero.test.mjs
 */

export type ErroDeLeitura = { message?: string; code?: string } | null | undefined;

export type LeituraDeTabela = {
  /** A tabela, com o nome que aparece no banco — é por ele que se depura. */
  fonte: string;
  /** O que a tela PERDE quando esta leitura falha. Sem isto o roster é enfeite. */
  serve: string;
  erro: ErroDeLeitura;
  /** true quando o PostgREST cortou a resposta: medida parcial não é medida. */
  truncada?: boolean;
};

export type LeituraDeclarada = {
  fonte: string;
  serve: string;
  /** Só é `true` quando a leitura respondeu POR INTEIRO. */
  medida: boolean;
  falhou: boolean;
  truncada: boolean;
  /** `null` apenas quando `medida` é true. Painel sem frase parece quebrado. */
  porque: string | null;
};

export type RosterDeLeituras = {
  fontes: LeituraDeclarada[];
  medidas: number;
  total: number;
  todasMedidas: boolean;
  naoMedidas: string[];
  resumo: string;
};

/**
 * O ROSTER — quantas das leituras desta tela foram de fato MEDIDAS.
 *
 * Existe por causa do chip "5/5 operacionais" da sala: um contador de saúde só
 * pode dizer "N de N" quando as N foram medidas. Contar "N de N" sobre leituras
 * que ninguém conferiu é transformar ausência de verificação em verde.
 */
export function declaraLeituras(leituras: LeituraDeTabela[]): RosterDeLeituras {
  const fontes: LeituraDeclarada[] = leituras.map((leitura) => {
    const falhou = Boolean(leitura.erro);
    const truncada = Boolean(leitura.truncada);
    return {
      fonte: leitura.fonte,
      serve: leitura.serve,
      medida: !falhou && !truncada,
      falhou,
      truncada,
      porque: falhou
        ? `Não foi possível ler ${leitura.fonte}${leitura.erro?.message ? ` (${leitura.erro.message})` : ""}. ${leitura.serve} está INDISPONÍVEL — não é zero.`
        : truncada
          ? `A leitura de ${leitura.fonte} foi cortada pelo teto de páginas. ${leitura.serve} está sobre AMOSTRA, não sobre a base inteira.`
          : null,
    };
  });

  const medidas = fontes.filter((f) => f.medida).length;
  const naoMedidas = fontes.filter((f) => !f.medida).map((f) => f.fonte);

  return {
    fontes,
    medidas,
    total: fontes.length,
    todasMedidas: medidas === fontes.length,
    naoMedidas,
    resumo:
      medidas === fontes.length
        ? `${medidas} de ${fontes.length} leituras medidas por inteiro.`
        : `${medidas} de ${fontes.length} leituras medidas. ${naoMedidas.join(", ")} não respondeu${naoMedidas.length > 1 ? "ram" : ""} por inteiro — o que depende dessas leituras está indisponível, não zerado.`,
  };
}

/**
 * ── A COORTE DE ENTRADA: O TOPO DE VERDADE ─────────────────────────────────
 *
 * O funil imprimia "% do topo" dividindo cada etapa por `porEtapa.get("novo")`
 * — o ESTOQUE PARADO na primeira coluna AGORA. Medido em 02/08/2026 na
 * organização real:
 *
 *   novo 34 · contato 25 · qualificação 8 · visita 0 · proposta 0 · contrato 0
 *   perdido 419 · ganho 2 · comprou_outro 2 — 489 leads no total.
 *
 * Contato pelo estoque:  25 / 34  = 73,5% "do topo".
 * Contato pela coorte:   25 / 489 =  5,1%.
 *
 * Quatorze vezes. E na direção que ESCONDE: 73,5% descreve uma operação que
 * leva três de cada quatro leads ao primeiro contato; a real leva uma de cada
 * vinte. O denominador antigo encolhe conforme as leads AVANÇAM ou são
 * DESCARTADAS — ou seja, o número sobe justamente quando a operação piora, e
 * chegaria a 100% no dia em que a coluna "novo" esvaziasse.
 *
 * Coorte = quem ENTROU no funil. Toda lead entra por "novo": a entrada é a
 * linha existir, e por isso a coorte é calculável sem depender de histórico —
 * `created_at` não tem um único nulo nesta base (medido: 0 de 489).
 */
export type CoorteDeEntrada = {
  /** Quantas leads entraram no funil. É este o topo. */
  entradas: number;
  /** Entraram sem carimbo de entrada — contam na coorte, mas não na janela. */
  semDataDeEntrada: number;
  de: string | null;
  ate: string | null;
  rotulo: string;
};

export function coorteDeEntrada(leads: Array<{ created_at?: string | null }>): CoorteDeEntrada {
  let de: string | null = null;
  let ate: string | null = null;
  let semData = 0;
  for (const lead of leads) {
    const carimbo = typeof lead.created_at === "string" && lead.created_at ? lead.created_at : null;
    if (!carimbo) {
      semData += 1;
      continue;
    }
    if (!de || carimbo < de) de = carimbo;
    if (!ate || carimbo > ate) ate = carimbo;
  }
  return {
    entradas: leads.length,
    semDataDeEntrada: semData,
    de,
    ate,
    rotulo: "leads que entraram no funil",
  };
}

/** Uma casa decimal, ou `null` quando não há coorte para dividir. */
export function razaoSobreCoorte(quantidade: number, coorte: number): number | null {
  if (!(coorte > 0)) return null;
  return Math.round((quantidade / coorte) * 1000) / 10;
}

export type EtapaConfigurada = { key: string; label: string };

export type EtapaMedida = {
  chave: string;
  rotulo: string;
  quantidade: number;
  /** `null` quando o histórico de movimentação não pôde ser lido. NUNCA 0. */
  jaPassaram: number | null;
  jaPassaramMensuravel: boolean;
  /** Proporção sobre a COORTE DE ENTRADA — o topo real do funil. */
  percentualDoTopo: number | null;
  denominador: { chave: string; leads: number; rotulo: string };
  porqueVazia: string | null;
};

/**
 * O funil inteiro, com o denominador na cara e sem zero de leitura.
 *
 * `jaPassaram` sai `null` — e não 0 — quando `pipeline_stage_moves` não pôde ser
 * lida. Zero ali significa "ninguém nunca alcançou esta etapa", que é o
 * diagnóstico mais grave que este painel sabe dar; publicá-lo por falha de
 * conexão é acusar a operação de um crime que ela pode não ter cometido.
 */
export function montaEtapasDoFunil(entrada: {
  etapas: EtapaConfigurada[];
  quantidadePorEtapa: Map<string, number>;
  jaPassaramPorEtapa: Map<string, number>;
  coorte: CoorteDeEntrada;
  movimentoMensuravel: boolean;
  /** Data já formatada (dd/mm) do início do registro, ou `null`. */
  desdeQuando: string | null;
  emNovo: number;
  totalDeLeads: number;
}): EtapaMedida[] {
  const { coorte, movimentoMensuravel, desdeQuando, emNovo, totalDeLeads } = entrada;
  const denominador = {
    chave: "coorte-de-entrada",
    leads: coorte.entradas,
    rotulo: coorte.rotulo,
  };

  return entrada.etapas.map((etapa) => {
    const quantidade = entrada.quantidadePorEtapa.get(etapa.key) ?? 0;
    const passaram = movimentoMensuravel ? entrada.jaPassaramPorEtapa.get(etapa.key) ?? 0 : null;

    return {
      chave: etapa.key,
      rotulo: etapa.label,
      quantidade,
      jaPassaram: passaram,
      jaPassaramMensuravel: movimentoMensuravel,
      percentualDoTopo: razaoSobreCoorte(quantidade, coorte.entradas),
      denominador,
      // Três frases, três diagnósticos diferentes. A do meio é a que faltava.
      porqueVazia:
        quantidade > 0
          ? null
          : passaram === null
            ? "Nenhuma lead nesta etapa agora. Não foi possível ler o histórico de movimentação, então não dá para dizer se alguma já passou por aqui."
            : passaram > 0
              ? `Nenhuma lead aqui agora, mas ${passaram} já passaram por esta etapa${desdeQuando ? ` desde ${desdeQuando}` : ""}. A etapa esvaziou — o funil vazou aqui, não deixou de chegar.`
              : `Nenhuma lead aqui, e nenhuma passou por esta etapa${desdeQuando ? ` desde ${desdeQuando}, quando o registro de movimentação começou` : ""}. ${emNovo} das ${totalDeLeads} ainda estão em "novo".`,
    };
  });
}

/**
 * ── O DINHEIRO: "NÃO IMPORTADO" É DIAGNÓSTICO, E PRECISA SER VERDADE ───────
 *
 * A tela tem uma frase pronta para `importado: false` que manda olhar o worker
 * `investimento-de-midia`. Ela é útil — desde que a leitura tenha ACONTECIDO.
 * Com a leitura falhando, ela vira uma acusação contra o componente errado.
 */
export function medidaDoInvestimento(entrada: {
  gastoErro: ErroDeLeitura;
  atribuicaoErro: ErroDeLeitura;
  linhasDeGasto: number;
}): { mensuravel: boolean; importado: boolean; porqueIndisponivel: string | null } {
  const quebradas: string[] = [];
  if (entrada.gastoErro) quebradas.push("marketing_spend (o gasto)");
  if (entrada.atribuicaoErro) quebradas.push("lead_attribution_touches (a origem das leads)");

  if (quebradas.length > 0) {
    return {
      mensuravel: false,
      importado: false,
      porqueIndisponivel:
        `Não foi possível ler ${quebradas.join(" nem ")}. Investimento, custo por lead e retorno estão INDISPONÍVEIS — não são zero, `
        + "e a causa não é o worker de importação: é a leitura que não respondeu.",
    };
  }

  return {
    mensuravel: true,
    importado: entrada.linhasDeGasto > 0,
    porqueIndisponivel: null,
  };
}

/**
 * ── O DELTA DE ESTADO: NÃO AFIRME SOBRE O BANCO QUE VOCÊ NÃO LEU ───────────
 *
 * A frase publicada dizia "Na janela anterior não há um único movimento
 * registrado, e nenhum backfill resolve: o passado não foi registrado." É uma
 * afirmação forte, correta hoje — e feita com `movimentosNaJanelaAnterior = 0`,
 * que é exatamente o valor que sai quando a leitura falha.
 */
export function comparacaoDeEstado(entrada: {
  movimentoMensuravel: boolean;
  movimentosNaJanelaAnterior: number;
  /** Data já formatada (dd/mm/aaaa) do início do registro, ou `null`. */
  inicioFormatado: string | null;
}): {
  mensuravel: boolean;
  baseDeComparacaoExiste: boolean;
  movimentosNaJanelaAnterior: number | null;
  porqueIndisponivel: string;
} {
  if (!entrada.movimentoMensuravel) {
    return {
      mensuravel: false,
      // Sem leitura não há base de comparação PROVADA — e delta só nasce de prova.
      baseDeComparacaoExiste: false,
      movimentosNaJanelaAnterior: null,
      porqueIndisponivel:
        "Não foi possível ler o registro de movimentação (pipeline_stage_moves). "
        + "Não dá para dizer se existe base de comparação com 30 dias atrás: isto é leitura indisponível, não ausência de histórico.",
    };
  }

  const quantos = entrada.movimentosNaJanelaAnterior;
  return {
    mensuravel: true,
    baseDeComparacaoExiste: quantos > 0,
    movimentosNaJanelaAnterior: quantos,
    porqueIndisponivel:
      quantos > 0
        ? `O registro de movimentação já cobre a janela anterior (${quantos} movimentos), mas reconstruir a etapa de cada lead naquele dia ainda não é feito por esta rota. Enquanto não for, o delta destes indicadores fica declarado, não estimado.`
        : `Comparar com 30 dias atrás exige saber em que etapa cada lead estava naquele dia, e o registro de movimentação${entrada.inicioFormatado ? ` começou em ${entrada.inicioFormatado}` : " ainda não começou"}. Na janela anterior não há um único movimento registrado, e nenhum backfill resolve: o passado não foi registrado.`,
  };
}

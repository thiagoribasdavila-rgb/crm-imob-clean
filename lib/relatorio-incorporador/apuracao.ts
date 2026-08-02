/**
 * RELATÓRIO DO INCORPORADOR — a conta, separada da tela e do banco.
 *
 * Tudo aqui é puro: entra número, sai número. A rota alimenta, a tela desenha.
 * Se a tela pudesse calcular, existiriam duas contas para o mesmo relatório e um
 * dia elas discordariam na frente do parceiro que paga a mídia.
 *
 * ── A REGRA QUE MANDA NESTE ARQUIVO ────────────────────────────────────────
 *
 * `null` quer dizer "não sei". `0` quer dizer "medi, e deu zero". As duas coisas
 * são desenhadas diferente e NUNCA se convertem uma na outra. Uma célula em
 * branco lê-se como zero, e zero lê-se como "essa campanha não trouxe ninguém" —
 * quando a verdade pode ser "trouxe, e nós é que não sabemos ligar".
 *
 * ── O FATO DE NEGÓCIO QUE ESTE MÓDULO EXISTE PARA NÃO ESCONDER ─────────────
 *
 * MEDIDO na produção em 02/08/2026 (projeto pozbrcsfthnhmnebfoxv):
 *
 *     7 campanhas com gasto ... R$ 3.845,19 ... 0 leads atribuídas
 *     1 campanha com leads .... 24 leads ...... 0 linha de gasto
 *
 * Os dois conjuntos são DISJUNTOS: nenhuma campanha tem as duas pontas. O
 * dinheiro saiu de uma conta de anúncio e as leads entraram por outra. Logo,
 * custo por lead não é computável para NENHUMA campanha desta base — nem para a
 * que tem lead. Este arquivo devolve `null` com o motivo escrito, e cabe à tela
 * dizer a frase.
 */

/** Traço, e não vazio: célula em branco lê-se como zero. */
export const TRACO = "—";

/**
 * As etapas do funil, na ordem em que o negócio as percorre.
 *
 * `novo` NÃO entra. MEDIDO em 02/08/2026: `pipeline_stage_moves` tem 2 linhas
 * com `to_stage='novo'` para 444 leads com movimento — a lead nasce nova por
 * criação, não por movimentação, e uma etapa com 0,5% de cobertura desenharia
 * um funil que começa vazio. O denominador do funil é a lead criada na janela.
 */
export const ETAPAS_DO_FUNIL = [
  { chave: "contato", rotulo: "Contato" },
  { chave: "qualificacao", rotulo: "Qualificação" },
  { chave: "visita", rotulo: "Visita" },
  { chave: "proposta", rotulo: "Proposta" },
  { chave: "contrato", rotulo: "Contrato" },
  { chave: "ganho", rotulo: "Ganho" },
] as const;

export type ChaveDeEtapa = (typeof ETAPAS_DO_FUNIL)[number]["chave"];

/** Saídas do funil. Não são etapas: são o fim da linha. */
export const ETAPAS_DE_SAIDA = ["perdido", "comprou_outro"] as const;

/**
 * Abaixo de 3 observações não existe mediana — existe o ponto, ou a média de
 * dois. Imprimir "1.619 min" apoiado em duas leads convida o gestor a tratar
 * aquilo como típico, e não é. A amostra viaja SEMPRE junto do valor para que a
 * tela possa mostrar o tamanho mesmo quando não mostra o número.
 */
export const AMOSTRA_MINIMA_PARA_MEDIANA = 3;

export type Mediana = {
  /** Minutos. `null` quando a amostra não sustenta uma mediana. */
  valor: number | null;
  amostra: number;
  suficiente: boolean;
};

export function medianaEmMinutos(intervalosEmMs: number[]): Mediana {
  // Intervalo negativo é sujeira de dado (movimento anterior à criação da lead),
  // não velocidade sobre-humana. Sai da conta em vez de puxar a mediana.
  const validos = intervalosEmMs.filter((ms) => Number.isFinite(ms) && ms >= 0);
  const amostra = validos.length;
  if (amostra < AMOSTRA_MINIMA_PARA_MEDIANA) return { valor: null, amostra, suficiente: false };
  const ordenados = [...validos].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const bruto = ordenados.length % 2
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
  return { valor: Math.round(bruto / 60_000), amostra, suficiente: true };
}

/** Percentual 0–100 com uma casa, ou `null` quando não há denominador. */
export function taxa(numerador: number, denominador: number): number | null {
  if (!Number.isFinite(denominador) || denominador <= 0) return null;
  return Math.round((numerador / denominador) * 1000) / 10;
}

/**
 * O gasto de uma campanha só é um NÚMERO quando existe linha em
 * `marketing_spend`. Sem linha, é `null` — "a conta de anúncio não respondeu",
 * que é diferente de "a campanha não gastou".
 */
export type Gasto = { valor: number | null; linhas: number };

export type EstadoDeAtribuicao =
  | "completa"
  | "gasto_sem_atribuicao"
  | "lead_sem_gasto"
  | "sem_dado";

export function classificarAtribuicao(gasto: Gasto, leadsAtribuidas: number): EstadoDeAtribuicao {
  const temGasto = gasto.linhas > 0 && (gasto.valor ?? 0) > 0;
  if (temGasto && leadsAtribuidas > 0) return "completa";
  if (temGasto) return "gasto_sem_atribuicao";
  if (leadsAtribuidas > 0) return "lead_sem_gasto";
  return "sem_dado";
}

export const ROTULO_DE_ATRIBUICAO: Record<EstadoDeAtribuicao, string> = {
  completa: "Atribuída",
  gasto_sem_atribuicao: "Sem atribuição",
  lead_sem_gasto: "Sem gasto registrado",
  sem_dado: "Sem dado",
};

/**
 * A frase de uma linha que a tela mostra ao lado do estado. Ela existe porque
 * "sem atribuição" sozinho ainda pode ser lido como "não funcionou".
 */
export const EXPLICACAO_DE_ATRIBUICAO: Record<EstadoDeAtribuicao, string> = {
  completa: "gasto e leads chegam pela mesma campanha",
  gasto_sem_atribuicao: "houve gasto e nenhuma lead carrega esta campanha — pode ter trazido, o CRM é que não sabe ligar",
  lead_sem_gasto: "as leads apontam esta campanha, mas nenhuma linha de gasto chegou por ela",
  sem_dado: "nem gasto nem lead nesta janela",
};

export type ValorComMotivo = { valor: number | null; motivo: string | null };

/**
 * Custo por lead. Exige as DUAS pontas medidas — sem uma delas, a resposta é o
 * motivo, nunca um número.
 */
export function custoPorLead(gasto: Gasto, leadsAtribuidas: number): ValorComMotivo {
  if (gasto.linhas === 0 || gasto.valor === null) {
    return { valor: null, motivo: "gasto não medido nesta campanha" };
  }
  if (gasto.valor === 0) return { valor: null, motivo: "gasto medido é zero na janela" };
  if (leadsAtribuidas === 0) return { valor: null, motivo: "nenhuma lead atribuída a esta campanha" };
  return { valor: gasto.valor / leadsAtribuidas, motivo: null };
}

/** Custo por clique. */
export function custoPorClique(gasto: Gasto, cliques: number): ValorComMotivo {
  if (gasto.valor === null) return { valor: null, motivo: "gasto não medido" };
  if (cliques <= 0) return { valor: null, motivo: "nenhum clique registrado" };
  return { valor: gasto.valor / cliques, motivo: null };
}

/** Custo por mil impressões. */
export function custoPorMil(gasto: Gasto, impressoes: number): ValorComMotivo {
  if (gasto.valor === null) return { valor: null, motivo: "gasto não medido" };
  if (impressoes <= 0) return { valor: null, motivo: "nenhuma impressão registrada" };
  return { valor: (gasto.valor / impressoes) * 1000, motivo: null };
}

/** Taxa de clique, em % com duas casas — CTR de mídia costuma viver abaixo de 3%. */
export function taxaDeClique(cliques: number, impressoes: number): number | null {
  if (impressoes <= 0) return null;
  return Math.round((cliques / impressoes) * 10000) / 100;
}

export type LinhaDeCampanha = {
  id: string;
  nome: string;
  plataforma: string | null;
  status: string | null;
  idExterno: string | null;
  gasto: Gasto;
  diasComGasto: number;
  primeiroDiaDeGasto: string | null;
  ultimoDiaDeGasto: string | null;
  impressoes: number;
  cliques: number;
  /** `null` quando a plataforma nunca informou a contagem dela. */
  leadsDaPlataforma: number | null;
  leadsAtribuidas: number;
  leadsContatadas: number;
  atribuicao: EstadoDeAtribuicao;
  cpl: ValorComMotivo;
  cpc: ValorComMotivo;
  cpm: ValorComMotivo;
  ctr: number | null;
  /** Quantas das leads atribuídas chegaram a cada etapa. */
  funil: Record<ChaveDeEtapa, number>;
  saidas: number;
  /** Empreendimentos alcançados pelas leads desta campanha. */
  empreendimentos: string[];
};

/**
 * O número que decide a tela: quanto dinheiro está em campanha que o CRM não
 * consegue ligar a nenhuma lead. Enquanto ele for maior que zero, todo custo por
 * lead desta base é uma conta sobre denominador furado.
 */
export type ResumoDeAtribuicao = {
  gastoTotal: number | null;
  gastoSemAtribuicao: number;
  campanhasComGasto: number;
  campanhasSemAtribuicao: number;
  campanhasComAtribuicaoCompleta: number;
  leadsAtribuidas: number;
  /** % do gasto medido que está sem atribuição. */
  parcelaSemAtribuicao: number | null;
};

export function resumirAtribuicao(campanhas: LinhaDeCampanha[]): ResumoDeAtribuicao {
  const comGasto = campanhas.filter((c) => c.gasto.linhas > 0 && (c.gasto.valor ?? 0) > 0);
  const gastoTotal = comGasto.length
    ? comGasto.reduce((soma, c) => soma + (c.gasto.valor ?? 0), 0)
    : null;
  const gastoSemAtribuicao = campanhas
    .filter((c) => c.atribuicao === "gasto_sem_atribuicao")
    .reduce((soma, c) => soma + (c.gasto.valor ?? 0), 0);
  return {
    gastoTotal,
    gastoSemAtribuicao,
    campanhasComGasto: comGasto.length,
    campanhasSemAtribuicao: campanhas.filter((c) => c.atribuicao === "gasto_sem_atribuicao").length,
    campanhasComAtribuicaoCompleta: campanhas.filter((c) => c.atribuicao === "completa").length,
    leadsAtribuidas: campanhas.reduce((soma, c) => soma + c.leadsAtribuidas, 0),
    parcelaSemAtribuicao:
      gastoTotal && gastoTotal > 0 ? Math.round((gastoSemAtribuicao / gastoTotal) * 1000) / 10 : null,
  };
}

export type EtapaApurada = {
  chave: ChaveDeEtapa;
  rotulo: string;
  /** Leads da janela que chegaram a esta etapa ao menos uma vez. */
  leads: number;
  /** % sobre as leads que ENTRARAM (denominador do topo). */
  shareDoTopo: number | null;
  /** % sobre a etapa anterior — a passagem, que é o que se otimiza. */
  passagem: number | null;
  /**
   * Passagem acima de 100% não é erro de conta: é lead que PULOU a etapa
   * anterior. Medido em 02/08/2026, "proposta" tem 3 leads e "visita" tem 2 —
   * alguém propôs sem registrar visita. O sinalizador existe para a tela dizer
   * isso, em vez de imprimir "150%" e parecer quebrada.
   */
  puloDeEtapa: boolean;
  /** Tempo entre a criação da lead e a primeira chegada nesta etapa. */
  tempoAteChegar: Mediana;
  /** Tempo entre esta etapa e a próxima etapa alcançada. */
  tempoAteAvancar: Mediana;
};

export type FunilApurado = {
  entraram: number;
  etapas: EtapaApurada[];
  /** Leads que saíram (perdido / comprou_outro). */
  sairam: number;
  /** Leads sem NENHUMA movimentação registrada — não estão paradas, estão mudas. */
  semMovimento: number;
  /** Intervalos negativos descartados: movimento anterior à criação da lead. */
  intervalosDescartados: number;
  /**
   * Leads criadas ANTES da primeira linha do livro de movimentação. Para elas o
   * intervalo "criação → etapa" não é latência de atendimento: é a distância até
   * o dia em que a medição começou a existir. Ficam fora de `tempoAteChegar` e
   * DENTRO das contagens — não movimentar é diferente de não ter sido medido, e
   * as duas coisas precisam aparecer.
   */
  anterioresAoRegistro: number;
  /** Leads elegíveis ao cálculo de tempo desde a criação. */
  elegiveisParaTempo: number;
};

/** Uma lead, reduzida ao que o funil precisa saber. */
export type LeadParaFunil = {
  id: string;
  criadaEm: number;
  /** Primeiro instante em que a lead chegou a cada etapa. */
  chegouEm: Partial<Record<ChaveDeEtapa, number>>;
  saiu: boolean;
  temMovimento: boolean;
};

/**
 * @param registroDesde  instante da primeira linha de `pipeline_stage_moves`.
 *   `null` desliga o recorte (base sem livro de movimentação).
 */
export function apurarFunil(leads: LeadParaFunil[], registroDesde: number | null): FunilApurado {
  const entraram = leads.length;
  const elegiveis = registroDesde === null ? leads : leads.filter((l) => l.criadaEm >= registroDesde);
  let intervalosDescartados = 0;

  const etapas: EtapaApurada[] = ETAPAS_DO_FUNIL.map((etapa, indice) => {
    const alcancaram = leads.filter((l) => l.chegouEm[etapa.chave] !== undefined);

    const desdeACriacao = elegiveis
      .filter((l) => l.chegouEm[etapa.chave] !== undefined)
      .map((l) => (l.chegouEm[etapa.chave] as number) - l.criadaEm);
    intervalosDescartados += desdeACriacao.filter((ms) => ms < 0).length;

    // "Até avançar" olha a PRÓXIMA etapa alcançada, não a próxima da lista: a
    // lead que pula qualificação e vai direto para visita avançou, e exigir a
    // etapa vizinha a deixaria de fora da conta.
    const ateAvancar = alcancaram.flatMap((l) => {
      const agora = l.chegouEm[etapa.chave] as number;
      const seguintes = ETAPAS_DO_FUNIL.slice(indice + 1)
        .map((proxima) => l.chegouEm[proxima.chave])
        .filter((instante): instante is number => instante !== undefined && instante >= agora);
      return seguintes.length ? [Math.min(...seguintes) - agora] : [];
    });

    const anterior = indice === 0 ? entraram : leads.filter(
      (l) => l.chegouEm[ETAPAS_DO_FUNIL[indice - 1].chave] !== undefined,
    ).length;

    return {
      chave: etapa.chave,
      rotulo: etapa.rotulo,
      leads: alcancaram.length,
      shareDoTopo: taxa(alcancaram.length, entraram),
      passagem: taxa(alcancaram.length, anterior),
      puloDeEtapa: indice > 0 && alcancaram.length > anterior,
      tempoAteChegar: medianaEmMinutos(desdeACriacao),
      tempoAteAvancar: medianaEmMinutos(ateAvancar),
    };
  });

  return {
    entraram,
    etapas,
    sairam: leads.filter((l) => l.saiu).length,
    semMovimento: leads.filter((l) => !l.temMovimento).length,
    intervalosDescartados,
    anterioresAoRegistro: entraram - elegiveis.length,
    elegiveisParaTempo: elegiveis.length,
  };
}

export type DiaDaSerie = {
  dia: string;
  /**
   * `null` quando o dia está FORA da cobertura do feed de gasto — a conta de
   * anúncio não respondeu por ele, e isso não é "gastou zero". Dentro da
   * cobertura, um dia sem linha é `0` de verdade.
   *
   * A diferença tem consequência direta no gráfico: a janela padrão é de 90
   * dias e o feed cobre 31 (01–31/07/2026, medido). Sem esta distinção, 59 dias
   * apareceriam como "gasto zero" e o relatório afirmaria algo que ninguém
   * mediu.
   */
  gasto: number | null;
  /** O dia está dentro do intervalo que o feed de gasto cobre. */
  gastoMedido: boolean;
  impressoes: number;
  cliques: number;
  /** Leads que entraram pelo canal pago naquele dia. */
  leadsDeMidia: number;
  /** Leads que entraram por importação de planilha — volume que NÃO é mídia. */
  leadsImportadas: number;
  /** Demais entradas (indicação, parceiro, cadastro manual). */
  leadsOutras: number;
};

/**
 * O que só a linha do tempo responde — e por isso o gráfico existe.
 *
 * Uma tabela de totais consegue dizer "gastou X, entraram Y". Ela NÃO consegue
 * dizer em que dias o dinheiro saiu sem ninguém entrar, nem em que dias entrou
 * gente sem dinheiro ter saído. Essas duas formas são as duas metades do buraco
 * de atribuição, e só aparecem quando os dois eixos dividem o mesmo tempo.
 */
export type LeituraDaSerie = {
  /** Dias medidos pelo feed de gasto — o denominador honesto das duas contas abaixo. */
  diasMedidos: number;
  diasComGastoESemLead: number;
  gastoEmDiasSemLead: number;
  diasComLeadESemGasto: number;
  leadsEmDiasSemGasto: number;
  /** Dias fora da cobertura do feed em que entrou lead de mídia — nem gasto nem ausência de gasto. */
  diasForaDaCoberturaComLead: number;
  leadsForaDaCobertura: number;
  maiorDiaDeImportacao: { dia: string; leads: number } | null;
  gastoTotal: number | null;
  leadsDeMidiaTotal: number;
  coberturaDoGasto: { de: string; ate: string } | null;
};

export function lerSerie(serie: DiaDaSerie[]): LeituraDaSerie {
  const medidos = serie.filter((d) => d.gastoMedido);
  const comGasto = medidos.filter((d) => (d.gasto ?? 0) > 0);
  const gastoSemLead = comGasto.filter((d) => d.leadsDeMidia === 0);
  // Só entra aqui dia MEDIDO: "entrou lead e não saiu dinheiro" exige saber que
  // não saiu dinheiro. Fora da cobertura, não se sabe.
  const semGastoComLead = medidos.filter((d) => (d.gasto ?? 0) === 0 && d.leadsDeMidia > 0);
  const foraDaCobertura = serie.filter((d) => !d.gastoMedido && d.leadsDeMidia > 0);
  const importacoes = serie.filter((d) => d.leadsImportadas > 0);
  const maior = importacoes.length
    ? importacoes.reduce((a, b) => (b.leadsImportadas > a.leadsImportadas ? b : a))
    : null;
  return {
    diasMedidos: medidos.length,
    diasComGastoESemLead: gastoSemLead.length,
    gastoEmDiasSemLead: gastoSemLead.reduce((soma, d) => soma + (d.gasto ?? 0), 0),
    diasComLeadESemGasto: semGastoComLead.length,
    leadsEmDiasSemGasto: semGastoComLead.reduce((soma, d) => soma + d.leadsDeMidia, 0),
    diasForaDaCoberturaComLead: foraDaCobertura.length,
    leadsForaDaCobertura: foraDaCobertura.reduce((soma, d) => soma + d.leadsDeMidia, 0),
    maiorDiaDeImportacao: maior ? { dia: maior.dia, leads: maior.leadsImportadas } : null,
    gastoTotal: comGasto.length ? comGasto.reduce((soma, d) => soma + (d.gasto ?? 0), 0) : null,
    leadsDeMidiaTotal: serie.reduce((soma, d) => soma + d.leadsDeMidia, 0),
    coberturaDoGasto: medidos.length
      ? { de: medidos[0].dia, ate: medidos[medidos.length - 1].dia }
      : null,
  };
}

export type LinhaDeEmpreendimento = {
  id: string;
  nome: string;
  incorporadora: string | null;
  incorporadoraId: string | null;
  cidade: string | null;
  status: string | null;
  leads: number;
  leadsContatadas: number;
  taxaDeAtendimento: number | null;
  tempoAtePrimeiroContato: Mediana;
  foraDoPrazo: number;
  funil: FunilApurado;
  /** Leads deste empreendimento que carregam campanha. */
  leadsComCampanha: number;
  /**
   * Gasto ligado a este empreendimento. `null` enquanto nenhuma campanha
   * apontar um projeto que aponte este empreendimento — e é o caso hoje.
   */
  gastoLigado: Gasto;
};

/** Dinheiro em pt-BR. Uma função só, para o relatório inteiro falar igual. */
export function dinheiro(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Duração legível. Minuto até 90, hora até 48h, depois dia — porque "5.735 min"
 * é um número que ninguém converte de cabeça, e "4 d" decide.
 */
export function duracao(minutos: number | null): string {
  if (minutos === null) return TRACO;
  // Vírgula decimal: o resto da tela já usa "1,68%" e "R$ 3.845,19", e "3.8 d"
  // no meio disso lê-se como outro sistema de números — ou, pior, como milhar.
  const comVirgula = (valor: number) =>
    valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (minutos < 90) return `${minutos.toLocaleString("pt-BR")} min`;
  const horas = minutos / 60;
  if (horas < 48) return `${comVirgula(horas)} h`;
  return `${comVirgula(horas / 24)} d`;
}

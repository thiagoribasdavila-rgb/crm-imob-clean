/**
 * GÊMEO DIGITAL DA OPERAÇÃO — representação do estado comercial e simulação de
 * cenários (frente 6.4).
 *
 * ── A LINHA QUE ESTE ARQUIVO EXISTE PARA NÃO CRUZAR ─────────────────────────
 *
 * Há duas coisas muito diferentes que uma "simulação" pode fazer, e misturá-las
 * é o único jeito de este módulo causar dano:
 *
 *   DEDUÇÃO   — aritmética sobre contagem viva. "384 leads abertos em 3 pessoas
 *               dá 128 por pessoa; em 12 daria 32." Não há previsão nenhuma
 *               aqui: é divisão. Sempre entregável.
 *
 *   PROJEÇÃO  — afirmar quanto vai ENTRAR de venda, receita ou VGV. Isso exige
 *   COMERCIAL   uma taxa de conversão OBSERVADA. Sem histórico de vendas, todo
 *               número dessa família é invenção com aparência de conta.
 *
 * Medido na base viva em 2026-07-30: 1 lead em `ganho` e ZERO com
 * `sale_value_brl` preenchido. Não existe taxa de conversão nem ticket médio
 * observado nesta operação. Portanto toda projeção comercial aqui RECUSA, por
 * construção, e a recusa é a propriedade central do módulo — não um caso de
 * borda. `projetarComercial` é o ÚNICO caminho para um número dessa família, e
 * ele não tem ramo que chute.
 *
 * A regra permanente do dono do produto, que este arquivo aplica literalmente:
 * "Não inventar preços, métricas ou informações comerciais." Número não medido
 * é `null` com motivo por extenso, nunca um valor plausível.
 *
 * ── E A OUTRA METADE DO FILTRO ──────────────────────────────────────────────
 *
 * Guarda que recusa sempre passa em teste de vazamento e destrói o produto —
 * nesta base a armadilha já mordeu várias vezes. Então `projetarComercial`
 * PROJETA quando existe lastro (piso declarado em MINIMO_DE_VENDAS_PARA_TAXA),
 * e o contrato cobra os dois lados. Um módulo que nunca projeta não é honesto,
 * é inútil.
 *
 * ── NÚCLEO PURO ─────────────────────────────────────────────────────────────
 *
 * Sem fetch, sem Date.now, sem aleatório. O instante entra por parâmetro
 * (`agoraMs`) para a simulação ser reproduzível e testável. Quem lê o banco é a
 * rota; aqui só se calcula.
 *
 * Reusa o vocabulário de `lib/ai/decision-simulator.ts` (lastro declarado,
 * premissas por extenso, zero com explicação em vez de chute). Aquele módulo
 * responde "e se eu contratar?"; este responde "e se eu redistribuir?", que é a
 * pergunta que o dono desta operação de fato vive.
 *
 * ── A CONTA DE CONCENTRAÇÃO NÃO MORA MAIS AQUI (2026-07-30) ─────────────────
 *
 * `gargalosDaOperacao` tinha a própria desigualdade para decidir concentração de
 * carteira. Ela morreu, como o comentário anterior previa: a definição agora é
 * `cargaDaEquipePorContagem` em `lib/ai/previsao-aritmetica.ts`, e este módulo
 * lê o veredito `concentrada` de lá.
 */

import {
  cargaDaEquipePorContagem,
  type CargaDaEquipe,
  type ReguaDeAberto,
} from "../ai/previsao-aritmetica.ts";

/**
 * Todo resultado carrega este rótulo, sem exceção e sem parâmetro que o
 * desligue. O documento da fase exige: "Toda simulação deve ser marcada como
 * estimativa."
 */
export const ROTULO_DE_ESTIMATIVA = "ESTIMATIVA" as const;

/**
 * Mínimo de vendas COM VALOR APURADO para uma taxa de conversão virar insumo de
 * projeção.
 *
 * É um piso declarado, não uma garantia estatística — e o número tem motivo: com
 * menos de 20 vendas fechadas, UM negócio a mais ou a menos move a taxa em mais
 * de 5 pontos percentuais. Uma taxa que balança 5 pontos por evento único não
 * sustenta decisão de verba nem de folha. O valor acompanha
 * MINIMUM_CAPACITY_SAMPLE do simulador de capacidade de propósito: dois pisos
 * diferentes para a mesma ideia viram duas verdades, que é a classe de defeito
 * mais frequente deste repositório.
 */
export const MINIMO_DE_VENDAS_PARA_TAXA = 20;

/**
 * Janela de presença que a RPC `redistribute_absent_broker_leads` exige do
 * corretor SUBSTITUTO — `commercial_presence.last_seen_at >= now() - 90s`, com
 * INNER JOIN.
 *
 * O número não é escolha deste módulo: é cópia do que a função no banco faz.
 * Está aqui porque a simulação precisa dizer quantos leads o sistema moveria DE
 * VERDADE, e um contrato compara esta constante com o corpo da função viva —
 * divergir dela é o defeito, não a manutenção.
 */
export const JANELA_DE_PRESENCA_SEGUNDOS = 90;

/**
 * Teto de leads por chamada da mesma RPC (`p_limit`, máximo 200). Carteira maior
 * que isso não se resolve em uma execução, e a simulação tem de dizer quantas
 * execuções seriam necessárias em vez de prometer o total.
 */
export const TETO_DO_LOTE_DE_REDISTRIBUICAO = 200;

/**
 * Etapas que a RPC de redistribuição considera FECHADAS — cópia literal da lista
 * dentro de `redistribute_absent_broker_leads`.
 *
 * ── POR QUE ESTA LISTA E NÃO A DA LISTAGEM DE LEADS ─────────────────────────
 *
 * Existem duas noções de "lead aberto" nesta base, e elas DIVERGEM. A listagem
 * de leads trata `comprou_outro` como terminal; a RPC não. Medido em 2026-07-30:
 * a carteira de `ddcorretorsp` tem 112 leads abertos pela régua da RPC e 110
 * pela régua da listagem.
 *
 * O gêmeo usa a régua da RPC, e a escolha tem um critério: o número que este
 * módulo publica responde "quantos leads o sistema MOVERIA", então ele precisa
 * contar o que a função de fato move. Usar a régua da tela produziria uma
 * simulação que promete 110 e uma execução que mexe em 112 — a classe de defeito
 * "duas verdades" que mais aparece neste repositório.
 *
 * Não é declaração de que a régua da RPC é a certa. É declaração de QUAL régua
 * este número usa, que é o que faltava nas outras vezes.
 */
export const ETAPAS_FECHADAS_NA_REDISTRIBUICAO = [
  "won",
  "ganho",
  "vendido",
  "lost",
  "perdido",
  "descartado",
  "discarded",
  "archived",
  "arquivado",
] as const;

/** `true` quando a etapa conta como carteira ABERTA para a redistribuição. */
export function contaComoAbertoNaRedistribuicao(status: unknown): boolean {
  const normalizado = String(status ?? "novo").trim().toLowerCase();
  return !(ETAPAS_FECHADAS_NA_REDISTRIBUICAO as readonly string[]).includes(normalizado);
}

/**
 * A régua deste módulo, NOMEADA no vocabulário compartilhado.
 *
 * `contaComoAbertoNaRedistribuicao` acima é a régua em código; esta constante é
 * a mesma régua como RÓTULO, para viajar junto de toda contagem que sai daqui
 * pela conta compartilhada de carga.
 *
 * As duas têm de andar juntas: trocar o rótulo sem trocar a lista (ou o
 * contrário) publica 110 dizendo 112, que é exatamente a divergência que a
 * consolidação existia para não criar. Um contrato executa as duas contra o
 * mesmo status `comprou_outro`.
 */
export const REGUA_DA_CARTEIRA: ReguaDeAberto = "rpc_redistribuicao";

/* ------------------------------------------------------------------------- *
 * Estado observado
 * ------------------------------------------------------------------------- */

/**
 * Carteira de uma pessoa, como MEDIDA. `null` em qualquer campo é ausência de
 * medição; 0 é medido e vale zero.
 */
export type CarteiraObservada = {
  /** Rótulo para exibição. Nunca telefone, e-mail ou qualquer PII. */
  nome: string;
  /** Leads abertos (não terminais) na carteira. */
  abertos: number;
  /** Dos abertos, quantos nunca receberam primeiro contato. */
  esperandoPrimeiroContato: number;
  /**
   * Teto EXIBIDO pela tela (`profiles.max_active_leads`). Vem separado do teto
   * aplicado de propósito: são dois números diferentes nesta base.
   */
  tetoExibido: number | null;
  /**
   * Teto APLICADO pelo banco (`broker_capacity_limits`). `null` = não há linha
   * configurada, e nesse caso a trava `guard_broker_portfolio_capacity` retorna
   * sem conferir nada. Teto exibido sem teto aplicado é enfeite, e a simulação
   * precisa dizer isso em voz alta.
   */
  tetoAplicado: number | null;
  /** Presença comercial vista por último, em ms. `null` = nunca vista. */
  presencaVistaEmMs: number | null;
  /** `commercial_presence.availability` == 'available'. */
  presencaDisponivel: boolean;
  /** Id do gerente (`reports_to`). A RPC de redistribuição só move DENTRO da equipe. */
  gerenteId: string | null;
  /** Id do perfil — usado para casar equipe, nunca exibido. */
  id: string;
};

/**
 * Vendas com valor APURADO. É o único lastro que autoriza projeção comercial.
 * Separado de "leads em etapa ganho" porque etapa é declaração e valor é fato:
 * medido na base viva, 1 lead está em `ganho` e ZERO tem `sale_value_brl`.
 */
export type LastroComercial = {
  /** Leads em etapa de ganho, com ou sem valor. */
  ganhosRegistrados: number;
  /** Ganhos COM `sale_value_brl` > 0 — o denominador honesto de qualquer taxa. */
  vendasComValorApurado: number;
  /** Soma de `sale_value_brl` das vendas apuradas. `null` = não medido. */
  receitaApuradaBrl: number | null;
  /** Leads que já saíram da porta de entrada — denominador da conversão. */
  leadsConsiderados: number;
};

export type EstadoDaOperacao = {
  /** Quando o estado foi medido (ISO). Vai em toda saída: número sem data envelhece mentindo. */
  medidoEm: string;
  /** Leads abertos na organização, incluindo os sem dono. */
  leadsAbertos: number;
  /** Leads abertos que nunca receberam primeiro contato. */
  esperandoPrimeiroContato: number;
  /** Leads abertos com prazo de primeiro contato já vencido. */
  prazoDePrimeiroContatoVencido: number;
  /** Carteiras medidas, uma por corretor ATIVO (inclusive as vazias). */
  carteiras: CarteiraObservada[];
  lastro: LastroComercial;
  /**
   * O que a fonte NÃO enxerga. Vira premissa exibida — quem lê precisa saber de
   * qual metade da operação o número saiu.
   */
  coberturaDaFonte?: string | null;
};

/* ------------------------------------------------------------------------- *
 * Saída
 * ------------------------------------------------------------------------- */

/**
 * Um número da simulação. `valor: null` é "não medido" e vem sempre com motivo;
 * `deducao: true` marca o que é aritmética sobre contagem viva — o leitor tem
 * direito de saber o que é divisão e o que é modelo.
 */
export type NumeroDaSimulacao = {
  nome: string;
  valor: number | null;
  unidade: string;
  deducao: boolean;
  motivo?: string;
};

/** Uma projeção que foi PEDIDA e RECUSADA, com o dado que falta e quanto falta. */
export type RecusaDeProjecao = {
  /** O que se pediu: "receita", "conversão", "VGV". */
  pedido: string;
  motivo: string;
  /** Quanto de lastro existe e quanto seria o mínimo. */
  lastro: { amostra: number; minimo: number };
};

/**
 * Chave ESTÁVEL de uma porta de execução.
 *
 * Existe porque a decisão "esta porta bloqueia?" não pode depender do texto de
 * `nome`: nome é para humano e muda no primeiro ajuste de redação. Casar
 * comportamento com texto exibido é como asserções deste repositório já
 * quebraram no primeiro reflow.
 */
export type ChaveDaPorta = "substituto_mesma_equipe" | "presenca_na_janela" | "teto_do_lote";

/**
 * Uma porta que a execução real tem de atravessar, medida.
 *
 * `bloqueiaTudo` separa as duas naturezas: falta de substituto ou de presença
 * faz a função levantar exceção e NADA se move; exceder o lote só divide o
 * trabalho em mais execuções. Tratar as duas igual publicaria "move zero" para
 * uma carteira que na verdade move em duas chamadas.
 */
export type PortaDeExecucao = {
  chave: ChaveDaPorta;
  nome: string;
  atendida: boolean;
  bloqueiaTudo: boolean;
  detalhe: string;
};

export type ResultadoDaSimulacao = {
  cenario: string;
  /** Literal, sempre. Não há caminho que produza resultado sem este rótulo. */
  rotulo: typeof ROTULO_DE_ESTIMATIVA;
  medidoEm: string;
  premissas: string[];
  numeros: NumeroDaSimulacao[];
  /** Projeções pedidas e negadas. Vazio só quando nada da família foi pedido. */
  recusas: RecusaDeProjecao[];
  /**
   * Portas da execução REAL. Presente quando o cenário corresponde a uma ação
   * que o sistema executaria — sem isto, a simulação descreve um mundo em que a
   * ação sempre funciona, e este não é o mundo desta base.
   */
  portas: PortaDeExecucao[];
};

/* ------------------------------------------------------------------------- *
 * O portão comercial
 * ------------------------------------------------------------------------- */

export type PedidoComercial = {
  /** "receita", "conversão", "VGV" — o que se quer projetar. */
  pedido: string;
  /** Quantos leads entrariam no cenário. */
  leads: number;
};

export type ProjecaoComercial =
  | { projetavel: false; recusa: RecusaDeProjecao }
  | {
      projetavel: true;
      /** Taxa OBSERVADA (0..1), nunca arbitrada. */
      taxaObservada: number;
      /** Ticket médio OBSERVADO em BRL, ou null se a receita não foi medida. */
      ticketMedioBrl: number | null;
      vendasEsperadas: number;
      receitaEsperadaBrl: number | null;
      premissas: string[];
      lastro: { amostra: number; minimo: number };
    };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A carga da equipe pela conta ÚNICA, com a régua deste módulo declarada.
 *
 * Este é o ponto de fusão: `gargalosDaOperacao` decidia concentração com uma
 * desigualdade própria e agora não decide nada — pergunta aqui. Tudo o que sai
 * daqui foi contado pela régua da RPC, e o rótulo viaja no resultado.
 */
export function cargaDaOperacao(estado: EstadoDaOperacao): CargaDaEquipe {
  return cargaDaEquipePorContagem(
    estado.carteiras.map((c) => ({ corretorId: c.id, leads: c.abertos })),
    estado.carteiras.map((c) => c.id),
    REGUA_DA_CARTEIRA,
  );
}

/**
 * A carteira mais cheia — UMA definição, três consumidores (gargalos, o rateio e
 * a escolha da origem da redistribuição).
 *
 * O desempate é pelo `id`, o mesmo critério do `ranking` da conta compartilhada.
 * Antes eram três `sort` idênticos por `abertos` apenas, que empatavam pela
 * ordem do array: duas telas podiam nomear pessoas diferentes como "a mais
 * cheia" com os mesmos dados, e ninguém veria por quê.
 */
function carteiraMaisCheia(carteiras: readonly CarteiraObservada[]): CarteiraObservada | null {
  return [...carteiras].sort((a, b) => b.abertos - a.abertos || a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * Taxa de conversão arredondada em 6 casas.
 *
 * Duas casas não servem aqui: 20 vendas em 482 leads dá 4,1494% — com `r2` a
 * taxa viraria 0,04 e o erro de arredondamento seria de quase 4% relativo,
 * propagado para toda projeção de receita construída sobre ela. Uma função
 * separada e nomeada em vez de aritmética engenhosa dentro da expressão: a
 * primeira versão disto foi `r2(taxa * 10_000) / 10_000`, que arredonda em 6
 * casas por acidente de composição e não em 4 como o número 10.000 sugere.
 */
const taxa6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/**
 * O ÚNICO caminho para um número da família venda/receita/VGV.
 *
 * Não existe ramo aqui que produza taxa sem `vendasComValorApurado` suficiente:
 * quando o lastro não fecha, a função devolve recusa com o número que falta.
 * É de propósito que a assinatura não aceite "taxa sugerida", "taxa padrão do
 * mercado" nem nada equivalente — parâmetro de fallback é exatamente como um
 * chute entra num módulo que jurou não chutar.
 */
export function projetarComercial(estado: EstadoDaOperacao, pedido: PedidoComercial): ProjecaoComercial {
  const amostra = estado.lastro.vendasComValorApurado;
  const minimo = MINIMO_DE_VENDAS_PARA_TAXA;

  if (amostra < minimo) {
    return {
      projetavel: false,
      recusa: {
        pedido: pedido.pedido,
        motivo:
          `não projetável: falta histórico de vendas. ${amostra} venda(s) com valor apurado contra o mínimo de ${minimo}` +
          (estado.lastro.ganhosRegistrados > amostra
            ? ` (há ${estado.lastro.ganhosRegistrados} lead(s) em etapa de ganho, mas etapa é declaração e valor é fato: sem valor apurado não há ticket nem taxa)`
            : "") +
          ". Sem taxa de conversão observada, qualquer número de venda ou receita seria invenção.",
        lastro: { amostra, minimo },
      },
    };
  }

  if (estado.lastro.leadsConsiderados <= 0) {
    return {
      projetavel: false,
      recusa: {
        pedido: pedido.pedido,
        motivo:
          "não projetável: há vendas apuradas mas nenhum lead considerado no denominador — sem denominador não existe taxa.",
        lastro: { amostra, minimo },
      },
    };
  }

  const taxaObservada = amostra / estado.lastro.leadsConsiderados;
  const receita = estado.lastro.receitaApuradaBrl;
  const ticketMedioBrl = receita !== null && amostra > 0 ? r2(receita / amostra) : null;
  const vendasEsperadas = r2(pedido.leads * taxaObservada);

  const premissas = [
    `Taxa de conversão OBSERVADA: ${amostra} venda(s) apurada(s) sobre ${estado.lastro.leadsConsiderados} lead(s) considerado(s) = ${r2(taxaObservada * 100)}%.`,
    `Premissa: a taxa observada se mantém para os ${pedido.leads} lead(s) do cenário. Ela é histórica, não garantida.`,
  ];
  if (ticketMedioBrl === null) {
    premissas.push(
      "Receita fica em não medido: existe taxa de conversão apurada, mas a soma dos valores de venda não foi medida — sem ela não há ticket médio.",
    );
  } else {
    premissas.push(`Ticket médio OBSERVADO: R$ ${ticketMedioBrl} por venda apurada.`);
  }

  return {
    projetavel: true,
    taxaObservada: taxa6(taxaObservada),
    ticketMedioBrl,
    vendasEsperadas,
    receitaEsperadaBrl: ticketMedioBrl === null ? null : r2(vendasEsperadas * ticketMedioBrl),
    premissas,
    lastro: { amostra, minimo },
  };
}

/* ------------------------------------------------------------------------- *
 * Portas da execução real
 * ------------------------------------------------------------------------- */

/**
 * As portas que `redistribute_absent_broker_leads` abre ANTES de mover um lead,
 * medidas contra o estado.
 *
 * Existe porque a resposta aritmética ("384 leads em 12 pessoas dá 32 cada") é
 * verdadeira e INÚTIL se o sistema não move nenhum lead hoje. Medido em
 * 2026-07-30, executando a própria consulta de candidatos da função contra a
 * base viva: 11 corretores passam por equipe, papel e atividade, e ZERO passam
 * pela presença de 90 segundos — a função levantaria
 * `absence_no_eligible_replacement` no primeiro lead e a transação inteira
 * abortaria, transferindo nada.
 *
 * A diferença entre "32 por pessoa" e "zero movidos hoje" é a diferença entre um
 * painel bonito e um painel que serve para decidir.
 */
/**
 * A pessoa está presente para EFEITO DE RECEBER LEAD?
 *
 * Duas condições, e as duas por um motivo medido: `availability = 'available'` e
 * `last_seen_at` dentro da janela. A base tem 2 linhas de presença 'available'
 * cujo `last_seen_at` é de 2026-07-24 — cinco dias antes da medição. Olhar só a
 * disponibilidade publica "presente agora" para quem o INNER JOIN da RPC já
 * descartou.
 *
 * Existe como função exportada porque a rota TAMBÉM precisa desta decisão para
 * montar o payload, e a primeira versão dela reimplementou a comparação à mão.
 * Comparação escrita duas vezes é exatamente como nasceram os caminhos
 * divergentes deste repositório; aqui há uma só, e um contrato a executa.
 */
export function presenteParaReceberLead(carteira: CarteiraObservada, agoraMs: number): boolean {
  if (!carteira.presencaDisponivel) return false;
  if (carteira.presencaVistaEmMs === null) return false;
  return carteira.presencaVistaEmMs >= agoraMs - JANELA_DE_PRESENCA_SEGUNDOS * 1000;
}

export function portasDaRedistribuicao(
  estado: EstadoDaOperacao,
  origem: CarteiraObservada,
  agoraMs: number,
): PortaDeExecucao[] {
  const mesmaEquipe = estado.carteiras.filter(
    (c) => c.id !== origem.id && c.gerenteId !== null && c.gerenteId === origem.gerenteId,
  );
  const presentes = mesmaEquipe.filter((c) => presenteParaReceberLead(c, agoraMs));

  const portas: PortaDeExecucao[] = [
    {
      chave: "substituto_mesma_equipe",
      nome: "substituto na mesma equipe",
      atendida: mesmaEquipe.length > 0,
      bloqueiaTudo: true,
      detalhe:
        mesmaEquipe.length > 0
          ? `${mesmaEquipe.length} corretor(es) ativo(s) sob o mesmo gerente. A função só move dentro da equipe.`
          : "nenhum corretor ativo sob o mesmo gerente — a função só move dentro da equipe e não teria destino.",
    },
    {
      chave: "presenca_na_janela",
      nome: `presença nos últimos ${JANELA_DE_PRESENCA_SEGUNDOS}s`,
      atendida: presentes.length > 0,
      bloqueiaTudo: true,
      detalhe:
        presentes.length > 0
          ? `${presentes.length} de ${mesmaEquipe.length} substituto(s) com presença disponível dentro da janela.`
          : `ZERO de ${mesmaEquipe.length} substituto(s) com presença dentro da janela de ${JANELA_DE_PRESENCA_SEGUNDOS}s. A função exige isso por INNER JOIN: sem ninguém presente ela levanta absence_no_eligible_replacement no primeiro lead e a transação aborta — nenhum lead se move, e nem o registro de ausência fica gravado.`,
    },
    {
      chave: "teto_do_lote",
      nome: `lote de até ${TETO_DO_LOTE_DE_REDISTRIBUICAO} leads`,
      atendida: origem.abertos <= TETO_DO_LOTE_DE_REDISTRIBUICAO,
      bloqueiaTudo: false,
      detalhe:
        origem.abertos <= TETO_DO_LOTE_DE_REDISTRIBUICAO
          ? `${origem.abertos} lead(s) cabem em uma execução.`
          : `${origem.abertos} lead(s) excedem o teto de ${TETO_DO_LOTE_DE_REDISTRIBUICAO} por chamada — seriam ${Math.ceil(origem.abertos / TETO_DO_LOTE_DE_REDISTRIBUICAO)} execuções.`,
    },
  ];

  return portas;
}

/**
 * Quantos leads a redistribuição moveria HOJE, dadas as portas medidas.
 *
 * Decide por `bloqueiaTudo`, não pelo nome da porta: uma porta bloqueante
 * fechada zera o resultado porque a função no banco levanta exceção e a
 * transação aborta inteira — não move "alguns", move NENHUM. O teto do lote não
 * bloqueia, apenas recorta o que cabe numa chamada.
 */
export function leadsQueMoveriamHoje(portas: PortaDeExecucao[], desejados: number): number {
  if (portas.some((p) => p.bloqueiaTudo && !p.atendida)) return 0;
  return Math.max(0, Math.min(desejados, TETO_DO_LOTE_DE_REDISTRIBUICAO));
}

/* ------------------------------------------------------------------------- *
 * A simulação que o dono vive: "e se eu redistribuir?"
 * ------------------------------------------------------------------------- */

export type CenarioDeRedistribuicao = {
  /**
   * Quantos corretores participariam do rateio. `null` = todos os ativos
   * medidos. Nunca inventa gente: valor acima do medido é recortado, com
   * premissa dizendo que foi.
   */
  entreQuantosCorretores?: number | null;
};

/**
 * "E se eu redistribuir a fila entre a equipe?"
 *
 * Devolve DEDUÇÃO (carga por pessoa antes e depois, concentração, quanto sai da
 * carteira mais cheia) e RECUSA explícita da família comercial. Nenhum número de
 * venda sai daqui sem passar por `projetarComercial`, e com esta base ele recusa.
 */
export function simularRedistribuicao(
  estado: EstadoDaOperacao,
  cenario: CenarioDeRedistribuicao,
  agoraMs: number,
): ResultadoDaSimulacao {
  const premissas: string[] = [];
  if (estado.coberturaDaFonte) premissas.push(`Cobertura da fonte: ${estado.coberturaDaFonte}`);

  const ativos = estado.carteiras.length;
  const pedidos = cenario.entreQuantosCorretores ?? ativos;
  const participantes = Math.max(0, Math.min(pedidos, ativos));
  if (pedidos > ativos) {
    premissas.push(
      `Pedidos ${pedidos} corretores, medidos ${ativos} ativos — o rateio usa ${participantes}. Simulação não cria gente que não existe no cadastro.`,
    );
  }

  const comCarteira = estado.carteiras.filter((c) => c.abertos > 0).length;
  const vazias = ativos - comCarteira;
  const totalNasCarteiras = estado.carteiras.reduce((soma, c) => soma + c.abertos, 0);

  const numeros: NumeroDaSimulacao[] = [
    { nome: "leads abertos na operação", valor: estado.leadsAbertos, unidade: "leads", deducao: true },
    { nome: "leads em carteira de alguém", valor: totalNasCarteiras, unidade: "leads", deducao: true },
    { nome: "corretores ativos", valor: ativos, unidade: "pessoas", deducao: true },
    { nome: "corretores com carteira vazia", valor: vazias, unidade: "pessoas", deducao: true },
    { nome: "esperando primeiro contato", valor: estado.esperandoPrimeiroContato, unidade: "leads", deducao: true },
  ];

  if (participantes > 0) {
    const depois = totalNasCarteiras / participantes;
    numeros.push({
      nome: "carga por corretor depois do rateio",
      valor: r2(depois),
      unidade: "leads por pessoa",
      deducao: true,
    });
    premissas.push(
      `Rateio uniforme dos ${totalNasCarteiras} leads em carteira entre ${participantes} corretor(es) — ${r2(depois)} por pessoa. É divisão, não previsão: não supõe que alguém trabalhe mais rápido.`,
    );

    const maisCheia = carteiraMaisCheia(estado.carteiras);
    if (maisCheia && maisCheia.abertos > depois) {
      const sairiam = Math.floor(maisCheia.abertos - depois);
      numeros.push({
        nome: "leads que sairiam da carteira mais cheia",
        valor: sairiam,
        unidade: "leads",
        deducao: true,
      });
      premissas.push(
        `A carteira mais cheia (${maisCheia.nome}) tem ${maisCheia.abertos} abertos; no rateio ficaria com ${r2(depois)} — ${sairiam} sairiam.`,
      );
      if (maisCheia.tetoExibido !== null && maisCheia.tetoAplicado === null) {
        premissas.push(
          `Atenção ao teto: a tela exibe ${maisCheia.tetoExibido} como limite de ${maisCheia.nome}, que está com ${maisCheia.abertos}. Não há linha em broker_capacity_limits, então a trava do banco retorna sem conferir — o teto exibido não é aplicado a nada. Dois números para a mesma ideia é o defeito, não o excesso de leads.`,
        );
      }
    }
  } else {
    numeros.push({
      nome: "carga por corretor depois do rateio",
      valor: null,
      unidade: "leads por pessoa",
      deducao: true,
      motivo: "nenhum corretor participante — não há entre quem ratear.",
    });
  }

  // As portas da execução real, para a carteira que mais precisa sair. A MESMA
  // definição de "mais cheia" que o rateio acima e que os gargalos usam: três
  // `sort` soltos empatavam pela ordem do array e podiam nomear pessoas
  // diferentes na mesma tela.
  const origem = carteiraMaisCheia(estado.carteiras);
  const portas = origem ? portasDaRedistribuicao(estado, origem, agoraMs) : [];
  if (origem) {
    const desejados =
      participantes > 0 ? Math.max(0, Math.floor(origem.abertos - totalNasCarteiras / participantes)) : 0;
    const moveriam = leadsQueMoveriamHoje(portas, desejados);
    numeros.push({
      nome: "leads que o sistema moveria hoje",
      valor: moveriam,
      unidade: "leads",
      deducao: true,
      motivo:
        moveriam === 0
          ? "alguma porta da execução real está fechada — ver portas. O rateio acima é a aritmética do destino, não uma promessa de que a operação chega lá hoje."
          : undefined,
    });
  }

  // A família comercial, pedida e recusada (ou projetada, se houver lastro).
  const recusas: RecusaDeProjecao[] = [];
  for (const pedido of ["conversão", "receita"]) {
    const projecao = projetarComercial(estado, { pedido, leads: estado.esperandoPrimeiroContato });
    if (!projecao.projetavel) {
      recusas.push(projecao.recusa);
      numeros.push({
        nome: `${pedido} esperada com a fila redistribuída`,
        valor: null,
        unidade: pedido === "receita" ? "BRL" : "vendas",
        deducao: false,
        motivo: projecao.recusa.motivo,
      });
    } else {
      premissas.push(...projecao.premissas);
      numeros.push({
        nome: `${pedido} esperada com a fila redistribuída`,
        valor: pedido === "receita" ? projecao.receitaEsperadaBrl : projecao.vendasEsperadas,
        unidade: pedido === "receita" ? "BRL" : "vendas",
        deducao: false,
      });
    }
  }

  return {
    cenario: "redistribuição da fila entre a equipe",
    rotulo: ROTULO_DE_ESTIMATIVA,
    medidoEm: estado.medidoEm,
    premissas,
    numeros,
    recusas,
    portas,
  };
}

/* ------------------------------------------------------------------------- *
 * Cenários aritméticos irmãos
 * ------------------------------------------------------------------------- */

/**
 * "E se entrarem mais N leads por semana?"
 *
 * Aritmética: quanto sobe a carga de cada um. NÃO diz quanto vende — para isso
 * passa por `projetarComercial`, que recusa nesta base.
 */
export function simularAumentoDeLeads(
  estado: EstadoDaOperacao,
  leadsNovosPorSemana: number,
  agoraMs: number,
): ResultadoDaSimulacao {
  void agoraMs;
  const ativos = estado.carteiras.length;
  const premissas: string[] = [
    "Horizonte de 1 semana. Os leads novos entram na fila de primeiro contato; nenhum é dado como atendido.",
  ];
  if (estado.coberturaDaFonte) premissas.unshift(`Cobertura da fonte: ${estado.coberturaDaFonte}`);

  const numeros: NumeroDaSimulacao[] = [
    { nome: "leads novos no cenário", valor: leadsNovosPorSemana, unidade: "leads por semana", deducao: true },
    { nome: "fila de primeiro contato hoje", valor: estado.esperandoPrimeiroContato, unidade: "leads", deducao: true },
    {
      nome: "fila de primeiro contato depois",
      valor: estado.esperandoPrimeiroContato + leadsNovosPorSemana,
      unidade: "leads",
      deducao: true,
    },
  ];

  if (ativos > 0) {
    numeros.push({
      nome: "acréscimo de carga por corretor",
      valor: r2(leadsNovosPorSemana / ativos),
      unidade: "leads por pessoa",
      deducao: true,
    });
    premissas.push(
      `Acréscimo rateado entre os ${ativos} corretor(es) ativo(s) medidos — divisão, não previsão de atendimento.`,
    );
  } else {
    numeros.push({
      nome: "acréscimo de carga por corretor",
      valor: null,
      unidade: "leads por pessoa",
      deducao: true,
      motivo: "nenhum corretor ativo medido — não há entre quem ratear.",
    });
  }

  const recusas: RecusaDeProjecao[] = [];
  const projecao = projetarComercial(estado, { pedido: "receita", leads: leadsNovosPorSemana });
  if (!projecao.projetavel) {
    recusas.push(projecao.recusa);
    numeros.push({
      nome: "receita esperada dos leads novos",
      valor: null,
      unidade: "BRL",
      deducao: false,
      motivo: projecao.recusa.motivo,
    });
  } else {
    premissas.push(...projecao.premissas);
    numeros.push({
      nome: "receita esperada dos leads novos",
      valor: projecao.receitaEsperadaBrl,
      unidade: "BRL",
      deducao: false,
    });
  }

  return {
    cenario: `aumento de ${leadsNovosPorSemana} leads por semana`,
    rotulo: ROTULO_DE_ESTIMATIVA,
    medidoEm: estado.medidoEm,
    premissas,
    numeros,
    recusas,
    portas: [],
  };
}

/**
 * "E se a equipe encolher em N pessoas?"
 *
 * Aritmética pura sobre quem tem carteira. A escolha de QUEM sai é do gestor;
 * a simulação remove as MENOS carregadas, o cenário mais favorável — e diz que
 * escolheu assim, para o número não ser lido como o pior caso.
 */
export function simularReducaoDaEquipe(
  estado: EstadoDaOperacao,
  pessoasQueSaem: number,
  agoraMs: number,
): ResultadoDaSimulacao {
  void agoraMs;
  const ativos = estado.carteiras.length;
  const saem = Math.max(0, Math.min(pessoasQueSaem, ativos));
  const restantes = ativos - saem;
  const total = estado.carteiras.reduce((soma, c) => soma + c.abertos, 0);

  const premissas: string[] = [
    `Saem as ${saem} carteira(s) MENOS carregada(s) — cenário mais favorável de propósito. Se saírem as mais cheias, a carga dos que ficam é maior que a deste número.`,
  ];
  if (estado.coberturaDaFonte) premissas.unshift(`Cobertura da fonte: ${estado.coberturaDaFonte}`);
  if (pessoasQueSaem > ativos) {
    premissas.push(`Pedido remover ${pessoasQueSaem} de ${ativos} corretores medidos — o cenário remove ${saem}.`);
  }

  const numeros: NumeroDaSimulacao[] = [
    { nome: "corretores ativos hoje", valor: ativos, unidade: "pessoas", deducao: true },
    { nome: "corretores depois", valor: restantes, unidade: "pessoas", deducao: true },
    { nome: "leads em carteira", valor: total, unidade: "leads", deducao: true },
  ];

  if (restantes > 0) {
    numeros.push({
      nome: "carga por corretor depois",
      valor: r2(total / restantes),
      unidade: "leads por pessoa",
      deducao: true,
    });
  } else {
    numeros.push({
      nome: "carga por corretor depois",
      valor: null,
      unidade: "leads por pessoa",
      deducao: true,
      motivo: `com ${saem} saída(s) não resta corretor ativo — os ${total} leads em carteira ficariam sem dono, não redistribuídos.`,
    });
    premissas.push(
      "Equipe zerada não é 'carga infinita': é fila sem dono. A cascata de distribuição cai para o gerente e, sem ele, a lead fica represada.",
    );
  }

  const recusas: RecusaDeProjecao[] = [];
  const projecao = projetarComercial(estado, { pedido: "receita perdida", leads: total });
  if (!projecao.projetavel) {
    recusas.push(projecao.recusa);
    numeros.push({
      nome: "receita perdida com a redução",
      valor: null,
      unidade: "BRL",
      deducao: false,
      motivo: projecao.recusa.motivo,
    });
  } else {
    premissas.push(...projecao.premissas);
    numeros.push({
      nome: "receita perdida com a redução",
      valor: projecao.receitaEsperadaBrl,
      unidade: "BRL",
      deducao: false,
    });
  }

  return {
    cenario: `redução de ${saem} corretor(es)`,
    rotulo: ROTULO_DE_ESTIMATIVA,
    medidoEm: estado.medidoEm,
    premissas,
    numeros,
    recusas,
    portas: [],
  };
}

/**
 * "E se eu mudar o SLA de primeiro contato?"
 *
 * O que É dedutível: quantos leads da fila atual já violariam o prazo novo.
 * O que NÃO é: se a equipe passa a cumprir o prazo — isso depende de ritmo de
 * atendimento, e o ritmo desta base não é medido (1 corretor movimentou leads em
 * 0,34 semana). Então essa metade sai como não medida, com o motivo.
 */
export function simularMudancaDeSla(
  estado: EstadoDaOperacao,
  novoPrazoMinutos: number,
  agoraMs: number,
): ResultadoDaSimulacao {
  void agoraMs;
  const premissas: string[] = [
    `Prazo novo de ${novoPrazoMinutos} minuto(s) aplicado à fila que já existe.`,
    "O que a simulação NÃO afirma: que a equipe vai cumprir o prazo novo. Cumprimento depende de ritmo de atendimento, e esse ritmo não está medido nesta base.",
  ];
  if (estado.coberturaDaFonte) premissas.unshift(`Cobertura da fonte: ${estado.coberturaDaFonte}`);

  const numeros: NumeroDaSimulacao[] = [
    { nome: "esperando primeiro contato", valor: estado.esperandoPrimeiroContato, unidade: "leads", deducao: true },
    {
      nome: "já com prazo vencido hoje",
      valor: estado.prazoDePrimeiroContatoVencido,
      unidade: "leads",
      deducao: true,
    },
    {
      nome: "violariam o prazo novo imediatamente",
      valor: estado.esperandoPrimeiroContato,
      unidade: "leads",
      deducao: true,
    },
    {
      nome: "cumprimento esperado do prazo novo",
      valor: null,
      unidade: "%",
      deducao: false,
      motivo:
        "não projetável: exige ritmo de atendimento observado (leads atendidos por corretor por semana), que não está medido nesta base.",
    },
  ];

  premissas.push(
    `Qualquer prazo aplicado a uma fila de ${estado.esperandoPrimeiroContato} lead(s) que já esperam nasce violado para todos eles — encurtar o SLA não acelera o atendimento, só muda a régua.`,
  );

  return {
    cenario: `mudança do SLA de primeiro contato para ${novoPrazoMinutos} minuto(s)`,
    rotulo: ROTULO_DE_ESTIMATIVA,
    medidoEm: estado.medidoEm,
    premissas,
    numeros,
    recusas: [],
    portas: [],
  };
}

/* ------------------------------------------------------------------------- *
 * Gargalos
 * ------------------------------------------------------------------------- */

export type Gargalo = {
  area: string;
  fato: string;
  /** Aritmética que sustenta o fato. Sem isto, é opinião. */
  numero: number;
  unidade: string;
};

/**
 * Gargalos DEDUZIDOS do estado — nenhum depende de modelo.
 *
 * Ordem por severidade aritmética, não por gosto: concentração de carteira
 * primeiro, porque é a que tem pessoa parada do outro lado.
 *
 * ── A DÍVIDA QUE ESTE COMENTÁRIO ANUNCIAVA FOI PAGA (2026-07-30) ────────────
 *
 * Esta função tinha a própria desigualdade — "fatia da maior carteira > 1 ÷
 * corretores" — enquanto `lib/ai/previsao-aritmetica.ts` media a mesma coisa por
 * "maior carga ÷ carga média > 1". Era a classe de defeito que este repositório
 * já pagou quatro vezes (`move.moveId` vs `move.id`, `developments` vs
 * `crm_projects`, `pipeline_history` vs `pipeline_stage_moves`), e a candidata a
 * morrer, como dizia a nota anterior, era esta.
 *
 * Morreu. A desigualdade daqui não existe mais: o veredito vem de
 * `carga.concentrada`, decidido uma vez só, em inteiros. Duas descobertas da
 * fusão ficam registradas porque nenhuma das duas estava no plano:
 *
 *   · As contas NÃO concordavam inteiramente. Em [334, 333, 333] esta função
 *     acusava e a irmã não, porque a irmã dividia por uma média já arredondada.
 *     A divergência de borda já existia — faltava alguém procurar.
 *
 *   · Unificar a conta sem unificar a RÉGUA de "lead aberto" trocaria uma
 *     divergência por outra: a carteira de ddcorretorsp vale 112 pela régua da
 *     RPC (a deste módulo) e 110 pela da listagem. Por isso a conta compartilhada
 *     exige `REGUA_DA_CARTEIRA` e a carrega no resultado.
 */
export function gargalosDaOperacao(estado: EstadoDaOperacao): Gargalo[] {
  const gargalos: Gargalo[] = [];
  const carga = cargaDaOperacao(estado);
  const ativos = carga.corretores;
  const vazias = carga.semCarteira.length;
  const maisCheia = carteiraMaisCheia(estado.carteiras);

  // O veredito é da conta compartilhada; aqui só se REDIGE o fato. A fatia
  // abaixo é redação, não decisão — se ela voltar a decidir, a segunda definição
  // de concentração nasce de novo neste mesmo lugar.
  if (carga.concentrada && maisCheia) {
    const fatia = maisCheia.abertos / carga.totalDeLeads;
    gargalos.push({
      area: "concentração de carteira",
      fato: `${maisCheia.nome} concentra ${Math.round(fatia * 100)}% dos leads em carteira; rateio uniforme daria ${Math.round((1 / ativos) * 100)}%.`,
      numero: maisCheia.abertos,
      unidade: "leads",
    });
  }

  if (vazias > 0) {
    gargalos.push({
      area: "pessoa parada",
      fato: `${vazias} de ${ativos} corretor(es) ativo(s) com carteira ZERO enquanto ${estado.esperandoPrimeiroContato} lead(s) esperam primeiro contato.`,
      numero: vazias,
      unidade: "pessoas",
    });
  }

  if (estado.prazoDePrimeiroContatoVencido > 0) {
    gargalos.push({
      area: "prazo de primeiro contato",
      fato: `${estado.prazoDePrimeiroContatoVencido} lead(s) com prazo de primeiro contato vencido.`,
      numero: estado.prazoDePrimeiroContatoVencido,
      unidade: "leads",
    });
  }

  const semTetoAplicado = estado.carteiras.filter((c) => c.tetoExibido !== null && c.tetoAplicado === null).length;
  if (semTetoAplicado > 0) {
    gargalos.push({
      area: "teto de capacidade",
      fato: `${semTetoAplicado} corretor(es) com teto EXIBIDO na tela e nenhum teto APLICADO no banco (broker_capacity_limits sem linha) — a trava não confere nada.`,
      numero: semTetoAplicado,
      unidade: "pessoas",
    });
  }

  return gargalos;
}

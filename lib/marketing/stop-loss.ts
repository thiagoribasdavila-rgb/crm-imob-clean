/**
 * STOP LOSS DE MARKETING — a regra que manda parar de gastar.
 *
 * O orquestrador de verba já sabe DISTRIBUIR orçamento entre produtos. Ninguém
 * sabia dizer quando PARAR. Sem essa regra, a única proteção é alguém olhar o
 * painel a tempo — e ninguém olha no fim de semana.
 *
 * ── O QUE TORNA ESTE STOP LOSS DIFERENTE ────────────────────────────────────
 *
 * A maioria só olha custo: CPL acima do alvo, verba estourada. Isso exige dado
 * da conta de anúncios, que hoje está bloqueada (#200 — ads_read não concedido).
 * Um stop loss que só sabe olhar custo estaria cego exatamente agora.
 *
 * Por isso ele olha também ABSORÇÃO: comprar lead que a equipe não atende é
 * desperdício integral, e isso o CRM mede sozinho. Com 24 leads pagas de prazo
 * estourado e 116 represadas, a decisão certa não depende de saber o CPL.
 *
 * ── O QUE ELE NUNCA FAZ ─────────────────────────────────────────────────────
 *
 * Não pausa campanha, não corta verba, não mexe na Meta. Devolve DECISÃO com
 * motivo e confiança, para virar proposta na Caixa de Aprovações. Movimentar
 * verba sem aprovação humana é a linha que não se cruza — nem para proteger.
 *
 * Função pura: sem rede, sem banco, sem relógio. Um stop loss que depende de IA
 * externa para decidir é um stop loss que falha quando o provedor cai.
 */

export type OrcamentoDoPeriodo = {
  /** Teto do período, na moeda da conta. */
  teto: number;
  /** Já gasto no período. null = a conta de anúncios não respondeu. */
  gasto: number | null;
  /** Fração do período já decorrida (0–1). Serve para julgar RITMO, não só total. */
  fracaoDecorrida: number;
  /** CPL alvo acordado. null = não definido — e então não se cobra o que não foi combinado. */
  cplAlvo: number | null;
};

export type AbsorcaoDaOperacao = {
  /** Leads de mídia paga que entraram no período. */
  leadsRecebidas: number;
  /** Dessas, quantas tiveram primeiro contato registrado. */
  leadsContatadas: number;
  /** Leads pagas com prazo de primeiro contato vencido. */
  leadsComSlaVencido: number;
  /** Leads pagas sem responsável. */
  leadsSemDono: number;
  /** Leads já pagas que sequer entraram no CRM. */
  leadsRepresadas: number;
  /** Corretores ativos para absorver o volume. */
  corretoresAtivos: number;
};

export type Acao = "seguir" | "reduzir" | "pausar";

export type DecisaoDeStopLoss = {
  regra: string;
  acao: Acao;
  motivo: string;
  /** O que a diretoria aprova. Vazio quando a ação é seguir. */
  proposta: string;
  /** "medida" = dado suficiente; "indicativa" = amostra pequena, decida com olho. */
  confianca: "medida" | "indicativa";
  gravidade: 1 | 2 | 3 | 4 | 5;
};

export type VereditoDeStopLoss = {
  acao: Acao;
  decisoes: DecisaoDeStopLoss[];
  /** O que não pôde ser avaliado, e por quê. Silêncio aqui seria falso conforto. */
  naoAvaliado: string[];
  /** Nunca true. Existe para que a intenção fique legível no payload. */
  executaSozinho: false;
};

/** Amostra mínima para uma taxa de contato significar algo. */
const AMOSTRA_MINIMA = 10;
/** Abaixo disto de atendimento, comprar mais lead é jogar dinheiro fora. */
const ATENDIMENTO_CRITICO = 0.3;
const ATENDIMENTO_BAIXO = 0.6;
/** Leads pagas por corretor acima disto, a fila não é absorvível. */
const LEADS_POR_CORRETOR_LIMITE = 40;

const maisGrave = (a: Acao, b: Acao): Acao => {
  const ordem: Acao[] = ["seguir", "reduzir", "pausar"];
  return ordem[Math.max(ordem.indexOf(a), ordem.indexOf(b))];
};

export function avaliarStopLoss(
  orcamento: OrcamentoDoPeriodo,
  absorcao: AbsorcaoDaOperacao,
): VereditoDeStopLoss {
  const decisoes: DecisaoDeStopLoss[] = [];
  const naoAvaliado: string[] = [];

  // ── 1. Teto de verba ──────────────────────────────────────────────────────
  if (orcamento.gasto === null) {
    naoAvaliado.push("Ritmo de verba e CPL: a conta de anúncios não respondeu, então gasto é desconhecido. Desconhecido não é zero.");
  } else if (orcamento.teto > 0) {
    const usado = orcamento.gasto / orcamento.teto;
    if (usado >= 1) {
      decisoes.push({
        regra: "teto-de-verba",
        acao: "pausar",
        motivo: `Verba do período esgotada (${Math.round(usado * 100)}% do teto).`,
        proposta: "Pausar entrega até a próxima janela de orçamento, ou aprovar novo teto.",
        confianca: "medida",
        gravidade: 5,
      });
    } else if (orcamento.fracaoDecorrida > 0 && usado > orcamento.fracaoDecorrida * 1.3) {
      // Gastar adiantado não é erro por si — vira erro quando o período acaba
      // antes da verba. 1,3× é a folga que separa ritmo forte de descontrole.
      decisoes.push({
        regra: "ritmo-de-verba",
        acao: "reduzir",
        motivo: `${Math.round(usado * 100)}% da verba gasta com ${Math.round(orcamento.fracaoDecorrida * 100)}% do período decorrido.`,
        proposta: "Reduzir a verba diária para o período fechar dentro do teto.",
        confianca: "medida",
        gravidade: 3,
      });
    }
  }

  // ── 2. CPL contra o alvo ──────────────────────────────────────────────────
  if (orcamento.cplAlvo === null) {
    naoAvaliado.push("CPL contra alvo: nenhum CPL alvo foi acordado. Não se cobra meta que não foi combinada.");
  } else if (orcamento.gasto !== null && absorcao.leadsRecebidas >= AMOSTRA_MINIMA) {
    const cpl = orcamento.gasto / absorcao.leadsRecebidas;
    if (cpl > orcamento.cplAlvo * 1.5) {
      decisoes.push({
        regra: "cpl-acima-do-alvo",
        acao: "pausar",
        motivo: `CPL de ${cpl.toFixed(2)} contra alvo de ${orcamento.cplAlvo.toFixed(2)} — 50% acima.`,
        proposta: "Pausar o conjunto mais caro e revisar público e criativo antes de voltar.",
        confianca: "medida",
        gravidade: 4,
      });
    } else if (cpl > orcamento.cplAlvo) {
      decisoes.push({
        regra: "cpl-acima-do-alvo",
        acao: "reduzir",
        motivo: `CPL de ${cpl.toFixed(2)} contra alvo de ${orcamento.cplAlvo.toFixed(2)}.`,
        proposta: "Reduzir verba do conjunto mais caro e realocar para o de melhor custo.",
        confianca: "medida",
        gravidade: 2,
      });
    }
  } else if (orcamento.gasto !== null) {
    naoAvaliado.push(`CPL contra alvo: ${absorcao.leadsRecebidas} lead(s) no período — abaixo das ${AMOSTRA_MINIMA} necessárias para a média significar algo.`);
  }

  // ── 3. Gasto sem retorno ──────────────────────────────────────────────────
  if (orcamento.gasto !== null && orcamento.gasto > 0 && absorcao.leadsRecebidas === 0) {
    decisoes.push({
      regra: "gasto-sem-lead",
      acao: "pausar",
      motivo: "Houve gasto no período e nenhuma lead entrou.",
      proposta: "Pausar e conferir formulário, público e integração — gasto sem lead costuma ser defeito, não desempenho.",
      confianca: "medida",
      gravidade: 5,
    });
  }

  // ── 4. Absorção: a regra que funciona sem a conta de anúncios ─────────────
  if (absorcao.leadsRecebidas >= AMOSTRA_MINIMA) {
    const taxa = absorcao.leadsContatadas / absorcao.leadsRecebidas;
    if (taxa < ATENDIMENTO_CRITICO) {
      decisoes.push({
        regra: "operacao-nao-absorve",
        acao: "pausar",
        motivo: `Só ${Math.round(taxa * 100)}% das leads pagas foram contatadas. Comprar mais é desperdício integral.`,
        proposta: "Pausar a compra até a taxa de contato subir. O gargalo é atendimento, não mídia.",
        confianca: "medida",
        gravidade: 5,
      });
    } else if (taxa < ATENDIMENTO_BAIXO) {
      decisoes.push({
        regra: "operacao-nao-absorve",
        acao: "reduzir",
        motivo: `${Math.round(taxa * 100)}% das leads pagas foram contatadas.`,
        proposta: "Reduzir a verba até a equipe alcançar o volume que já entra.",
        confianca: "medida",
        gravidade: 3,
      });
    }
  } else if (absorcao.leadsRecebidas > 0) {
    naoAvaliado.push(`Taxa de atendimento: ${absorcao.leadsRecebidas} lead(s) no período — amostra pequena demais para virar decisão de verba.`);
  }

  // ── 5. Fila além da capacidade ────────────────────────────────────────────
  const fila = absorcao.leadsComSlaVencido + absorcao.leadsRepresadas;
  if (absorcao.corretoresAtivos > 0 && fila > absorcao.corretoresAtivos * LEADS_POR_CORRETOR_LIMITE) {
    decisoes.push({
      regra: "fila-acima-da-capacidade",
      acao: "pausar",
      motivo: `${fila} lead(s) pagas esperando para ${absorcao.corretoresAtivos} corretor(es) — ${Math.round(fila / absorcao.corretoresAtivos)} por pessoa.`,
      proposta: "Pausar a compra e trabalhar o que já foi pago antes de comprar mais.",
      confianca: "medida",
      gravidade: 4,
    });
  }

  // ── 6. Lead paga sem dono ─────────────────────────────────────────────────
  if (absorcao.leadsSemDono > 0) {
    decisoes.push({
      regra: "lead-paga-sem-dono",
      acao: absorcao.leadsSemDono >= 20 ? "pausar" : "reduzir",
      motivo: `${absorcao.leadsSemDono} lead(s) pagas sem responsável — ninguém é cobrado pelo prazo delas.`,
      proposta: "Distribuir a fila antes de aumentar a entrada.",
      confianca: "medida",
      gravidade: absorcao.leadsSemDono >= 20 ? 4 : 2,
    });
  }

  const acao = decisoes.reduce<Acao>((atual, d) => maisGrave(atual, d.acao), "seguir");
  return {
    acao,
    decisoes: decisoes.sort((a, b) => b.gravidade - a.gravidade),
    naoAvaliado,
    executaSozinho: false,
  };
}

/** Uma frase para o topo do painel. */
export function resumoDoStopLoss(veredito: VereditoDeStopLoss): string {
  if (veredito.acao === "pausar") return "Stop loss acionado: a recomendação é PARAR de comprar até resolver o que está listado.";
  if (veredito.acao === "reduzir") return "Stop loss em alerta: a recomendação é REDUZIR a entrada.";
  if (veredito.naoAvaliado.length) return "Sem gatilho acionado — mas parte das regras não pôde ser avaliada.";
  return "Nenhum gatilho de stop loss acionado.";
}

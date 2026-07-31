/**
 * A PRÓXIMA AÇÃO, E O GESTO QUE A EXECUTA.
 *
 * ── O que existia ──────────────────────────────────────────────────────────
 *
 * O bloco mais proeminente da ficha do cliente era três elementos de texto:
 *
 *     <span>Faça agora</span>
 *     <strong>Apresentar o imóvel com maior aderência e abrir oportunidade.</strong>
 *     <small>Risco médio · 0 tarefa(s) · 0 mensagem(ns)</small>
 *
 * Zero botões. Medido na produção. O produto ocupava o lugar de maior atenção
 * da tela para entregar ao corretor uma tarefa de LEITURA: ele lê a frase,
 * traduz para um gesto, e sai procurando onde executar. As ações existiam — do
 * outro lado da mesma barra, sem ligação nenhuma com a instrução.
 *
 * Instrução sem gesto ao lado é pior que instrução nenhuma: consome o espaço
 * nobre e devolve trabalho.
 *
 * ── A regra ────────────────────────────────────────────────────────────────
 *
 * Quatro situações, decididas por três fatos observáveis. Cada uma tem UM gesto
 * primário — nunca dois, nunca nenhum:
 *
 *   sem atividade ............ falar com a pessoa pela primeira vez
 *   oportunidades ilegíveis .. recarregar (e NADA além disso)
 *   sem oportunidade ......... mostrar o imóvel que mais adere
 *   com oportunidade ......... avançar a etapa
 *
 * ── A decisão que mais importa aqui ────────────────────────────────────────
 *
 * O caso "não foi possível ler as oportunidades" NÃO ganha gesto comercial.
 * Seria fácil oferecer "Apresentar imóvel" e seguir o fluxo — e seria mentira:
 * a base pode ter oportunidade aberta que ninguém viu. O único gesto honesto
 * quando não se sabe é REVER, não decidir. O produto já pagou caro por
 * confundir "não deu para ler" com "não existe".
 *
 * Módulo puro: sem React, sem banco, sem rede. A tela só desenha o que vem daqui.
 */

export type FatosDaProximaAcao = {
  /** Quantas interações já foram registradas com esta pessoa. */
  atividades: number;
  /** As oportunidades puderam ser lidas? `false` = falha de leitura, não ausência. */
  oportunidadesLegiveis: boolean;
  /** Quantas oportunidades abertas — só faz sentido quando legíveis. */
  oportunidades: number;
};

export type TipoDeGesto = "ligar" | "mensagem" | "imoveis" | "proposta" | "recarregar";

export type ProximaAcao = {
  /** A frase que explica POR QUE este é o passo. Fica como apoio, não como título. */
  instrucao: string;
  gesto: {
    /** Verbo primeiro, curto. É o que vai no botão. */
    rotulo: string;
    tipo: TipoDeGesto;
    /** Rota relativa ao lead, ou `null` quando o gesto não navega (recarregar). */
    destino: string | null;
  };
  /** Para a tela decidir ênfase — nunca para inventar um gesto diferente. */
  urgente: boolean;
};

/**
 * Decide o passo e o gesto.
 *
 * A ORDEM DOS RAMOS É A REGRA, e ela não é arbitrária: falar com quem nunca foi
 * contatado vem antes de qualquer análise, porque nenhuma inteligência sobre uma
 * lead vale mais do que o primeiro "alô" que ela ainda não recebeu.
 */
export function decidirProximaAcao(fatos: FatosDaProximaAcao): ProximaAcao {
  if (fatos.atividades <= 0) {
    return {
      instrucao: "Ninguém falou com esta pessoa ainda. O primeiro contato é o passo — e o relógio do SLA já está correndo.",
      gesto: { rotulo: "Ligar agora", tipo: "ligar", destino: null },
      urgente: true,
    };
  }

  if (!fatos.oportunidadesLegiveis) {
    // Sem gesto comercial aqui, de propósito. Ver o cabeçalho.
    return {
      instrucao: "Não foi possível ler as oportunidades desta lead agora. Isso NÃO quer dizer que não existam — recarregue antes de decidir qualquer coisa.",
      gesto: { rotulo: "Recarregar", tipo: "recarregar", destino: null },
      urgente: false,
    };
  }

  if (fatos.oportunidades <= 0) {
    return {
      instrucao: "Já houve conversa, mas nenhuma oportunidade aberta. O passo é mostrar o imóvel que mais adere ao que ela disse querer.",
      gesto: { rotulo: "Ver imóveis compatíveis", tipo: "imoveis", destino: "matching" },
      urgente: false,
    };
  }

  return {
    instrucao: `${fatos.oportunidades} oportunidade(s) aberta(s). O passo é tratar a objeção que travou e avançar a etapa.`,
    gesto: { rotulo: "Montar proposta", tipo: "proposta", destino: "simulation" },
    urgente: false,
  };
}

/**
 * O caminho completo do gesto, quando ele navega.
 *
 * Existe para que a tela não monte string de rota à mão — foi assim que
 * `properties/mtching` nasceu e sobreviveu em produção.
 */
export function caminhoDoGesto(leadId: string, acao: ProximaAcao): string | null {
  return acao.gesto.destino ? `/leads/${leadId}/${acao.gesto.destino}` : null;
}

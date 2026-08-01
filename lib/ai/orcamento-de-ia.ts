/**
 * ORÇAMENTO DA IA — os tetos, e o que acontece ao estourar.
 *
 * ── O que estava medido antes desta entrega (2026-07-30) ───────────────────
 *
 * O medidor de consumo JÁ EXISTIA e funciona: `ai_usage_events` tinha 43 linhas
 * reais no banco canônico, gravadas por `recordUsage()` no roteador. Quem disser
 * que "não existe registro de consumo" não olhou o banco.
 *
 * O que NÃO existia é o freio. Nada lia aquelas 43 linhas para decidir se a 44ª
 * chamada podia acontecer. Medir sem limitar é um velocímetro sem pedal.
 *
 * ── Três coisas que a medição obrigou a projetar diferente ─────────────────
 *
 * 1. O TETO NÃO PODE SER EM DINHEIRO (só).
 *    6 das 21 chamadas cobráveis (28,6%) têm `estimated_cost_usd` NULO — sem
 *    tarifa cadastrada, `usageCost()` devolve null de propósito, para não
 *    transformar ausência de preço em "de graça". Um teto em dólar somaria zero
 *    nessas 6 e as deixaria passar. O teto principal é em CHAMADAS e TOKENS,
 *    que toda linha tem. O de dólar é o segundo cinto.
 *
 * 2. CHAMADA SEM USUÁRIO NÃO PODE FICAR SEM TETO.
 *    15 das 43 (35%) não têm `user_id`: worker agendado e rota sem sessão. Um
 *    teto por usuário que só valesse quando há usuário deixaria 35% do tráfego
 *    passar livre — a exceção maior que a regra. Elas caem num balde
 *    compartilhado ("sem_atribuicao") com teto próprio.
 *
 * 3. O AGENTE NÃO ESTAVA GRAVADO.
 *    `ai_usage_events` não tinha coluna de agente; só `feature`. Sem ela,
 *    "limite por agente" era impossível de calcular. A migration
 *    20260730_orcamento_e_autonomia_da_ia acrescenta `agent` e a preenche a
 *    partir de `feature` para o histórico.
 *
 * ── Falha fechada ─────────────────────────────────────────────────────────
 *
 * Este módulo é PURO: nada de `server-only`, nada de rede. Recebe o consumo já
 * medido e devolve a decisão. Por isso o contrato pode EXECUTÁ-LO e ver recusar,
 * em vez de raspar o fonte procurando a palavra "teto".
 *
 * O default é limitado em três camadas independentes:
 *   · a constante embutida abaixo (vale mesmo se o JSON não for legível);
 *   · o valor do JSON, que é APARADO contra o teto absoluto;
 *   · o teto absoluto, que configuração alguma alcança.
 */

import fs from "node:fs";
import path from "node:path";

export type UnidadeDeTeto = "chamadas" | "tokens" | "usd";
export type EscopoDeTeto = "diario" | "usuario" | "agente" | "sem_atribuicao";

/**
 * AÇÃO AO ESTOURAR — exatamente as cinco do §8 do dono, mais "seguir".
 *
 * A ordem importa: são degraus, do mais barato para o mais drástico. Pular
 * direto para "recusar" é o que faz operador desligar o freio inteiro.
 */
export type AcaoDeTeto =
  | "seguir"
  | "usar_cache"
  | "trocar_para_modelo_economico"
  | "reduzir_processamento"
  | "pausar_rotina_nao_critica"
  | "recusar";

export type Tetos = {
  chamadasPorDia: number;
  tokensPorDia: number;
  chamadasPorUsuarioPorDia: number;
  tokensPorUsuarioPorDia: number;
  chamadasPorAgentePorDia: number;
  tokensPorAgentePorDia: number;
  tetoUsdDiario: number;
};

export type TetoAbsoluto = {
  chamadasPorDia: number;
  tokensPorDia: number;
  tetoUsdDiario: number;
};

/**
 * O TETO ABSOLUTO EMBUTIDO NO CÓDIGO.
 *
 * Repetido aqui de propósito, e não lido só do JSON: se o arquivo for apagado,
 * renomeado ou virar JSON inválido, o limite continua existindo. Um freio que
 * depende de um arquivo estar legível é um freio que some no pior momento.
 *
 * O contrato `orcamento-de-ia` reprova se estes números divergirem do JSON —
 * duas verdades sobre o mesmo teto é a doença que este repositório já pagou
 * caro para aprender (RPC e fallback que divergiram na chave).
 */
export const TETO_ABSOLUTO: TetoAbsoluto = {
  chamadasPorDia: 2000,
  tokensPorDia: 1_500_000,
  tetoUsdDiario: 25,
};

/**
 * O PADRÃO EMBUTIDO. Vale quando o JSON não é legível.
 *
 * Derivado por aritmética declarada sobre o pico medido em 2026-07-28
 * (15 chamadas / 9.185 tokens) × 10. Não é estimativa de mercado nem preço:
 * é um número medido multiplicado por um fator escrito.
 */
export const TETOS_PADRAO: Tetos = {
  chamadasPorDia: 150,
  tokensPorDia: 92_000,
  chamadasPorUsuarioPorDia: 40,
  tokensPorUsuarioPorDia: 25_000,
  chamadasPorAgentePorDia: 60,
  tokensPorAgentePorDia: 40_000,
  tetoUsdDiario: 2,
};

export const TETOS_SEM_ATRIBUICAO = { chamadasPorDia: 60, tokensPorDia: 40_000 };

/**
 * VALOR QUE NÃO PODE VIRAR "SEM TETO".
 *
 * Esta função é o coração da regra do dono ("nunca permitir cobrança ilimitada
 * por configuração padrão"). Tudo que significaria "sem limite" cai no padrão:
 *
 *   · ausente, null, undefined, "" → ninguém declarou; usa o padrão
 *   · Infinity, NaN, texto não numérico → não é teto; usa o padrão
 *   · negativo → não é teto; usa o padrão
 *   · acima do teto absoluto → APARADO no absoluto, com recusa registrada
 *
 * Zero é aceito e significa PAUSADO. É mais restritivo que o padrão, então não
 * há risco em respeitá-lo — e é como se desliga um agente sem deploy.
 */
export function tetoUtilizavel(
  configurado: unknown,
  padrao: number,
  absoluto: number,
): { valor: number; aparado: boolean; motivo: string | null } {
  if (configurado === null || configurado === undefined || configurado === "") {
    return { valor: Math.min(padrao, absoluto), aparado: false, motivo: null };
  }
  /**
   * Só número, ou texto que É um número. `Number()` sozinho não serve aqui, e o
   * contrato pegou o motivo: `Number([])` é 0 e `Number(["150"])` é 150. Um
   * array vazio no JSON viraria teto ZERO — a IA pararia inteira, em silêncio, e
   * o sintoma ("a IA não responde") não apontaria para um `[]` na configuração.
   * `Number(true)` é 1 pelo mesmo caminho.
   */
  const numero =
    typeof configurado === "number"
      ? configurado
      : typeof configurado === "string" && configurado.trim() !== ""
        ? Number(configurado)
        : NaN;
  if (!Number.isFinite(numero) || numero < 0) {
    return {
      valor: Math.min(padrao, absoluto),
      aparado: true,
      motivo: `valor de teto inválido (${String(configurado)}) — usando o padrão ${padrao}. Teto ilimitado não é configurável.`,
    };
  }
  if (numero > absoluto) {
    return {
      valor: absoluto,
      aparado: true,
      motivo: `teto configurado (${numero}) acima do teto absoluto (${absoluto}) — aparado. Configuração não afrouxa o teto absoluto.`,
    };
  }
  return { valor: numero, aparado: false, motivo: null };
}

type ArquivoDeOrcamento = {
  tetos?: Record<string, unknown>;
  tetoAbsoluto?: Record<string, unknown>;
  semAtribuicao?: Record<string, unknown>;
  tarefasEssenciais?: { features?: unknown };
  agentes?: { catalogo?: unknown };
  modoSombra?: { ligado?: unknown; acoesRetidas?: unknown };
};

let cacheDoArquivo: ArquivoDeOrcamento | null | undefined;

/**
 * Lê a declaração. Falha em silêncio de propósito: arquivo ilegível não pode
 * derrubar o atendimento comercial — mas também não pode afrouxar o teto, e não
 * afrouxa, porque o padrão embutido assume.
 */
export function arquivoDeOrcamento(): ArquivoDeOrcamento | null {
  if (cacheDoArquivo !== undefined) return cacheDoArquivo;
  try {
    const caminho = path.join(import.meta.dirname, "..", "..", "config", "orcamento-e-autonomia-da-ia.json");
    cacheDoArquivo = JSON.parse(fs.readFileSync(caminho, "utf8")) as ArquivoDeOrcamento;
  } catch {
    cacheDoArquivo = null;
  }
  return cacheDoArquivo;
}

/** Só para o contrato: obriga a reler o arquivo depois de mexer no ambiente. */
export function esquecerOrcamentoEmCache() {
  cacheDoArquivo = undefined;
}

export type OrcamentoResolvido = {
  tetos: Tetos;
  semAtribuicao: { chamadasPorDia: number; tokensPorDia: number };
  absoluto: TetoAbsoluto;
  aparos: string[];
  origem: "config" | "padrao_embutido";
  desligado: boolean;
};

/**
 * O orçamento em vigor, com os aparos que tiveram de ser feitos.
 *
 * `aparos` não é decoração: é o que o operador precisa ver para saber que o
 * número que ele escreveu não é o número que está valendo. Teto aparado em
 * silêncio é a mesma mentira de teto ausente.
 */
export function orcamentoEmVigor(env: Record<string, string | undefined> = process.env): OrcamentoResolvido {
  const arquivo = arquivoDeOrcamento();
  const aparos: string[] = [];

  const absolutoBruto = arquivo?.tetoAbsoluto ?? {};
  // O teto absoluto do JSON só pode ser MAIS APERTADO que o embutido, nunca mais
  // largo: senão o "teto que a configuração não alcança" seria alcançável pela
  // configuração, e a garantia inteira era decorativa.
  const absoluto: TetoAbsoluto = {
    chamadasPorDia: Math.min(
      TETO_ABSOLUTO.chamadasPorDia,
      tetoUtilizavel(absolutoBruto.chamadasPorDia, TETO_ABSOLUTO.chamadasPorDia, TETO_ABSOLUTO.chamadasPorDia).valor,
    ),
    tokensPorDia: Math.min(
      TETO_ABSOLUTO.tokensPorDia,
      tetoUtilizavel(absolutoBruto.tokensPorDia, TETO_ABSOLUTO.tokensPorDia, TETO_ABSOLUTO.tokensPorDia).valor,
    ),
    tetoUsdDiario: Math.min(
      TETO_ABSOLUTO.tetoUsdDiario,
      tetoUtilizavel(absolutoBruto.tetoUsdDiario, TETO_ABSOLUTO.tetoUsdDiario, TETO_ABSOLUTO.tetoUsdDiario).valor,
    ),
  };

  const bruto = arquivo?.tetos ?? {};
  const resolver = (chave: keyof Tetos, absolutoDaChave: number): number => {
    const { valor, motivo } = tetoUtilizavel(bruto[chave], TETOS_PADRAO[chave], absolutoDaChave);
    if (motivo) aparos.push(`tetos.${chave}: ${motivo}`);
    return valor;
  };

  const tetos: Tetos = {
    chamadasPorDia: resolver("chamadasPorDia", absoluto.chamadasPorDia),
    tokensPorDia: resolver("tokensPorDia", absoluto.tokensPorDia),
    // Teto por usuário/agente nunca passa do teto do dia inteiro: um usuário
    // autorizado a mais que a organização toda é teto que não limita nada.
    chamadasPorUsuarioPorDia: resolver("chamadasPorUsuarioPorDia", absoluto.chamadasPorDia),
    tokensPorUsuarioPorDia: resolver("tokensPorUsuarioPorDia", absoluto.tokensPorDia),
    chamadasPorAgentePorDia: resolver("chamadasPorAgentePorDia", absoluto.chamadasPorDia),
    tokensPorAgentePorDia: resolver("tokensPorAgentePorDia", absoluto.tokensPorDia),
    tetoUsdDiario: resolver("tetoUsdDiario", absoluto.tetoUsdDiario),
  };

  const semAtrBruto = arquivo?.semAtribuicao ?? {};
  const semAtribuicao = {
    chamadasPorDia: tetoUtilizavel(semAtrBruto.chamadasPorDia, TETOS_SEM_ATRIBUICAO.chamadasPorDia, tetos.chamadasPorDia).valor,
    tokensPorDia: tetoUtilizavel(semAtrBruto.tokensPorDia, TETOS_SEM_ATRIBUICAO.tokensPorDia, tetos.tokensPorDia).valor,
  };

  return {
    tetos,
    semAtribuicao,
    absoluto,
    aparos,
    origem: arquivo ? "config" : "padrao_embutido",
    desligado: String(env.ATLAS_IA_ORCAMENTO_DESLIGADO || "").trim() === "1",
  };
}

/** Features que o corretor está esperando na tela. Ver o §8 no JSON. */
export function tarefasEssenciais(): string[] {
  const lista = arquivoDeOrcamento()?.tarefasEssenciais?.features;
  if (!Array.isArray(lista) || !lista.length) {
    // Falha fechada tem duas faces. Aqui, fechar seria tratar TUDO como não
    // essencial e cortar o atendimento na tela ao primeiro estouro. A lista
    // embutida evita isso sem afrouxar teto nenhum.
    return ["copilot", "lead-qualification", "message-draft", "presentation-draft", "conversational-qualification"];
  }
  return lista.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function ehTarefaEssencial(feature: string): boolean {
  const nome = String(feature || "").trim().toLowerCase();
  if (!nome) return false;
  // Casa por prefixo porque as features reais gravadas em ai_usage_events são
  // compostas: "creative-studio.briefing", "creative-studio.copies".
  return tarefasEssenciais().some((essencial) => {
    const e = essencial.toLowerCase();
    return nome === e || nome.startsWith(`${e}.`);
  });
}

export type ConsumoMedido = {
  /** Chamadas da organização hoje. */
  chamadasDoDia: number;
  tokensDoDia: number;
  /**
   * Soma em dólar das chamadas COM tarifa cadastrada. `null` quando nenhuma
   * tinha tarifa — e aí o teto de dólar não opina, em vez de afirmar zero.
   */
  usdDoDia: number | null;
  /** Quantas cobráveis de hoje ficaram sem custo medido. Entra no relatório. */
  cobraveisSemCustoMedido: number;
  chamadasDoUsuario: number;
  tokensDoUsuario: number;
  chamadasDoAgente: number;
  tokensDoAgente: number;
};

export type PedidoDeIA = {
  feature: string;
  agente: string;
  /** Ausente/nulo = chamada sem atribuição: cai no balde compartilhado. */
  usuarioId?: string | null;
  /** Tokens que a chamada deve consumir, se já houver estimativa. */
  tokensEstimados?: number;
};

export type VeredictoDeTeto = {
  permitido: boolean;
  acao: AcaoDeTeto;
  /** Degraus acionados, do mais leve ao mais grave. */
  degraus: AcaoDeTeto[];
  motivos: string[];
  /** Qual teto encostou, para o relatório dizer QUAL apertou. */
  tetosEstourados: Array<{ escopo: EscopoDeTeto; unidade: UnidadeDeTeto; usado: number; teto: number }>;
  essencial: boolean;
  /** Verdade quando o dólar não pôde ser avaliado por falta de tarifa. */
  custoNaoMedido: boolean;
};

/**
 * A DECISÃO. Puro: entra consumo medido, sai veredicto.
 *
 * ── A resposta é GRADUADA, não binária ────────────────────────────────────
 *
 * O §8 do dono lista cinco reações antes de recusar: trocar para modelo
 * econômico, usar cache, reduzir processamento, pausar rotina não crítica,
 * impedir tarefa não essencial. Um limitador que só sabe dizer "não" faz o
 * operador desligá-lo na primeira sexta-feira movimentada.
 *
 * Os degraus disparam por FAIXA de uso do teto:
 *   ≥ 70%  → usar cache (a chamada acontece, mas prefere resultado guardado)
 *   ≥ 85%  → trocar para modelo econômico + reduzir processamento
 *   ≥ 100% → pausar rotina não crítica; tarefa não essencial é RECUSADA
 *
 * ── O ponto que decide se isto protege de verdade ─────────────────────────
 *
 * No estouro, tarefa ESSENCIAL não é recusada: ela é degradada (cache, modelo
 * econômico, menos processamento) e segue. Se fosse recusada, o corretor
 * perderia a ferramenta no meio do atendimento e a decisão comercial pioraria
 * por causa de um teto — exatamente o oposto do que o teto existe para fazer.
 *
 * Tarefa NÃO essencial é recusada, e é aí que a economia acontece.
 *
 * ── E o teto absoluto ─────────────────────────────────────────────────────
 *
 * Passar do teto ABSOLUTO recusa TUDO, essencial incluído. Nesse ponto não é
 * mais aperto de orçamento: é sinal de laço infinito ou de chave vazando, e
 * seguir gastando seria pior para o dono que ficar sem a IA por algumas horas.
 */
export function decidirSobreOTeto(
  pedido: PedidoDeIA,
  consumo: ConsumoMedido,
  orcamento: OrcamentoResolvido = orcamentoEmVigor(),
): VeredictoDeTeto {
  const essencial = ehTarefaEssencial(pedido.feature);
  const motivos: string[] = [];
  const estourados: VeredictoDeTeto["tetosEstourados"] = [];
  const degraus: AcaoDeTeto[] = [];
  const custoNaoMedido = consumo.usdDoDia === null;

  if (orcamento.desligado) {
    return {
      permitido: true,
      acao: "seguir",
      degraus: [],
      motivos: ["ATLAS_IA_ORCAMENTO_DESLIGADO=1 — freio desativado por decisão explícita; o registro de consumo continua."],
      tetosEstourados: [],
      essencial,
      custoNaoMedido,
    };
  }

  const semUsuario = !pedido.usuarioId || !String(pedido.usuarioId).trim();

  /** Uma raia de teto. Devolve a fração usada, e registra se estourou. */
  const raia = (escopo: EscopoDeTeto, unidade: UnidadeDeTeto, usado: number, teto: number) => {
    // Teto zero significa pausado: estourou sempre, e dividir por zero não
    // produz fração utilizável. Trata explicitamente.
    if (teto <= 0) {
      estourados.push({ escopo, unidade, usado, teto });
      motivos.push(`${escopo}/${unidade}: teto ${teto} — escopo pausado por configuração.`);
      return 1;
    }
    const fracao = usado / teto;
    if (fracao >= 1) {
      estourados.push({ escopo, unidade, usado, teto });
      motivos.push(`${escopo}/${unidade}: ${usado} de ${teto} — teto estourado.`);
    }
    return fracao;
  };

  const fracoes = [
    raia("diario", "chamadas", consumo.chamadasDoDia, orcamento.tetos.chamadasPorDia),
    raia("diario", "tokens", consumo.tokensDoDia, orcamento.tetos.tokensPorDia),
    raia("agente", "chamadas", consumo.chamadasDoAgente, orcamento.tetos.chamadasPorAgentePorDia),
    raia("agente", "tokens", consumo.tokensDoAgente, orcamento.tetos.tokensPorAgentePorDia),
    semUsuario
      // 35% do tráfego medido não tem usuário. Sem esta raia, ele não teria teto.
      ? raia("sem_atribuicao", "chamadas", consumo.chamadasDoUsuario, orcamento.semAtribuicao.chamadasPorDia)
      : raia("usuario", "chamadas", consumo.chamadasDoUsuario, orcamento.tetos.chamadasPorUsuarioPorDia),
    semUsuario
      ? raia("sem_atribuicao", "tokens", consumo.tokensDoUsuario, orcamento.semAtribuicao.tokensPorDia)
      : raia("usuario", "tokens", consumo.tokensDoUsuario, orcamento.tetos.tokensPorUsuarioPorDia),
  ];

  // O dólar só entra quando FOI medido. Somar null como zero é o que faria o
  // teto de dinheiro ignorar 28,6% das chamadas cobráveis.
  if (consumo.usdDoDia !== null) {
    fracoes.push(raia("diario", "usd", consumo.usdDoDia, orcamento.tetos.tetoUsdDiario));
  } else {
    motivos.push(
      `Custo em dólar não avaliado: nenhuma tarifa cadastrada para as chamadas de hoje (${consumo.cobraveisSemCustoMedido} cobrável[eis] sem custo medido). O teto que vale é o de chamadas e tokens. Preço a confirmar em ATLAS_AI_PRICE_TABLE.`,
    );
  }

  const pior = Math.max(0, ...fracoes);

  // ── Teto absoluto: recusa tudo, essencial incluído ──────────────────────
  const estourouAbsoluto =
    consumo.chamadasDoDia >= orcamento.absoluto.chamadasPorDia ||
    consumo.tokensDoDia >= orcamento.absoluto.tokensPorDia ||
    (consumo.usdDoDia !== null && consumo.usdDoDia >= orcamento.absoluto.tetoUsdDiario);
  if (estourouAbsoluto) {
    estourados.push({ escopo: "diario", unidade: "chamadas", usado: consumo.chamadasDoDia, teto: orcamento.absoluto.chamadasPorDia });
    return {
      permitido: false,
      acao: "recusar",
      degraus: ["recusar"],
      motivos: [
        ...motivos,
        `TETO ABSOLUTO estourado (${consumo.chamadasDoDia} chamadas / ${consumo.tokensDoDia} tokens hoje). Nada roda, nem tarefa essencial: neste ponto o sintoma é laço infinito ou chave vazando, não pico de uso.`,
      ],
      tetosEstourados: estourados,
      essencial,
      custoNaoMedido,
    };
  }

  if (pior >= 0.7) degraus.push("usar_cache");
  if (pior >= 0.85) {
    degraus.push("trocar_para_modelo_economico");
    degraus.push("reduzir_processamento");
  }
  if (pior >= 1) degraus.push("pausar_rotina_nao_critica");

  if (pior >= 1 && !essencial) {
    return {
      permitido: false,
      acao: "recusar",
      degraus: [...degraus, "recusar"],
      motivos: [...motivos, `Tarefa não essencial (${pedido.feature}) recusada com o teto estourado. Rode amanhã ou peça ao dono para ampliar o teto.`],
      tetosEstourados: estourados,
      essencial,
      custoNaoMedido,
    };
  }

  if (pior >= 1) {
    motivos.push(
      `Tarefa essencial (${pedido.feature}) segue COM DEGRADAÇÃO apesar do teto estourado: o corretor está esperando na tela. Recusá-la faria o teto piorar a decisão comercial que ele existe para proteger.`,
    );
  }

  return {
    permitido: true,
    acao: degraus.length ? degraus[degraus.length - 1] : "seguir",
    degraus,
    motivos,
    tetosEstourados: estourados,
    essencial,
    custoNaoMedido,
  };
}

/**
 * Consumo zerado — o ponto de partida quando a medição não pôde ser lida.
 *
 * ── Por que ZERO e não "estourado" ────────────────────────────────────────
 *
 * Parece o oposto de falha fechada, e a escolha é deliberada. Se o banco não
 * responde, tratar como estourado desliga a IA de toda a operação por causa de
 * uma indisponibilidade de leitura — e o teto passaria a ser uma NOVA causa de
 * queda, mais provável que o gasto que ele evita.
 *
 * O que garante o outro lado é que os tetos continuam existindo e as camadas de
 * cima não dependem desta leitura: `TETO_ABSOLUTO` está no código, o modo sombra
 * segue retendo ação externa, e a falha de leitura é registrada como aviso.
 * Falha fechada aqui é sobre o TETO nunca virar infinito — e ele não vira.
 */
export function consumoNaoMedido(): ConsumoMedido {
  return {
    chamadasDoDia: 0,
    tokensDoDia: 0,
    usdDoDia: null,
    cobraveisSemCustoMedido: 0,
    chamadasDoUsuario: 0,
    tokensDoUsuario: 0,
    chamadasDoAgente: 0,
    tokensDoAgente: 0,
  };
}

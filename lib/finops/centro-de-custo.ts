/**
 * CENTRO DE CUSTO DE TECNOLOGIA (§8) — o núcleo que se recusa a inventar número.
 *
 * ── POR QUE ESTE MÓDULO EXISTE, E POR QUE ELE É PARANOICO ────────────────────
 *
 * Um painel de custos que inventa número é PIOR que painel nenhum: ele produz
 * decisão de verba com lastro falso, e ninguém desconfia de um painel.
 *
 * Este repositório já pagou por essa doença. `/api/ready` publicava
 * `smtp: "via-supabase-auth"` a partir de uma checagem do BANCO — um status que
 * nunca podia ficar vermelho, porque não media SMTP nenhum. "Ausência não
 * declarada é indistinguível de zero."
 *
 * Em custo o estrago é maior, porque zero tem significado comercial: um painel
 * que soma R$ 0,00 de WhatsApp porque não sabe medir WhatsApp está AFIRMANDO que
 * WhatsApp é de graça. E a regra permanente do dono é: "não inventar preços,
 * métricas ou informações comerciais."
 *
 * ── A DECISÃO DE DESENHO ─────────────────────────────────────────────────────
 *
 * Custo não é `number`. Custo é uma UNIÃO DISCRIMINADA de três estados, e o
 * sistema de tipos impede que o não medido seja somado:
 *
 *   · `medido`       — tem valor E tem procedência. Vale para a soma.
 *   · `nao_medido`   — tem MOTIVO e NÃO TEM CAMPO NUMÉRICO. Nem 0, nem null:
 *                      o campo não existe. Não há como somá-lo por descuido.
 *   · `sem_servico`  — vale zero, e o zero é a verdade porque o serviço não
 *                      existe no produto. Estado separado de `medido` para que
 *                      a tela diga "não há esse serviço", e não "custa R$ 0".
 *
 * `nao_medido` não carregar campo numérico é a defesa central. Se o estado
 * fosse `{ medido: false, valor: 0 }`, bastaria um `reduce` distraído para
 * publicar zero. Sem o campo, o `reduce` não compila.
 *
 * ── CONSUMO E CUSTO SÃO COISAS DIFERENTES ────────────────────────────────────
 *
 * A distinção que mais importa na prática, e que foi MEDIDA em 2026-07-30 no
 * banco canônico: das 21 chamadas de IA à Perplexity, 15 têm custo
 * (US$ 0,011459) e 6 têm `estimated_cost_usd` NULO — 3.317 tokens consumidos
 * cujo preço o banco não sabe, porque a tarifa não estava cadastrada na hora.
 *
 * Ou seja: o CONSUMO está medido e o CUSTO não. Uma linha pode ter
 * `consumo.medido = true` e `custo.estado = "nao_medido"` ao mesmo tempo, e isso
 * é a situação mais comum hoje. Colapsar as duas coisas num campo só é como se
 * perde a informação.
 *
 * ── LIMITE DE ESCOPO, DECLARADO ──────────────────────────────────────────────
 *
 * Este módulo é PURO: sem `server-only`, sem rede, sem banco. Isso é deliberado
 * — `lib/ai/provider-router.ts` importa `server-only` e por isso nenhum teste
 * consegue carregá-lo; o portão de tarifas passou a raspar o fonte com regex e
 * ficou CEGO (acusava um modelo que só existia dentro de um comentário). Aqui a
 * regra é dado importável, para o contrato poder EXECUTAR em vez de gravar.
 *
 * Quem mede é a rota (`app/api/v1/finops/cost-center/route.ts`). Quem decide o
 * que pode ser publicado é este arquivo.
 */

/**
 * De onde um número veio. É enumeração fechada de propósito: transformar
 * "não medido" em zero exige INVENTAR uma procedência, e `defeitosDaPublicacao`
 * cobra coerência entre a procedência declarada e os campos presentes.
 *
 * · `banco`                — contagem/soma numa tabela do Postgres canônico.
 * · `api_de_gestao`        — API de gestão do provedor (ex.: plano do Supabase).
 * · `tarifa_declarada`     — preço que o OPERADOR declarou em variável de
 *                            ambiente. Declarado não é medido pelo provedor,
 *                            mas tem dono e é auditável; exige `tarifa`.
 * · `varredura_de_codigo`  — ausência de integração comprovada por varredura.
 *                            Só sustenta `sem_servico`, nunca um valor > 0.
 */
export type FonteDeMedicao = "banco" | "api_de_gestao" | "tarifa_declarada" | "varredura_de_codigo";

export const FONTES_DE_MEDICAO: readonly FonteDeMedicao[] = [
  "banco",
  "api_de_gestao",
  "tarifa_declarada",
  "varredura_de_codigo",
] as const;

/** Custo de uma linha. Note que `nao_medido` NÃO tem campo de valor. */
export type CustoDaLinha =
  | { estado: "medido"; valorUsd: number; fonte: FonteDeMedicao; comoFoiMedido: string; tarifa?: string }
  | { estado: "nao_medido"; motivo: string }
  | { estado: "sem_servico"; fonte: FonteDeMedicao; evidencia: string };

/** Consumo observado. Também pode ser não medido, independentemente do custo. */
export type ConsumoDaLinha =
  | { estado: "medido"; valor: number; unidade: string; fonte: FonteDeMedicao; comoFoiMedido: string }
  | { estado: "nao_medido"; motivo: string };

export type LinhaDeCusto = {
  /** Chave estável — é por ela que o contrato e a tela se referem à linha. */
  chave: string;
  rotulo: string;
  /** A que serviço/fornecedor a linha pertence (para o corte "por serviço"). */
  servico: string;
  custo: CustoDaLinha;
  consumo: ConsumoDaLinha;
};

/* ────────────────────────────────────────────────────────────────────────────
 * CONSTRUTORES — a única forma sancionada de criar uma linha.
 * Recebem o mínimo indispensável e recusam a construção incompleta, porque
 * "medido sem procedência" é exatamente o número inventado que combatemos.
 * ──────────────────────────────────────────────────────────────────────────── */

export function custoMedido(
  valorUsd: number,
  fonte: FonteDeMedicao,
  comoFoiMedido: string,
  tarifa?: string,
): CustoDaLinha {
  if (!Number.isFinite(valorUsd) || valorUsd < 0) {
    return { estado: "nao_medido", motivo: `valor de custo inválido (${String(valorUsd)}) — recusado em vez de publicado` };
  }
  if (!comoFoiMedido.trim()) {
    return { estado: "nao_medido", motivo: "custo sem procedência declarada — número sem lastro não é publicado" };
  }
  // Varredura de código prova AUSÊNCIA de integração. Ela não pode sustentar um
  // valor: nenhuma leitura de fonte sabe quanto o provedor cobrou.
  if (fonte === "varredura_de_codigo" && valorUsd > 0) {
    return { estado: "nao_medido", motivo: "varredura de código não mede valor gasto — só ausência de integração" };
  }
  return { estado: "medido", valorUsd, fonte, comoFoiMedido, ...(tarifa ? { tarifa } : {}) };
}

export function custoNaoMedido(motivo: string): CustoDaLinha {
  return { estado: "nao_medido", motivo: motivo.trim() || "motivo não declarado" };
}

/**
 * Zero verdadeiro: o serviço não existe no produto, então não há consumo a
 * cobrar. Exige EVIDÊNCIA — dizer "não usamos mapas" sem mostrar a varredura é
 * a mesma aposta que "smtp: via-supabase-auth".
 */
export function semServico(fonte: FonteDeMedicao, evidencia: string): CustoDaLinha {
  if (!evidencia.trim()) return custoNaoMedido("ausência de serviço afirmada sem evidência");
  return { estado: "sem_servico", fonte, evidencia };
}

export function consumoMedido(
  valor: number,
  unidade: string,
  fonte: FonteDeMedicao,
  comoFoiMedido: string,
): ConsumoDaLinha {
  if (!Number.isFinite(valor) || valor < 0) return { estado: "nao_medido", motivo: `consumo inválido (${String(valor)})` };
  if (!unidade.trim() || !comoFoiMedido.trim()) return { estado: "nao_medido", motivo: "consumo sem unidade ou sem procedência" };
  return { estado: "medido", valor, unidade, fonte, comoFoiMedido };
}

export function consumoNaoMedido(motivo: string): ConsumoDaLinha {
  return { estado: "nao_medido", motivo: motivo.trim() || "motivo não declarado" };
}

/* ────────────────────────────────────────────────────────────────────────────
 * SOMA — e a declaração honesta do que ficou de fora dela.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Somatorio = {
  /** Soma APENAS do que está medido. Nunca inclui estimativa. */
  totalMedidoUsd: number;
  /** Chaves que entraram na soma. */
  chavesMedidas: string[];
  /** Chaves fora da soma, com o motivo — é isto que a tela precisa mostrar. */
  chavesNaoMedidas: { chave: string; rotulo: string; motivo: string }[];
  /** Chaves cujo zero é verdade porque o serviço não existe. */
  chavesSemServico: string[];
  /**
   * Fração das linhas CONHECIDAS cujo custo o painel realmente cobre.
   * `sem_servico` conta como coberta: saber que não existe é saber.
   * `null` quando não há linha alguma — 0/0 não é 0%.
   */
  fracaoCoberta: number | null;
  /** A frase que a tela deve exibir. Nunca finge cobertura total. */
  cobertura: string;
};

export function somarLinhas(linhas: LinhaDeCusto[]): Somatorio {
  let totalMedidoUsd = 0;
  const chavesMedidas: string[] = [];
  const chavesNaoMedidas: Somatorio["chavesNaoMedidas"] = [];
  const chavesSemServico: string[] = [];

  for (const linha of linhas) {
    if (linha.custo.estado === "medido") {
      totalMedidoUsd += linha.custo.valorUsd;
      chavesMedidas.push(linha.chave);
    } else if (linha.custo.estado === "sem_servico") {
      chavesSemServico.push(linha.chave);
    } else {
      chavesNaoMedidas.push({ chave: linha.chave, rotulo: linha.rotulo, motivo: linha.custo.motivo });
    }
  }

  const total = linhas.length;
  const cobertas = chavesMedidas.length + chavesSemServico.length;
  const fracaoCoberta = total === 0 ? null : cobertas / total;

  const cobertura =
    fracaoCoberta === null
      ? "nenhuma linha de custo cadastrada — não há cobertura a declarar"
      : chavesNaoMedidas.length === 0
        ? `cobrindo ${cobertas} de ${total} linhas de custo conhecidas (100%)`
        : `cobrindo ${cobertas} de ${total} linhas de custo conhecidas (${Math.round(fracaoCoberta * 100)}%) — ${chavesNaoMedidas.length} linha(s) NÃO medida(s) ficam fora deste total`;

  return {
    totalMedidoUsd: Math.round(totalMedidoUsd * 1e8) / 1e8,
    chavesMedidas,
    chavesNaoMedidas,
    chavesSemServico,
    fracaoCoberta,
    cobertura,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * CÂMBIO — o teto é em reais, o consumo de IA é cobrado em dólar.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Converte para BRL usando taxa DECLARADA pelo operador (`ATLAS_USD_BRL`).
 *
 * ── Por que não há taxa padrão ───────────────────────────────────────────────
 *
 * Porque taxa de câmbio é PREÇO, e chutar 5,40 produziria um total em reais que
 * parece medido e não é. Medido em 2026-07-30: `ATLAS_USD_BRL` está AUSENTE do
 * ambiente. A consequência honesta é que o total em reais fica NÃO MEDIDO — e,
 * com ele, a comparação contra o teto de R$ 250/mês da Fase 1.
 *
 * Preencher a variável resolve. Inventar a taxa não: sem lastro, sem número.
 */
export function converterParaBrl(
  valorUsd: number | null,
  taxaDeclarada: string | number | undefined | null,
): CustoDaLinha {
  const taxa = Number(String(taxaDeclarada ?? "").trim());
  if (!Number.isFinite(taxa) || taxa <= 0) {
    return custoNaoMedido(
      "conversão para reais indisponível: ATLAS_USD_BRL não está declarada. Taxa de câmbio é preço — sem declaração, não se estima.",
    );
  }
  if (valorUsd === null || !Number.isFinite(valorUsd)) {
    return custoNaoMedido("não há total em dólar medido para converter");
  }
  return custoMedido(
    valorUsd * taxa,
    "tarifa_declarada",
    `total medido em dólar (US$ ${valorUsd.toFixed(6)}) convertido pela taxa declarada em ATLAS_USD_BRL`,
    `USD→BRL = ${taxa}`,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CUSTO UNITÁRIO — e a divisão por zero, que não é zero.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Custo por unidade de negócio (lead, atendimento, venda, usuário).
 *
 * ── A armadilha que este código evita ────────────────────────────────────────
 *
 * Medido em 2026-07-30: a organização Atlas One tem 1 lead em `ganho` e
 * ZERO leads com `sale_value_brl` preenchido. "Custo por venda" com denominador
 * zero não é R$ 0,00 e não é infinito: é NÃO MEDIDO, com o motivo "0 vendas
 * registradas no período". Publicar R$ 0,00 diria que vender não custa nada;
 * publicar o total inteiro diria que houve uma venda.
 */
export function custoUnitario(
  totalUsd: number | null,
  denominador: number,
  nomeDoDenominador: string,
  comoFoiMedido: string,
): CustoDaLinha {
  if (totalUsd === null || !Number.isFinite(totalUsd)) {
    return custoNaoMedido(`custo total não medido — não há numerador para dividir por ${nomeDoDenominador}`);
  }
  if (!Number.isFinite(denominador) || denominador <= 0) {
    return custoNaoMedido(
      `0 ${nomeDoDenominador} no período — divisão por zero não é zero, e o custo unitário fica indefinido`,
    );
  }
  return custoMedido(totalUsd / denominador, "banco", `${comoFoiMedido} ÷ ${denominador} ${nomeDoDenominador}`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * PROJEÇÃO DO MÊS — pró-rata declarado, nunca disfarçado de medição.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Projecao =
  | { estado: "projetado"; valorUsd: number; metodo: string; diasCorridos: number; diasNoMes: number; alerta: string }
  | { estado: "nao_projetavel"; motivo: string };

/**
 * Projeta o fechamento do mês por regra determinística (pró-rata linear).
 *
 * A projeção NUNCA é apresentada como medição: o estado é `projetado`, o método
 * vai escrito, e `alerta` carrega a fragilidade — se o total medido cobre só
 * parte do custo, a projeção herda o mesmo buraco, e dizer isso é obrigatório.
 *
 * Regra determinística antes de IA, como manda a especificação: não há modelo
 * aqui, há uma divisão.
 */
export function projetarFechamentoDoMes(
  totalMedidoUsd: number | null,
  diasCorridos: number,
  diasNoMes: number,
  cobertura: string,
): Projecao {
  if (totalMedidoUsd === null || !Number.isFinite(totalMedidoUsd)) {
    return { estado: "nao_projetavel", motivo: "sem total medido no mês, não há o que projetar" };
  }
  if (!Number.isFinite(diasCorridos) || diasCorridos <= 0 || !Number.isFinite(diasNoMes) || diasNoMes <= 0) {
    return { estado: "nao_projetavel", motivo: "janela do mês inválida" };
  }
  const valorUsd = (totalMedidoUsd / diasCorridos) * diasNoMes;
  return {
    estado: "projetado",
    valorUsd: Math.round(valorUsd * 1e8) / 1e8,
    metodo: `pró-rata linear: total medido ÷ ${diasCorridos} dias corridos × ${diasNoMes} dias do mês`,
    diasCorridos,
    diasNoMes,
    alerta: `projeção, não medição — e herda a cobertura parcial do total (${cobertura})`,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * ORÇAMENTO E ALERTAS 50/75/90/100%
 * ──────────────────────────────────────────────────────────────────────────── */

/** Teto de custo técnico adicional da Fase 1, em reais por mês, conforme a
 *  especificação escrita pelo dono. É valor DECLARADO por ele, não medido — e
 *  está aqui, num lugar só, para não ser reescrito em dois. */
export const TETO_FASE_1_BRL = { minimo: 0, maximo: 250 } as const;

export const NIVEIS_DE_ALERTA = [50, 75, 90, 100] as const;
export type NivelDeAlerta = (typeof NIVEIS_DE_ALERTA)[number];

export type AlertaDeOrcamento =
  | {
      estado: "avaliado";
      percentualDoTeto: number;
      nivelAtingido: NivelDeAlerta | null;
      dentroDoTeto: boolean;
      /** A ressalva obrigatória: o alerta vale sobre a parcela medida. */
      ressalva: string;
      mensagem: string;
    }
  | { estado: "indeterminado"; motivo: string };

/**
 * Alerta de orçamento sobre o que É medido.
 *
 * ── Por que a ressalva é obrigatória e não opcional ──────────────────────────
 *
 * Um alerta em "4% do teto" calculado sobre 1 de 8 linhas de custo é uma
 * afirmação falsa sobre o mês. O número pode ser útil, mas só acompanhado da
 * fração que ele cobre — por isso `ressalva` é campo do tipo, não parâmetro
 * opcional: quem consome não consegue esquecer de exibir.
 *
 * E quando não há total em reais (falta a taxa de câmbio declarada), o veredito
 * é `indeterminado`. Não existe "0% do teto" por falta de dado.
 */
export function avaliarOrcamento(
  gastoMedidoBrl: number | null,
  tetoBrl: number | null,
  fracaoCoberta: number | null,
  linhasNaoMedidas: number,
): AlertaDeOrcamento {
  if (gastoMedidoBrl === null || !Number.isFinite(gastoMedidoBrl)) {
    return {
      estado: "indeterminado",
      motivo:
        "gasto em reais não medido — sem ele não há percentual do teto. Não se publica 0% por ausência de dado.",
    };
  }
  if (tetoBrl === null || !Number.isFinite(tetoBrl) || tetoBrl <= 0) {
    return { estado: "indeterminado", motivo: "teto de orçamento não declarado" };
  }

  /**
   * A razão EXATA decide o degrau; o arredondamento só existe para a tela.
   *
   * ── O defeito que o contrato pegou ───────────────────────────────────────
   *
   * A primeira versão fazia `Math.round(razão * 10000) / 100`, e com R$ 249,99
   * de R$ 250,00 isso dava 99,996% → arredondado para 100,00% → degrau 100 →
   * a mensagem "TETO ESTOURADO" com um centavo de folga. Um alerta de estouro
   * falso queima a confiança no painel inteiro, e depois do segundo ninguém
   * mais olha o vermelho.
   *
   * `Math.floor` na exibição garante o outro lado: o percentual mostrado nunca
   * é MAIOR que o real. Errar para baixo na exibição é arriscar não avisar;
   * errar para cima é avisar errado. Como o degrau é decidido pela razão exata,
   * o aviso continua acontecendo na hora certa e só o texto fica conservador.
   */
  const razao = (gastoMedidoBrl / tetoBrl) * 100;
  const percentualDoTeto = Math.floor(razao * 100) / 100;
  let nivelAtingido: NivelDeAlerta | null = null;
  for (const nivel of NIVEIS_DE_ALERTA) if (razao >= nivel) nivelAtingido = nivel;

  const pctCobertura = fracaoCoberta === null ? null : Math.round(fracaoCoberta * 100);
  const ressalva =
    linhasNaoMedidas === 0
      ? "todas as linhas de custo conhecidas estão medidas"
      : `este percentual considera SÓ a parcela medida${pctCobertura === null ? "" : ` (${pctCobertura}% das linhas)`} — ${linhasNaoMedidas} linha(s) não medida(s) podem levar o gasto real acima disto`;

  const mensagem =
    nivelAtingido === null
      ? `${percentualDoTeto}% do teto na parcela medida — abaixo do primeiro alerta (${NIVEIS_DE_ALERTA[0]}%)`
      : nivelAtingido >= 100
        ? `TETO ESTOURADO na parcela medida: ${percentualDoTeto}% de R$ ${tetoBrl.toFixed(2)}`
        : `alerta de ${nivelAtingido}%: a parcela medida já consumiu ${percentualDoTeto}% do teto de R$ ${tetoBrl.toFixed(2)}`;

  return {
    estado: "avaliado",
    percentualDoTeto,
    nivelAtingido,
    // Decidido pela razão exata, pelo mesmo motivo do degrau: R$ 249,99 de
    // R$ 250,00 está DENTRO do teto, e nenhum arredondamento pode dizer o
    // contrário.
    dentroDoTeto: razao < 100,
    ressalva,
    mensagem,
  };
}

/**
 * VEREDITO CONTRA O TETO DA FASE 1 — dentro, fora, ou não dá para saber.
 *
 * A terceira opção existe porque é a verdadeira hoje, e omiti-la forçaria uma
 * resposta falsa. O gate da Fase 2 (5.13) exige "custo mensal medido": um
 * veredito `indeterminado` é a resposta correta enquanto houver linha não
 * medida, e é ela que impede o gate de abrir por engano.
 */
export function vereditoDoTetoDaFase1(alerta: AlertaDeOrcamento, linhasNaoMedidas: number): {
  veredito: "dentro" | "fora" | "indeterminado";
  porque: string;
} {
  if (alerta.estado === "indeterminado") {
    return { veredito: "indeterminado", porque: alerta.motivo };
  }
  if (linhasNaoMedidas > 0) {
    return {
      veredito: "indeterminado",
      porque: `a parcela medida está em ${alerta.percentualDoTeto}% do teto, mas ${linhasNaoMedidas} linha(s) de custo não são medidas — o total real pode estar acima. "Dentro do teto" exigiria custo mensal medido por inteiro.`,
    };
  }
  return alerta.dentroDoTeto
    ? { veredito: "dentro", porque: `custo mensal medido por inteiro, em ${alerta.percentualDoTeto}% do teto` }
    : { veredito: "fora", porque: `custo mensal medido por inteiro, em ${alerta.percentualDoTeto}% do teto` };
}

/* ────────────────────────────────────────────────────────────────────────────
 * PUBLICAÇÃO — o portão que reprova número sem lastro.
 * ──────────────────────────────────────────────────────────────────────────── */

export type PainelDeCusto = {
  geradoEm: string;
  janela: { inicio: string; fim: string; diasCorridos: number; diasNoMes: number };
  plano: { provedor: string; plano: string; fonte: FonteDeMedicao; comoFoiMedido: string };
  linhas: LinhaDeCusto[];
  somatorio: Somatorio;
  totalBrl: CustoDaLinha;
  projecaoUsd: Projecao;
  unitarios: { chave: string; rotulo: string; denominador: string; custo: CustoDaLinha }[];
  orcamento: { tetoBrl: typeof TETO_FASE_1_BRL; alerta: AlertaDeOrcamento; veredito: ReturnType<typeof vereditoDoTetoDaFase1> };
};

/**
 * DEFEITOS QUE IMPEDEM A PUBLICAÇÃO. Esta função é a asserção central da frente.
 *
 * Ela não confere estilo: confere que nenhum custo não medido esteja saindo como
 * número, e que nenhum número esteja saindo sem procedência. Se devolver lista
 * não vazia, a rota responde erro em vez de painel — melhor um painel indisponível
 * que um painel mentiroso.
 *
 * As regras, cada uma nascida de um jeito real de mentir:
 *
 *  1. `nao_medido` com QUALQUER campo numérico. É a mutação que a suíte cobra:
 *     trocar "não medido" por 0. O objeto passa a ter `valorUsd` e é reprovado.
 *  2. `medido` sem procedência, ou com procedência fora da enumeração.
 *  3. `medido` com valor não finito ou negativo.
 *  4. `sem_servico` sem evidência — "não usamos isso" é afirmação, precisa lastro.
 *  5. `tarifa_declarada` sem a tarifa escrita: preço declarado sem dizer QUAL
 *     preço é indistinguível de preço inventado.
 *  6. Somatório que inclua na soma uma chave que não está medida.
 *  7. Cobertura que afirme 100% havendo linha não medida.
 *  8. Alerta `avaliado` sem ressalva.
 */
export function defeitosDaPublicacao(painel: PainelDeCusto): string[] {
  const defeitos: string[] = [];
  const CAMPOS_NUMERICOS_PROIBIDOS = ["valorUsd", "valorBrl", "valor", "total", "custo", "estimadoUsd"];

  const conferirCusto = (onde: string, custo: CustoDaLinha) => {
    if (custo.estado === "nao_medido") {
      for (const campo of CAMPOS_NUMERICOS_PROIBIDOS) {
        if (campo in (custo as unknown as Record<string, unknown>)) {
          defeitos.push(`${onde}: custo NÃO MEDIDO carrega o campo numérico "${campo}" — ausência de dado sendo publicada como valor`);
        }
      }
      if (!custo.motivo?.trim()) defeitos.push(`${onde}: custo não medido sem motivo declarado`);
      return;
    }
    if (custo.estado === "sem_servico") {
      if (!custo.evidencia?.trim()) defeitos.push(`${onde}: "sem serviço" afirmado sem evidência`);
      if (!FONTES_DE_MEDICAO.includes(custo.fonte)) defeitos.push(`${onde}: fonte "${String(custo.fonte)}" fora da enumeração`);
      return;
    }
    // estado === "medido"
    if (!Number.isFinite(custo.valorUsd) || custo.valorUsd < 0) {
      defeitos.push(`${onde}: custo medido com valor inválido (${String(custo.valorUsd)})`);
    }
    if (!custo.comoFoiMedido?.trim()) {
      defeitos.push(`${onde}: custo medido SEM procedência — número sem lastro não se publica`);
    }
    if (!FONTES_DE_MEDICAO.includes(custo.fonte)) {
      defeitos.push(`${onde}: fonte "${String(custo.fonte)}" fora da enumeração de medição`);
    }
    if (custo.fonte === "tarifa_declarada" && !custo.tarifa?.trim()) {
      defeitos.push(`${onde}: preço vindo de tarifa declarada sem dizer QUAL tarifa — indistinguível de preço inventado`);
    }
    if (custo.fonte === "varredura_de_codigo" && custo.valorUsd > 0) {
      defeitos.push(`${onde}: varredura de código não mede valor gasto, só ausência de integração`);
    }
  };

  for (const linha of painel.linhas) {
    conferirCusto(`linha "${linha.chave}"`, linha.custo);
    if (linha.consumo.estado === "nao_medido" && !linha.consumo.motivo?.trim()) {
      defeitos.push(`linha "${linha.chave}": consumo não medido sem motivo`);
    }
  }
  conferirCusto("total em reais", painel.totalBrl);
  for (const unitario of painel.unitarios) conferirCusto(`unitário "${unitario.chave}"`, unitario.custo);

  // Soma e cobertura têm de concordar com as linhas — divergir aqui é a classe
  // de defeito dos "caminhos divergentes" deste repositório.
  const medidas = new Set(painel.linhas.filter((l) => l.custo.estado === "medido").map((l) => l.chave));
  for (const chave of painel.somatorio.chavesMedidas) {
    if (!medidas.has(chave)) defeitos.push(`somatório inclui "${chave}", que não está medida`);
  }
  const naoMedidasReais = painel.linhas.filter((l) => l.custo.estado === "nao_medido").length;
  if (painel.somatorio.chavesNaoMedidas.length !== naoMedidasReais) {
    defeitos.push(
      `somatório declara ${painel.somatorio.chavesNaoMedidas.length} linha(s) não medida(s), mas há ${naoMedidasReais} nas linhas`,
    );
  }
  if (naoMedidasReais > 0 && /\(100%\)/.test(painel.somatorio.cobertura)) {
    defeitos.push("cobertura afirma 100% havendo linha de custo não medida");
  }
  if (painel.orcamento.alerta.estado === "avaliado" && !painel.orcamento.alerta.ressalva?.trim()) {
    defeitos.push("alerta de orçamento sem a ressalva de cobertura parcial");
  }

  return defeitos;
}

/**
 * Texto de uma linha para leitura humana. Existe para que a tela não precise
 * escolher como mostrar ausência — se cada tela decidir, uma delas vai escolher
 * "R$ 0,00". Aqui `nao_medido` sempre sai como "não medido", com o motivo.
 */
export function textoDoCusto(custo: CustoDaLinha, moeda: "USD" | "BRL" = "USD"): string {
  if (custo.estado === "nao_medido") return `não medido — ${custo.motivo}`;
  if (custo.estado === "sem_servico") return `sem serviço contratado — ${custo.evidencia}`;
  const simbolo = moeda === "BRL" ? "R$" : "US$";
  return `${simbolo} ${custo.valorUsd.toFixed(moeda === "BRL" ? 2 : 6)}`;
}

/** Valor publicável de uma linha. `null` para tudo que não é medido — e é `null`
 *  de propósito, para quebrar `.toFixed()` de quem tentar formatar sem conferir. */
export function valorPublicavel(custo: CustoDaLinha): number | null {
  return custo.estado === "medido" ? custo.valorUsd : custo.estado === "sem_servico" ? 0 : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * REGRAS DE LINHA — puras, para o contrato poder EXECUTAR em vez de gravar.
 *
 * Estas duas funções são as decisões mais delicadas do painel. Elas viviam
 * dentro da rota, e uma rota do App Router não é carregável por teste: o
 * contrato só conseguiria raspar o arquivo com regex, e regex prova que alguém
 * escreveu o texto certo, não que o comportamento acontece. Foi assim que três
 * pontos cegos passaram por "protegido por contrato" neste repositório.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Uma chamada de IA como o banco a guarda. `estimated_cost_usd` nulo é o caso
 * que importa: consumo medido, preço desconhecido.
 */
export type EventoDeIa = {
  provider: string;
  model: string;
  total_tokens: number | null;
  estimated_cost_usd: number | string | null;
  pricing_source?: string | null;
};

/**
 * QUEBRA O CONSUMO DE IA EM LINHAS — e separa o precificado do não precificado.
 *
 * ── Por que o mesmo par (provedor, modelo) pode virar DUAS linhas ────────────
 *
 * Medido em 2026-07-30, no banco canônico: das 21 chamadas à `perplexity/sonar`,
 * 15 tinham custo (US$ 0,011459 no total) e 6 tinham `estimated_cost_usd` NULO,
 * com 3.317 tokens. A tarifa não estava cadastrada na hora da chamada.
 *
 * Uma linha só forçaria uma escolha entre duas mentiras: somar 0,011459 e calar
 * sobre 28,6% do consumo cobrável, ou declarar tudo não medido e jogar fora o
 * que se sabe. Duas linhas contam a verdade inteira — e derrubam a cobertura do
 * painel, que é justamente o sinal que o dono precisa ver.
 *
 * O provedor `local` é o fallback determinístico: não chama API e não tem o que
 * cobrar. Zero ali é fato medido, não ausência de medição.
 */
export function linhasDeIa(eventos: EventoDeIa[]): LinhaDeCusto[] {
  type Balde = { eventos: number; tokens: number; usd: number; eventosSemPreco: number; tokensSemPreco: number; tarifas: Set<string> };
  const porPar = new Map<string, Balde>();

  for (const evento of eventos) {
    const par = `${evento.provider}/${evento.model}`;
    const balde =
      porPar.get(par) ?? { eventos: 0, tokens: 0, usd: 0, eventosSemPreco: 0, tokensSemPreco: 0, tarifas: new Set<string>() };
    const tokens = Number(evento.total_tokens ?? 0);
    balde.eventos += 1;
    balde.tokens += Number.isFinite(tokens) ? tokens : 0;
    const semPreco = evento.estimated_cost_usd === null || evento.estimated_cost_usd === undefined;
    if (semPreco) {
      if (evento.provider !== "local") {
        balde.eventosSemPreco += 1;
        balde.tokensSemPreco += Number.isFinite(tokens) ? tokens : 0;
      }
    } else {
      const valor = Number(evento.estimated_cost_usd);
      if (Number.isFinite(valor)) balde.usd += valor;
    }
    if (evento.pricing_source) balde.tarifas.add(String(evento.pricing_source));
    porPar.set(par, balde);
  }

  const linhas: LinhaDeCusto[] = [];
  for (const [par, balde] of [...porPar.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const provedor = par.split("/")[0];
    const precificados = balde.eventos - balde.eventosSemPreco;
    if (precificados > 0) {
      linhas.push({
        chave: `ia:${par}`,
        rotulo: `IA — ${par}`,
        servico: provedor,
        custo: custoMedido(
          balde.usd,
          "tarifa_declarada",
          `soma de estimated_cost_usd em public.ai_usage_events para ${precificados} de ${balde.eventos} chamada(s) no período`,
          [...balde.tarifas].filter((t) => t.startsWith("tabela:")).join(", ") || "ATLAS_AI_PRICE_TABLE",
        ),
        consumo: consumoMedido(
          balde.tokens - balde.tokensSemPreco,
          "tokens",
          "banco",
          `soma de total_tokens das chamadas precificadas de ${par}`,
        ),
      });
    }
    if (balde.eventosSemPreco > 0) {
      linhas.push({
        chave: `ia-sem-tarifa:${par}`,
        rotulo: `IA — ${par} (sem tarifa cadastrada)`,
        servico: provedor,
        custo: custoNaoMedido(
          `${balde.eventosSemPreco} chamada(s) cobrável(is) de ${par} com ${balde.tokensSemPreco} tokens e estimated_cost_usd NULO: a tarifa não estava em ATLAS_AI_PRICE_TABLE na hora da chamada. Consumo medido, preço desconhecido — cadastre a tarifa e rode npm run ai:pricing:check.`,
        ),
        consumo: consumoMedido(
          balde.tokensSemPreco,
          "tokens",
          "banco",
          `soma de total_tokens das chamadas de ${par} sem preço gravado`,
        ),
      });
    }
  }
  return linhas;
}

/**
 * A LINHA DE MENSAGENS — e a única situação em que preço desconhecido não impede
 * medir custo.
 *
 * Volume ZERO torna o preço irrelevante: nenhuma mensagem, nenhuma cobrança por
 * mensagem. Isso é medição, e depende de `public.messages` ser escrita por
 * caminhos reais do produto (envio de template, ponte de QR, reativação, fila de
 * saída) — é isso que separa "0 mensagens" de contar uma tabela que ninguém
 * escreve, que foi a doença do `smtp: "via-supabase-auth"` em `/api/ready`.
 *
 * Volume MAIOR QUE ZERO faz a linha virar NÃO MEDIDA, porque aí o preço por
 * conversa decide o valor e ele não está em nenhuma tabela deste banco. O painel
 * PIORA de propósito na primeira mensagem enviada — e é assim que ele avisa o
 * dono de que passou a existir gasto que ele não vê.
 */
export function linhaDeMensagens(input: {
  volume: number | null;
  erroDeLeitura?: string | null;
  motivoDoPrecoDesconhecido: string;
  rotulo: string;
  servico: string;
}): LinhaDeCusto {
  const base = { chave: "mensagens", rotulo: input.rotulo, servico: input.servico };
  if (input.volume === null || !Number.isFinite(input.volume)) {
    return {
      ...base,
      custo: custoNaoMedido(`a contagem em public.messages falhou (${input.erroDeLeitura || "erro sem mensagem"})`),
      consumo: consumoNaoMedido("contagem em public.messages indisponível"),
    };
  }
  const consumo = consumoMedido(input.volume, "mensagens", "banco", "count exato em public.messages no período, com a cerca da organização");
  if (input.volume === 0) {
    return {
      ...base,
      custo: custoMedido(
        0,
        "banco",
        "0 mensagem registrada em public.messages no período, tabela escrita pelos caminhos reais de envio e recebimento — sem mensagem não há cobrança por mensagem",
      ),
      consumo,
    };
  }
  return { ...base, custo: custoNaoMedido(`${input.volume} mensagem(ns) no período. ${input.motivoDoPrecoDesconhecido}`), consumo };
}

/* ────────────────────────────────────────────────────────────────────────────
 * DEFINIÇÕES DOS DENOMINADORES — escritas UMA vez.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * "Custo por atendimento" e "custo por venda" só significam algo se o
 * atendimento e a venda tiverem UMA definição. Duas telas com duas definições é
 * a classe de defeito que este repositório mais repetiu (`developments` ×
 * `crm_projects`, `pipeline_history` × `pipeline_stage_moves`, o Kanban e a
 * listagem discordando de quem vê o quê).
 *
 * Estes textos vão para a tela junto com o número. Quem lê "R$ 0,80 por
 * atendimento" precisa saber o que conta como atendimento, senão o número é
 * decoração.
 */
export const DEFINICOES_DOS_DENOMINADORES = {
  lead: "lead criada no período, dentro da organização (public.leads.created_at)",
  atendimento:
    "lead DISTINTA que recebeu ao menos um evento de timeline (public.lead_events) ou uma movimentação de etapa (public.pipeline_stage_moves) no período. Conta a lead trabalhada, não o número de toques — dois telefonemas na mesma lead são um atendimento.",
  venda:
    "movimentação de etapa para 'ganho' no período (public.pipeline_stage_moves.to_stage = 'ganho'). NÃO usa leads.sale_value_brl: medido em 2026-07-30, havia 1 movimentação para ganho e ZERO leads com valor de venda preenchido — usar o valor como denominador diria que não houve venda.",
  usuario: "perfil ativo da organização (public.profiles.active = true)",
} as const;

/**
 * O BASELINE DE CONVERSÃO — e a recusa a chamá-lo de previsão.
 *
 * ── O que a auditoria mediu, e continua verdadeiro ─────────────────────────
 *
 *   `conversion_feature_snapshots` .... 0 linhas
 *   leads ............................. 483
 *   vendas ............................ 1
 *   `score_ia` × `data_quality_percent` correlação r ≈ 0,88
 *
 * A última linha é a que dói: o que o produto chama de "pontuação da IA"
 * correlaciona 0,88 com o percentual de campos preenchidos no cadastro. Não é
 * previsão de conversão — é **completude de cadastro com outro nome**. E, com
 * UMA venda em 483 leads, nenhum modelo pode ser treinado nem avaliado: a
 * segunda venda dobraria qualquer taxa que se calculasse.
 *
 * ── Então por que este arquivo existe ──────────────────────────────────────
 *
 * Porque a alternativa a "não dá para prever" não é ficar parado: é começar a
 * guardar, HOJE, o que um modelo precisaria para existir amanhã. Sem histórico
 * de features no momento do corte, nem daqui a um ano haverá base — e a
 * conversa vai recomeçar do zero com os mesmos 0 registros.
 *
 * Este módulo faz duas coisas, e recusa a terceira:
 *
 *   FAZ  ... calcula uma probabilidade a partir de fatos OBSERVADOS (idade da
 *            lead, houve primeiro contato, etapa alcançada, origem), com pesos
 *            declarados em número, aqui, revisáveis por qualquer pessoa.
 *   FAZ  ... diz quando o resultado É afirmável, e o denominador que sustenta.
 *   NÃO FAZ  chamar isso de previsão de IA, nem publicar acurácia enquanto a
 *            base de desfechos for pequena demais para significar algo.
 *
 * ── Por que aritmética declarada, e não modelo ─────────────────────────────
 *
 * Um baseline transparente tem uma propriedade que um modelo treinado em 1
 * exemplo não tem: dá para discordar dele. Cada peso abaixo é uma afirmação
 * sobre o negócio, escrita em português, com o motivo ao lado. Quando houver
 * desfechos suficientes, o modelo treinado será comparado CONTRA este baseline
 * — e um modelo que não vence a aritmética não merece entrar em produção.
 *
 * Módulo puro: sem banco, sem rede, sem provider de IA. Custo estruturalmente
 * zero.
 */

/** Versão do esquema de features. Muda quando a LISTA de features muda. */
export const VERSAO_DO_ESQUEMA = 1;

/** Versão do baseline. Muda quando qualquer PESO muda. */
export const VERSAO_DO_BASELINE = "baseline-aritmetico-v1";

/**
 * Janela do desfecho. 90 dias é o horizonte em que uma lead imobiliária ou
 * converte ou esfria; prever "algum dia" não é previsão, é esperança.
 */
export const HORIZONTE_DIAS = 90;

/**
 * Quantos desfechos são necessários para AFIRMAR qualquer acurácia.
 *
 * 30 é o mesmo piso que o resto do produto já usa para decidir sobre campanha
 * (`CAMPAIGN_QUALITY_MINIMUM_LEADS`). Usar um número diferente aqui criaria
 * duas réguas de "amostra suficiente" no mesmo sistema.
 */
export const DESFECHOS_PARA_AFIRMAR = 30;

export type FatosDaLead = {
  /** Dias entre a criação da lead e o corte. */
  idadeDias: number;
  /** Houve primeiro contato registrado até o corte? */
  tevePrimeiroContato: boolean;
  /** Etapa mais avançada alcançada até o corte, na régua canônica. */
  etapaAlcancada: string | null;
  /** Origem declarada (meta, portal, indicacao, importacao…). */
  origem: string | null;
  /** A lead tem dono? Lead órfã não é trabalhada por ninguém. */
  temDono: boolean;
};

export type Avaliacao = {
  probabilidade: number;
  /** Cada parcela que formou o número, para a tela poder explicar. */
  parcelas: Array<{ fator: string; peso: number; porque: string }>;
  versaoDoBaseline: string;
  versaoDoEsquema: number;
  horizonteDias: number;
};

/**
 * A base: 1 venda em 483 leads = 0,21%.
 *
 * Este número NÃO é uma estimativa de mercado — é a taxa medida nesta operação
 * em 2026-07-31, e está aqui como constante para poder ser corrigida quando a
 * base crescer. Inventar "3% é o normal do setor" seria inventar informação
 * comercial, que é justamente o que o dono proibiu.
 */
export const TAXA_BASE_MEDIDA = 0.0021;

/**
 * Peso por etapa alcançada. É o único fator com evidência forte de direção:
 * uma lead que chegou à proposta está mais perto de fechar que uma parada em
 * "novo". A MAGNITUDE é declarada, não medida — e é por isso que o resultado
 * não se chama previsão.
 */
const PESO_POR_ETAPA: Record<string, number> = {
  novo: 1,
  contato: 2.5,
  qualificacao: 5,
  visita: 12,
  proposta: 30,
  contrato: 60,
};

const arredonda = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Calcula a probabilidade do baseline, e devolve as parcelas que a formaram.
 *
 * O desenho é multiplicativo sobre a taxa base: cada fator diz "quantas vezes
 * mais provável que a média". Aditivo daria negativo em lead ruim, e
 * probabilidade negativa não existe.
 */
export function avaliarBaseline(fatos: FatosDaLead): Avaliacao {
  const parcelas: Array<{ fator: string; peso: number; porque: string }> = [];
  let multiplicador = 1;

  const etapa = (fatos.etapaAlcancada || "novo").toLowerCase();
  const pesoEtapa = PESO_POR_ETAPA[etapa] ?? 1;
  multiplicador *= pesoEtapa;
  parcelas.push({
    fator: `etapa:${etapa}`,
    peso: pesoEtapa,
    porque: `Etapa alcançada é o fator com direção mais clara: quem chegou a "${etapa}" já passou por filtros que a maioria não passa.`,
  });

  // Primeiro contato: das 483 leads, 472 nunca receberam um. É o divisor de
  // águas mais barato de observar e o mais caro de ignorar.
  const pesoContato = fatos.tevePrimeiroContato ? 3 : 0.35;
  multiplicador *= pesoContato;
  parcelas.push({
    fator: fatos.tevePrimeiroContato ? "primeiro-contato:sim" : "primeiro-contato:nao",
    peso: pesoContato,
    porque: fatos.tevePrimeiroContato
      ? "Alguém falou com esta pessoa. Nesta base, 11 de 483 leads chegaram a esse ponto."
      : "Ninguém falou com esta pessoa. Não é característica da lead — é característica do atendimento, e é o maior fator sob controle da operação.",
  });

  // Lead sem dono não é trabalhada por ninguém — é uma afirmação sobre o
  // processo, não sobre o cliente.
  if (!fatos.temDono) {
    multiplicador *= 0.3;
    parcelas.push({ fator: "sem-dono", peso: 0.3, porque: "Lead sem responsável não entra na fila de ninguém." });
  }

  // Idade: a curva de resposta cai rápido. 1661h (69 dias) sem contato foi o
  // pior caso medido nesta base.
  const pesoIdade = fatos.idadeDias <= 1 ? 1.6 : fatos.idadeDias <= 7 ? 1.2 : fatos.idadeDias <= 30 ? 0.8 : 0.4;
  multiplicador *= pesoIdade;
  parcelas.push({
    fator: `idade:${fatos.idadeDias <= 1 ? "hoje" : fatos.idadeDias <= 7 ? "semana" : fatos.idadeDias <= 30 ? "mes" : "acervo"}`,
    peso: pesoIdade,
    porque: "Intenção de compra decai com o tempo. O peso é declarado, não medido — a base não tem desfechos suficientes para ajustá-lo.",
  });

  // Probabilidade fica no intervalo aberto: 0 e 1 são certezas, e este baseline
  // não tem direito a nenhuma das duas.
  const bruta = TAXA_BASE_MEDIDA * multiplicador;
  const probabilidade = arredonda(Math.min(0.95, Math.max(0.0001, bruta)));

  return { probabilidade, parcelas, versaoDoBaseline: VERSAO_DO_BASELINE, versaoDoEsquema: VERSAO_DO_ESQUEMA, horizonteDias: HORIZONTE_DIAS };
}

export type Desfecho = { probabilidadePrevista: number; converteu: boolean };

export type Aferimento = {
  desfechos: number;
  convertidas: number;
  /** Brier score: média do erro quadrático. Menor é melhor; 0,25 é o chute. */
  brier: number | null;
  /** Brier de um previsor que sempre chuta a taxa base. É o rival a vencer. */
  brierDaTaxaBase: number | null;
  /** `true` só quando há desfechos suficientes para a comparação significar algo. */
  afirmavel: boolean;
  porqueNaoAfirmavel: string | null;
};

/**
 * Compara o baseline com a realidade — e RECUSA afirmar acurácia com amostra
 * pequena.
 *
 * O Brier é publicado ao lado do Brier do previsor trivial (sempre a taxa
 * base). Sem esse rival, "Brier 0,002" parece excelente e não quer dizer nada:
 * num evento raro, chutar sempre "não vai converter" já dá um número ótimo.
 * Modelo que não vence o trivial não é modelo — é enfeite caro.
 */
export function aferirBaseline(desfechos: Desfecho[], minimo = DESFECHOS_PARA_AFIRMAR): Aferimento {
  const validos = desfechos.filter((d) => Number.isFinite(d.probabilidadePrevista));
  const convertidas = validos.filter((d) => d.converteu).length;

  if (validos.length === 0) {
    return {
      desfechos: 0, convertidas: 0, brier: null, brierDaTaxaBase: null, afirmavel: false,
      porqueNaoAfirmavel: "Nenhum desfecho conhecido ainda. O baseline começou a gravar hoje; a aferição só existe depois que a janela de 90 dias fechar para as primeiras leads.",
    };
  }

  const brier = arredonda(validos.reduce((soma, d) => soma + (d.probabilidadePrevista - (d.converteu ? 1 : 0)) ** 2, 0) / validos.length);
  const brierBase = arredonda(validos.reduce((soma, d) => soma + (TAXA_BASE_MEDIDA - (d.converteu ? 1 : 0)) ** 2, 0) / validos.length);

  return {
    desfechos: validos.length,
    convertidas,
    brier,
    brierDaTaxaBase: brierBase,
    afirmavel: validos.length >= minimo && convertidas >= 2,
    porqueNaoAfirmavel:
      validos.length >= minimo && convertidas >= 2
        ? null
        : convertidas < 2
          ? `${convertidas} conversão(ões) entre ${validos.length} desfecho(s). Com menos de 2 desfechos positivos, qualquer erro medido é sobre um único caso — a próxima venda mudaria o número em mais de 100%.`
          : `${validos.length} desfecho(s) contra o mínimo de ${minimo}. Abaixo disso, a diferença entre o baseline e o chute cabe dentro do acaso.`,
  };
}

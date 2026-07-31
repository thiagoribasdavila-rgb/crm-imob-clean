/**
 * REGISTRO DE MODELOS — o portão que impede modelo sem baseline de virar decisão.
 *
 * ── O problema que isto resolve ─────────────────────────────────────────────
 *
 * O dono pediu nove modelos: probabilidade de conversão, previsão de vendas,
 * VGV, risco de perda, tempo até fechamento, demanda por região e tipologia,
 * carga da equipe, estoque com baixa saída e campanhas com maior potencial.
 *
 * E exigiu, para CADA um: dataset, versão, baseline, métricas, explicabilidade,
 * monitoramento de drift, revisão, fallback e limite de uso.
 *
 * Medido no banco canônico (pozbrcsfthnhmnebfoxv) em 2026-07-30:
 *
 *   · `external_sales_records` com valor apurado ....... 0
 *   · `ai_learning_events` com desfecho ganho .......... 1
 *   · `ai_learning_events` com desfecho perdido ........ 0
 *   · `conversion_dataset_versions` .................... 0
 *   · `conversion_calibration_models` .................. 0
 *   · `inventory_units` / `units` / `properties` ....... 0 / 0 / 0
 *   · `prediction_drift_reports` ....................... 8, TODOS "insufficient"
 *                                                        com amostra 0
 *
 * Com UM desfecho apurado não existe baseline. E sem baseline não existe
 * modelo — existe chute com vocabulário estatístico. Este arquivo não treina
 * nada: ele RECUSA. A recusa é o entregável, porque é ela que impede o número
 * inventado de chegar ao corretor com cara de previsão.
 *
 * ── Por que catálogo em código, e não tabela nova ───────────────────────────
 *
 * O repositório não reconstrói o banco (166 versões locais, 207 no banco,
 * interseção zero — `db push` aborta). Migration nova entraria numa pilha que
 * não é aplicada, e o registro nasceria mentindo sobre onde mora. O catálogo em
 * git é versionado, revisável em diff, custa R$ 0 e não depende de deploy de
 * schema. As tabelas de governança que JÁ existem no banco vivo
 * (`conversion_calibration_models`, `model_release_gates`,
 * `prediction_drift_reports`) continuam sendo o registro de EXECUÇÃO do único
 * modelo que um dia tiver baseline; este arquivo é o registro de ADMISSÃO dos
 * nove, que é o que faltava.
 *
 * ── Limite honesto deste arquivo ────────────────────────────────────────────
 *
 * Ele não sabe se o dado mudou desde a medição. Os números de `baseline` e de
 * `aritmetica.linhasMedidas` são fotografias datadas, não leituras ao vivo:
 * quem for promover um modelo precisa remedir antes. `medidoEm` existe para
 * essa data ficar visível em vez de virar folclore.
 */

/**
 * Aritmética é conta sobre dado existente — qualquer pessoa refaz no papel e
 * confere. Estatística é inferência sobre desfecho observado, e por isso exige
 * baseline. A separação existe porque tratar as duas igual foi o que permitiu,
 * historicamente, uma divisão virar "previsão de conversão".
 */
export type NaturezaDoModelo = "aritmetica" | "estatistica";

/**
 * Baseline apurado. `exemplos`/`positivos`/`negativos` contam DESFECHOS reais,
 * nunca leads em aberto: lead que ainda não fechou não é exemplo de nada.
 *
 * `valor` é `null` quando não medido — e `null` aqui significa "não sei", nunca
 * um número plausível. É a regra do dono: não inventar métrica.
 */
export type BaselineDeModelo = {
  /** Fonte e recorte do baseline, por extenso, para poder ser refeito. */
  origem: string;
  exemplos: number;
  positivos: number;
  negativos: number;
  /** O que o baseline mede (ex.: "taxa base de conversão em 90 dias"). */
  metrica: string;
  /** Valor medido da métrica. `null` = não medido. */
  valor: number | null;
  /** Data ISO da apuração. `null` = nunca apurado. */
  apuradoEm: string | null;
};

/** Insumo de um modelo aritmético: a conta e o que ela lê. */
export type ContaAritmetica = {
  /** A fórmula escrita, para conferência à mão. */
  formula: string;
  /** Tabelas/colunas lidas. Lista vazia derruba a admissão. */
  insumos: string[];
  /** Linhas encontradas no insumo na data de `medidoEm`. `null` = não medido. */
  linhasMedidas: number | null;
};

export type ModeloRegistrado = {
  id: string;
  nome: string;
  /** A pergunta de negócio que o modelo responde. */
  pergunta: string;
  natureza: NaturezaDoModelo;
  versao: string;
  /** Dataset declarado: de onde sai o exemplo. */
  dataset: string;
  baseline: BaselineDeModelo | null;
  aritmetica: ContaAritmetica | null;
  metricas: string[];
  /** Como a saída é explicada a quem recebe. `null` = não explicável. */
  explicabilidade: string | null;
  /** Como se detecta que o modelo apodreceu. `null` = não monitorado. */
  driftMonitorado: string | null;
  /** Data ISO da próxima revisão obrigatória. `null` = sem revisão marcada. */
  revisaoEm: string | null;
  /** Onde o modelo NÃO pode ser usado. `null` = limite não declarado. */
  limiteDeUso: string | null;
  /** O que atende quando o modelo não está admitido. `null` = sem fallback. */
  fallback: string | null;
  /**
   * O DESLIGAR. `false` tira o modelo de produção sem tocar em código de
   * inferência e sem deploy: a admissão passa a recusar por "desligado".
   */
  ativo: boolean;
  /** Data ISO da medição que sustenta os números acima. */
  medidoEm: string;
};

/**
 * Pisos de elegibilidade. NÃO são invenção deste arquivo: são exatamente os
 * mesmos números que a RPC viva `build_conversion_calibration_candidate` aplica
 * no banco (`examples>=100 and positives>=20 and negatives>=20`, migration da
 * Fase 77, conferida em 2026-07-30). Duplicar a política com outro valor criaria
 * duas verdades sobre "elegível" — o defeito que este repositório já pagou caro
 * mais de uma vez.
 */
export const MINIMO_DE_EXEMPLOS = 100;
export const MINIMO_DE_POSITIVOS = 20;
export const MINIMO_DE_NEGATIVOS = 20;

export type Admissao = {
  admitido: boolean;
  /** Toda razão de recusa, por extenso. Vazio quando admitido. */
  motivos: string[];
};

const vazio = (v: unknown): boolean => typeof v !== "string" || v.trim().length === 0;
const dataValida = (v: unknown): boolean =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/**
 * Decide se um modelo pode responder em produção — e, quando não pode, diz
 * TODOS os motivos de uma vez.
 *
 * Devolver a lista inteira em vez de parar no primeiro é deliberado: quem for
 * consertar precisa saber que faltam quatro coisas, não descobrir uma por
 * rodada. Recusar é o caminho comum hoje, não a exceção.
 */
export function admitirEmProducao(modelo: ModeloRegistrado): Admissao {
  const motivos: string[] = [];

  if (!modelo.ativo) motivos.push("desligado no registro");
  if (vazio(modelo.versao)) motivos.push("sem versão declarada");
  if (vazio(modelo.dataset)) motivos.push("sem dataset declarado");
  if (vazio(modelo.explicabilidade)) motivos.push("sem explicabilidade declarada");
  if (vazio(modelo.limiteDeUso)) motivos.push("sem limite de uso declarado");
  if (vazio(modelo.fallback)) motivos.push("sem fallback declarado");
  if (!dataValida(modelo.revisaoEm)) motivos.push("sem data de revisão válida");
  if (!modelo.metricas.length) motivos.push("sem métrica declarada");

  if (modelo.natureza === "estatistica") {
    const b = modelo.baseline;
    if (!b) {
      motivos.push("sem baseline — não elegível a produção");
    } else {
      if (b.valor === null || b.apuradoEm === null) {
        motivos.push("baseline sem valor apurado — não elegível a produção");
      }
      if (b.exemplos < MINIMO_DE_EXEMPLOS) {
        motivos.push(
          `baseline com ${b.exemplos} exemplo(s); mínimo ${MINIMO_DE_EXEMPLOS}`,
        );
      }
      if (b.positivos < MINIMO_DE_POSITIVOS) {
        motivos.push(
          `baseline com ${b.positivos} desfecho(s) positivo(s); mínimo ${MINIMO_DE_POSITIVOS}`,
        );
      }
      if (b.negativos < MINIMO_DE_NEGATIVOS) {
        motivos.push(
          `baseline com ${b.negativos} desfecho(s) negativo(s); mínimo ${MINIMO_DE_NEGATIVOS}`,
        );
      }
    }
    // Modelo estatístico sem monitor de drift entra e apodrece calado.
    if (vazio(modelo.driftMonitorado)) motivos.push("sem monitoramento de drift declarado");
  } else {
    const c = modelo.aritmetica;
    if (!c) {
      motivos.push("conta aritmética não declarada");
    } else {
      if (vazio(c.formula)) motivos.push("sem fórmula conferível à mão");
      if (!c.insumos.length) motivos.push("sem insumo declarado");
      // Aritmética também é recusada: conta sobre tabela vazia devolve número
      // com aparência de resposta. É o caso do estoque hoje (0 unidades).
      if (c.linhasMedidas === null) motivos.push("insumo não medido");
      else if (c.linhasMedidas <= 0) motivos.push("insumo medido e VAZIO — nada a calcular");
    }
  }

  return { admitido: motivos.length === 0, motivos };
}

/** Data única da medição que sustenta o catálogo abaixo. */
const MEDIDO_EM = "2026-07-30";

/**
 * Baseline inexistente, escrito por extenso em vez de omitido.
 *
 * `null` no campo `baseline` e este objeto com zeros NÃO são a mesma coisa, e a
 * diferença importa: `null` é "ninguém nem tentou apurar"; isto é "apurei e não
 * há desfecho". O segundo é auditável — mostra a consulta que foi feita.
 */
const semDesfechoApurado = (origem: string, metrica: string): BaselineDeModelo => ({
  origem,
  exemplos: 0,
  positivos: 0,
  negativos: 0,
  metrica,
  valor: null,
  apuradoEm: null,
});

/**
 * Os nove modelos pedidos, com o estado REAL de cada um.
 *
 * Sete são recusados hoje, e a recusa está declarada no próprio dado — não num
 * comentário. Dois passam porque são aritmética sobre dado que existe.
 */
export const REGISTRO_DE_MODELOS: readonly ModeloRegistrado[] = [
  {
    id: "conversao",
    nome: "Probabilidade de conversão",
    pergunta: "Qual a chance de esta lead comprar?",
    natureza: "estatistica",
    versao: "atlas-predictive-v2",
    dataset: "leads + ai_learning_events (desfecho ganho/perdido) por organização",
    baseline: {
      origem: "ai_learning_events, event_type=CONVERSION, banco canônico",
      exemplos: 1,
      positivos: 1,
      negativos: 0,
      metrica: "taxa base de conversão",
      valor: null,
      apuradoEm: null,
    },
    aritmetica: null,
    metricas: ["Brier score", "erro de calibração esperado (ECE)", "taxa base observada"],
    explicabilidade:
      "lib/ai/conversion-predictor devolve positiveFactors, riskFactors e missingSignals por lead",
    driftMonitorado:
      "prediction_drift_reports (PSI da probabilidade + delta de Brier); hoje devolve 'insufficient' com amostra 0",
    revisaoEm: "2026-10-30",
    limiteDeUso:
      "priorização de fila apenas; proibido decidir crédito, comissão, desligamento ou preço",
    fallback: "ordenação por score comercial declarado, sem probabilidade exibida",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "previsao_de_vendas",
    nome: "Previsão de vendas",
    pergunta: "Quantas vendas fecham no próximo mês?",
    natureza: "estatistica",
    versao: "nao-treinado",
    dataset: "external_sales_records + ai_learning_events com desfecho ganho",
    baseline: semDesfechoApurado(
      "external_sales_records com estimated_value > 0, banco canônico",
      "vendas por mês",
    ),
    aritmetica: null,
    metricas: ["erro absoluto médio de vendas/mês", "cobertura do intervalo projetado"],
    explicabilidade: null,
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso: "nenhum uso autorizado enquanto não houver venda apurada",
    fallback: "não exibir previsão; mostrar contagem realizada do período",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "vgv",
    nome: "VGV projetado",
    pergunta: "Quanto de valor geral de vendas o pipeline gera?",
    natureza: "estatistica",
    versao: "nao-treinado",
    dataset: "external_sales_records.estimated_value + tabela de preços das tipologias",
    baseline: semDesfechoApurado(
      "external_sales_records com estimated_value > 0, banco canônico",
      "ticket médio apurado",
    ),
    aritmetica: null,
    metricas: ["erro percentual do VGV projetado contra apurado"],
    explicabilidade: null,
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso:
      "nenhum uso autorizado; valor monetário projetado sem venda apurada é número inventado",
    fallback: "não exibir VGV projetado; exibir apenas valor contratado quando existir",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "risco_de_perda",
    nome: "Risco de perda",
    pergunta: "Qual lead está a caminho de ser perdida?",
    natureza: "estatistica",
    versao: "nao-treinado",
    dataset: "ai_learning_events com desfecho perdido + taxonomia de descarte",
    baseline: semDesfechoApurado(
      "ai_learning_events, converted=false, banco canônico",
      "taxa base de perda",
    ),
    aritmetica: null,
    metricas: ["recall de perdas antecipadas", "precisão do alerta"],
    explicabilidade: null,
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso: "nenhum uso autorizado enquanto não houver perda classificada",
    fallback: "sinal determinístico de inatividade (dias sem interação), rotulado como tal",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "tempo_ate_fechamento",
    nome: "Tempo até fechamento",
    pergunta: "Em quantos dias esta lead fecha?",
    natureza: "estatistica",
    versao: "nao-treinado",
    dataset: "pipeline_stage_moves até a etapa de ganho, por lead",
    baseline: semDesfechoApurado(
      "ciclos completos entrada→ganho em pipeline_stage_moves, banco canônico",
      "mediana de dias até fechamento",
    ),
    aritmetica: null,
    metricas: ["erro absoluto em dias", "cobertura do intervalo"],
    explicabilidade: null,
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso: "nenhum uso autorizado; sem ciclo fechado não há duração observada",
    fallback: "tempo médio já decorrido por etapa, rotulado como decorrido e não como previsto",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "demanda_regiao_tipologia",
    nome: "Demanda por região e tipologia",
    pergunta: "Onde e em que tipologia a demanda está aquecida?",
    natureza: "estatistica",
    versao: "nao-treinado",
    dataset: "leads por região × development_typologies, com desfecho apurado",
    baseline: semDesfechoApurado(
      "desfechos por recorte região × tipologia, banco canônico",
      "taxa de conversão por recorte",
    ),
    aritmetica: null,
    metricas: ["taxa de conversão por recorte", "amostra mínima por recorte"],
    explicabilidade: null,
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso: "nenhum uso autorizado para direcionar verba enquanto não houver desfecho",
    fallback: "volume de leads por recorte, rotulado como volume e não como demanda",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "carga_da_equipe",
    nome: "Carga da equipe",
    pergunta: "Quantas leads cada corretor está carregando?",
    natureza: "aritmetica",
    versao: "conta-v1",
    dataset: "leads.assigned_to sobre a organização, no instante da leitura",
    baseline: null,
    aritmetica: {
      formula:
        "carga(corretor) = leads com assigned_to = corretor; concentração = maior carga ÷ carga média",
      insumos: ["leads.assigned_to", "leads.organization_id"],
      linhasMedidas: 468,
    },
    metricas: ["conferência à mão contra COUNT(*) agrupado por assigned_to"],
    explicabilidade: "a própria contagem por corretor é a explicação; não há peso oculto",
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso:
      "diagnóstico de distribuição; proibido usar como avaliação de desempenho de pessoa",
    fallback: "não há: a conta ou tem dado, ou não responde",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "tempo_ate_esgotar_fila",
    nome: "Tempo até esgotar a fila",
    pergunta: "Em quantas semanas a fila atual é atendida no ritmo de hoje?",
    natureza: "aritmetica",
    versao: "conta-v1",
    dataset: "leads sem primeiro contato ÷ vazão semanal observada em pipeline_stage_moves",
    baseline: null,
    aritmetica: {
      formula: "semanas = fila ÷ (movimentações na janela ÷ semanas da janela)",
      insumos: ["leads.last_interaction_at", "pipeline_stage_moves.occurred_at"],
      linhasMedidas: 137,
    },
    metricas: ["conferência à mão: divisão da fila pela vazão medida"],
    explicabilidade: "fila, vazão e janela são devolvidas junto com o resultado",
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso:
      "dimensionamento de capacidade; não é promessa de atendimento nem meta individual",
    fallback: "não há: vazão zero devolve 'não previsível', não infinito",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "estoque_baixa_saida",
    nome: "Estoque com baixa saída",
    pergunta: "Qual unidade está parada há mais tempo?",
    natureza: "aritmetica",
    versao: "conta-v1",
    dataset: "inventory_units + inventory_unit_events (data da última movimentação)",
    baseline: null,
    aritmetica: {
      formula: "dias_parado(unidade) = hoje − data da última movimentação da unidade",
      insumos: ["inventory_units", "inventory_unit_events.occurred_at"],
      // Medido: inventory_units = 0, units = 0, properties = 0. Conta sem linha.
      linhasMedidas: 0,
    },
    metricas: ["conferência à mão: diferença de datas por unidade"],
    explicabilidade: "a data da última movimentação acompanha cada linha",
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso: "priorização de esforço comercial; não é recomendação de preço",
    fallback: "não há: sem unidade cadastrada a tela declara estoque não cadastrado",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
  {
    id: "campanhas_potenciais",
    nome: "Campanhas com maior potencial",
    pergunta: "Qual campanha merece mais verba?",
    natureza: "estatistica",
    versao: "nao-treinado",
    dataset: "gasto por campanha × leads atribuídos × desfecho apurado",
    baseline: semDesfechoApurado(
      "desfechos com campaign_id preenchido, banco canônico",
      "custo por venda por campanha",
    ),
    aritmetica: null,
    metricas: ["custo por venda por campanha", "erro da projeção de leads/semana"],
    explicabilidade: null,
    driftMonitorado: null,
    revisaoEm: "2026-10-30",
    limiteDeUso:
      "nenhum uso autorizado para mover verba automaticamente; decisão de verba é humana",
    fallback: "custo por lead observado, rotulado como custo por lead e não por venda",
    ativo: true,
    medidoEm: MEDIDO_EM,
  },
];

export type EstadoDoRegistro = {
  total: number;
  admitidos: string[];
  recusados: Array<{ id: string; motivos: string[] }>;
  /** Quantos modelos estatísticos estão sem baseline apurado. */
  semBaseline: number;
};

/** Fotografia do registro: quem responde hoje e por que os outros não. */
export function estadoDoRegistro(
  modelos: readonly ModeloRegistrado[] = REGISTRO_DE_MODELOS,
): EstadoDoRegistro {
  const admitidos: string[] = [];
  const recusados: Array<{ id: string; motivos: string[] }> = [];
  let semBaseline = 0;
  for (const modelo of modelos) {
    const veredito = admitirEmProducao(modelo);
    if (veredito.admitido) admitidos.push(modelo.id);
    else recusados.push({ id: modelo.id, motivos: veredito.motivos });
    if (
      modelo.natureza === "estatistica" &&
      (!modelo.baseline || modelo.baseline.valor === null)
    ) {
      semBaseline += 1;
    }
  }
  return { total: modelos.length, admitidos, recusados, semBaseline };
}

/** Busca por id — devolve `null` em vez de estourar, porque id vem de rota. */
export function modeloRegistrado(id: string): ModeloRegistrado | null {
  return REGISTRO_DE_MODELOS.find((modelo) => modelo.id === id) ?? null;
}

/**
 * O DESLIGAR, aplicado. Não muta o catálogo: devolve a cópia desligada, para
 * quem chamar decidir o que faz com ela. Um modelo desligado é sempre recusado.
 */
export function desligarModelo(modelo: ModeloRegistrado): ModeloRegistrado {
  return { ...modelo, ativo: false };
}

/**
 * Estado do monitoramento de drift de um modelo.
 *
 * "sem_baseline" NÃO é uma variação de "estável". É a declaração de que não há o
 * que monitorar: drift é a distância entre hoje e um baseline, e sem baseline a
 * distância não existe. O monitor vivo do banco já chega a essa conclusão sozinho
 * — os 8 relatórios de `prediction_drift_reports` em 2026-07-30 estavam todos com
 * `drift_status = 'insufficient'` e amostra 0. Este tipo é o que impede a tela de
 * traduzir esse "insufficient" como "sem problemas detectados".
 */
export type EstadoDeDrift =
  | "sem_baseline"
  | "nao_monitorado"
  | "nao_aplicavel"
  | "amostra_insuficiente"
  | "monitorado";

export type LeituraDeDrift = {
  estado: EstadoDeDrift;
  /** Por extenso, o que a liderança lê. */
  explicacao: string;
  /** O modelo pode responder em produção? Mesma decisão de `admitirEmProducao`. */
  elegivel: boolean;
};

/**
 * Traduz registro + último relatório de drift num estado honesto.
 *
 * `amostraDoUltimoRelatorio` é o `current_sample` de `prediction_drift_reports`.
 * `null` significa que nenhum relatório foi gerado — diferente de relatório
 * gerado com amostra zero, que é o caso real hoje.
 */
export function estadoDeDrift(
  modelo: ModeloRegistrado,
  amostraDoUltimoRelatorio: number | null,
): LeituraDeDrift {
  const elegivel = admitirEmProducao(modelo).admitido;
  if (modelo.natureza === "aritmetica") {
    return {
      estado: "nao_aplicavel",
      explicacao:
        "conta aritmética não sofre drift: a fórmula é a mesma amanhã e é conferível à mão.",
      elegivel,
    };
  }
  if (!modelo.baseline || modelo.baseline.valor === null) {
    return {
      estado: "sem_baseline",
      explicacao:
        "sem baseline apurado — não elegível a produção, e não há distância a medir contra nada.",
      elegivel,
    };
  }
  if (vazio(modelo.driftMonitorado)) {
    return {
      estado: "nao_monitorado",
      explicacao: "o modelo tem baseline mas ninguém declarou como detectar que ele apodreceu.",
      elegivel,
    };
  }
  if (amostraDoUltimoRelatorio === null) {
    return {
      estado: "amostra_insuficiente",
      explicacao: "nenhum relatório de drift foi gerado ainda.",
      elegivel,
    };
  }
  if (amostraDoUltimoRelatorio <= 0) {
    return {
      estado: "amostra_insuficiente",
      explicacao:
        "relatório gerado com amostra zero — isto NÃO é 'estável', é ausência de observação.",
      elegivel,
    };
  }
  return {
    estado: "monitorado",
    explicacao: `drift acompanhado sobre ${amostraDoUltimoRelatorio} observação(ões).`,
    elegivel,
  };
}

/**
 * FATO NO CRIATIVO PRECISA DE LASTRO — núcleo puro, sem rede e sem banco.
 *
 * ── O risco que isto fecha ─────────────────────────────────────────────────
 *
 * Este produto vende imóvel. Um número num anúncio — "valorização de 12% ao
 * ano", "rentabilidade de 0,6% ao mês", "entrega em 2027", "R$ 14 mil o m²" —
 * não é enfeite de copy: é afirmação comercial. Sem fonte, é risco jurídico
 * (CDC art. 30/37: publicidade vincula o fornecedor e propaganda enganosa é
 * infração) e é risco de bloqueio na Meta.
 *
 * O repositório já tinha as duas metades separadas e nenhuma ligação entre
 * elas:
 *
 *   · `lib/ai/creative-strategist.ts` valida POLÍTICA — discriminação de
 *     Housing, atributo pessoal, promessa financeira genérica ("garantido",
 *     "sem risco"). Ele pergunta "esta FRASE é permitida?".
 *   · `public.project_region_sources` (Fase 69) guarda FONTE com publicador,
 *     data de referência, validade e revisão humana. Ele responde "este FATO
 *     tem origem conferida?".
 *
 * Ninguém perguntava a segunda coisa antes de escrever a primeira. Este módulo
 * é a pergunta que faltava, e ela é diferente da do creative-strategist — por
 * isso não duplica nenhuma regra dele: aqui não se olha se a frase é permitida,
 * olha-se se o NÚMERO dela tem de onde ter vindo.
 *
 * ── O que conta como lastro ────────────────────────────────────────────────
 *
 * Duas origens, e só duas:
 *
 *   1. FONTE REGIONAL VERIFICADA E VIGENTE — `review_status = 'verified'` e
 *      `valid_until >= hoje`. Fonte `pending` NÃO serve: pendente é o estado de
 *      quem ainda não foi conferido por gente, e é exatamente o estado em que a
 *      coleta automática nasce. Fonte vencida também não: número de mercado de
 *      2019 num anúncio de 2026 é o mesmo problema com outra roupa.
 *   2. DADO CADASTRADO do próprio produto — preço, área, prazo que já estão em
 *      `developments`. Preço do empreendimento não vem da web; vem da tabela. É
 *      a mesma doutrina que `lib/marketing/creative-studio.ts` já aplica com
 *      `pendencias()`, agora como portão executável em vez de instrução no
 *      prompt.
 *
 * Tudo o mais é invenção, e invenção não sobe.
 *
 * ── A trava do nível 5 ─────────────────────────────────────────────────────
 *
 * `lib/ai/niveis-de-autonomia.ts` declara `garantir_preco_ou_estoque` e
 * `prometer_financiamento` como PROIBIDOS autonomamente — nenhum nível autoriza
 * e nenhuma aprovação libera. Aqui essas duas classes são recusadas MESMO COM
 * fonte verificada: não existe fonte que autorize prometer aprovação de crédito.
 * As duas listas não podem divergir, e o contrato
 * `tests/contracts/fonte-antes-do-fato.test.mjs` prova que os nomes de ação
 * usados aqui existem lá.
 *
 * Módulo PURO de propósito: sem `server-only`, sem `@/`, sem `Date.now()`. Quem
 * sabe que dia é hoje é o chamador — assim o contrato consegue provar as duas
 * metades de "vigente" sem viajar no tempo.
 */

// ---------------------------------------------------------------------------
// Números que fazem afirmação
// ---------------------------------------------------------------------------

export type TipoDeNumero =
  | "percentual"
  | "preco"
  | "preco_por_m2"
  | "ano_de_entrega"
  | "distancia";

export type NumeroSensivel = {
  tipo: TipoDeNumero;
  /** O trecho literal do criativo. É o que o revisor precisa ler. */
  trecho: string;
  /** O número normalizado (ponto decimal, sem separador de milhar). */
  valor: string;
  /** Assunto reconhecido no entorno — só para a mensagem, nunca para decidir. */
  assunto: string | null;
};

/**
 * NORMALIZAÇÃO DE NÚMERO EM PORTUGUÊS.
 *
 * "R$ 450.000" e "450000" são o mesmo número; "12,5" e "12.5" também. Comparar
 * texto cru faria o criativo citar "R$ 450.000" e o cadastro dizer "450000" sem
 * casar — e o portão reprovaria um dado que ESTÁ cadastrado, que é o jeito mais
 * rápido de alguém desligar o portão.
 *
 * Regra pt-BR: com os dois separadores, o ponto é milhar e a vírgula é decimal.
 * Só com vírgula, ela é decimal quando sobram 1 ou 2 dígitos ("12,5"), e milhar
 * quando sobram 3 ("1,234" copiado de fonte em inglês). Só com ponto, o mesmo
 * critério ao contrário — "450.000" é milhar, "12.5" é decimal.
 */
export function normalizarNumero(bruto: string): string {
  // Separador na borda é lixo de captura, não parte do número: "R$ 450.000," no
  // fim da oração vinha com a vírgula colada, falhava a validação e o preço
  // sumia do radar do portão — um número invisível é um número sem lastro que
  // passa. O contrato prova este caso.
  const texto = String(bruto ?? "").trim().replace(/\s/g, "").replace(/^[.,]+/, "").replace(/[.,]+$/, "");
  if (!texto) return "";
  const temPonto = texto.includes(".");
  const temVirgula = texto.includes(",");
  let normalizado = texto;
  if (temPonto && temVirgula) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    const decimais = texto.split(",").pop() ?? "";
    normalizado = decimais.length === 3 ? texto.replace(/,/g, "") : texto.replace(",", ".");
  } else if (temPonto) {
    const decimais = texto.split(".").pop() ?? "";
    normalizado = decimais.length === 3 && texto.indexOf(".") > 0 ? texto.replace(/\./g, "") : texto;
  }
  if (!/^\d+(\.\d+)?$/.test(normalizado)) return "";
  // "12.50" e "12.5" são o mesmo número: sem isto o lastro dependeria de o
  // redator ter digitado a mesma quantidade de casas que a fonte.
  return normalizado.includes(".") ? normalizado.replace(/0+$/, "").replace(/\.$/, "") : normalizado;
}

/** Todos os números soltos de um texto, normalizados. Usado só para o cadastro. */
export function numerosDoTexto(texto: string): Set<string> {
  const encontrados = new Set<string>();
  for (const match of String(texto ?? "").matchAll(/\d[\d.,]*\d|\d/g)) {
    const valor = normalizarNumero(match[0]);
    if (valor) encontrados.add(valor);
  }
  return encontrados;
}

const ASSUNTOS: ReadonlyArray<{ assunto: string; re: RegExp }> = [
  { assunto: "valorizacao", re: /valoriza\w*/i },
  { assunto: "rentabilidade", re: /rentabilidade|yield|retorno|rendimento/i },
  { assunto: "ocupacao", re: /ocupa\w*|vac[âa]ncia|absor[çc][ãa]o/i },
  { assunto: "desconto", re: /desconto|abatimento/i },
];

function assuntoPerto(texto: string, indice: number): string | null {
  const janela = texto.slice(Math.max(0, indice - 60), indice + 60);
  return ASSUNTOS.find((item) => item.re.test(janela))?.assunto ?? null;
}

/**
 * Os cinco formatos que afirmam algo verificável num anúncio imobiliário.
 *
 * Deliberadamente NÃO é "todo número do texto". "Portaria 24 horas" e "3 opções
 * de planta" não são afirmação de mercado, e reprovar isso faria o portão virar
 * ruído até alguém desligá-lo. O que entra é o que um consumidor cobraria na
 * Justiça ou o que a Meta cobraria na revisão: percentual, preço, preço por m²,
 * ano de entrega e distância.
 */
const PADROES: ReadonlyArray<{ tipo: TipoDeNumero; re: RegExp }> = [
  // Preço por m² antes de preço: "R$ 14.000/m²" também casa com o padrão de
  // preço, e o tipo mais específico é o que descreve melhor o risco.
  { tipo: "preco_por_m2", re: /r\$\s*(\d[\d.,]*)\s*(?:\/|por\s+)\s*m(?:²|2\b)/gi },
  { tipo: "percentual", re: /(\d[\d.,]*)\s*%/g },
  { tipo: "preco", re: /r\$\s*(\d[\d.,]*)(?:\s*(mil|milh[õo]es|milh[ãa]o))?/gi },
  { tipo: "ano_de_entrega", re: /(?:entrega|entregue|chaves|habite-se)[^.!?\n]{0,40}?\b(20\d{2})\b|\b(20\d{2})\b[^.!?\n]{0,20}?(?:entrega|entregue)/gi },
  { tipo: "distancia", re: /\b(\d[\d.,]*)\s*(m|metros|km|quil[ôo]metros|minutos?|min)\b[^.!?\n]{0,30}?(?:metr[ôo]|esta[çc][ãa]o|terminal|p[ée]|caminhada|centro|parque|shopping)/gi },
];

/** Multiplicador escrito por extenso — "R$ 500 mil" é 500000, não 500. */
function aplicarEscala(valor: string, escala: string | undefined): string {
  if (!escala) return valor;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  const fator = /mil/i.test(escala) ? 1_000 : 1_000_000;
  return normalizarNumero(String(numero * fator));
}

export function numerosSensiveis(texto: string): NumeroSensivel[] {
  const conteudo = String(texto ?? "");
  const achados: NumeroSensivel[] = [];
  const ocupados: Array<[number, number]> = [];
  for (const padrao of PADROES) {
    for (const match of conteudo.matchAll(padrao.re)) {
      const inicio = match.index ?? 0;
      const fim = inicio + match[0].length;
      // Um trecho já classificado por um padrão mais específico não é
      // reclassificado: "R$ 14.000/m²" é preço por m², não preço solto.
      if (ocupados.some(([a, b]) => inicio < b && fim > a)) continue;
      const bruto = match[1] ?? match[2] ?? "";
      const valor = padrao.tipo === "preco"
        ? aplicarEscala(normalizarNumero(bruto), match[2])
        : normalizarNumero(bruto);
      if (!valor) continue;
      ocupados.push([inicio, fim]);
      achados.push({
        tipo: padrao.tipo,
        trecho: match[0].trim(),
        valor,
        assunto: padrao.tipo === "percentual" ? assuntoPerto(conteudo, inicio) : null,
      });
    }
  }
  return achados.sort((a, b) => conteudo.indexOf(a.trecho) - conteudo.indexOf(b.trecho));
}

// ---------------------------------------------------------------------------
// Promessas que nenhuma fonte autoriza (classe do nível 5)
// ---------------------------------------------------------------------------

/**
 * As duas classes vêm de `ACOES_PROIBIDAS_AUTONOMAMENTE` em
 * `lib/ai/niveis-de-autonomia.ts` — os nomes são os mesmos DE PROPÓSITO, e o
 * contrato prova que continuam existindo lá. O import direto não acontece
 * porque aquele módulo lê o disco (`node:fs`) e este precisa continuar
 * carregável no navegador; a ligação é feita pelo contrato, não por acoplamento.
 *
 * Os padrões aqui são os de FRASE de anúncio imobiliário brasileiro, e não
 * repetem os de `creative-strategist.ts` (que já pega "garantido", "sem risco",
 * "retorno certo" como promessa financeira genérica). Duas listas com a mesma
 * regex seriam duas verdades sobre a mesma frase.
 */
export const PROMESSAS_PROIBIDAS: ReadonlyArray<{
  acao: "garantir_preco_ou_estoque" | "prometer_financiamento";
  re: RegExp;
  porque: string;
}> = [
  {
    acao: "prometer_financiamento",
    re: /\b(financiamento|cr[ée]dito)\s+(aprovad[oa]|pr[ée]-?aprovad[oa]|na\s+hora|f[áa]cil\s+e\s+garantid[oa])/i,
    porque: "Aprovação de crédito é decisão do banco. Prometê-la no anúncio cria obrigação que a incorporadora não pode cumprir.",
  },
  {
    acao: "prometer_financiamento",
    re: /\bsem\s+an[áa]lise\s+(de\s+)?cr[ée]dito\b|\bfinanciamos\s+100\s*%|\baprova[çc][ãa]o\s+(garantida|imediata|na\s+hora)/i,
    porque: "Dispensar ou garantir a análise de crédito promete o que só o banco decide.",
  },
  {
    acao: "garantir_preco_ou_estoque",
    re: /\bpre[çc]o\s+(garantid[oa]|congelad[oa]|travad[oa])|\bvalor\s+v[áa]lido\s+at[ée]\b|\btabela\s+congelada\b/i,
    porque: "Preço muda por fora do anúncio. Garanti-lo gera venda que a tabela não sustenta.",
  },
  {
    acao: "garantir_preco_ou_estoque",
    re: /\b[úu]ltim[ao]s?\s+unidades?\b|\b[úu]ltima\s+chance\b|\bestoque\s+garantid[oa]\b|\bunidades?\s+garantidas?\b/i,
    porque: "Disponibilidade muda a cada venda. Afirmar escassez sem estoque vivo é afirmar o que o anúncio não sabe.",
  },
];

// ---------------------------------------------------------------------------
// A auditoria
// ---------------------------------------------------------------------------

/** A forma de `public.project_region_sources` que importa para decidir. */
export type FonteDeLastro = {
  id: string;
  category: string;
  publisher: string;
  sourceUrl: string;
  summary: string;
  referenceDate: string;
  validUntil: string;
  reviewStatus: string;
};

export type ViolacaoDeLastro = {
  /** Índice do texto na lista recebida — a tela precisa apontar qual peça. */
  indice: number;
  texto: string;
  tipo: TipoDeNumero | "promessa_proibida";
  trecho: string;
  motivo: string;
  /** Presente só na promessa proibida: a ação de nível 5 que ela representa. */
  acaoProibida?: "garantir_preco_ou_estoque" | "prometer_financiamento";
};

export type FatoComLastro = {
  indice: number;
  trecho: string;
  tipo: TipoDeNumero;
  origem: "fonte_verificada" | "cadastro";
  /** Preenchido quando a origem é fonte: é o que a peça precisa poder citar. */
  fonte: { id: string; publisher: string; sourceUrl: string; validUntil: string } | null;
};

export type AuditoriaDeLastro = {
  aprovado: boolean;
  violacoes: ViolacaoDeLastro[];
  lastros: FatoComLastro[];
  /** Índices dos textos sem nenhuma violação — o que pode ser salvo. */
  textosAprovados: number[];
  fontesUtilizaveis: number;
  fontesIgnoradas: Array<{ id: string; motivo: string }>;
};

/**
 * Fonte que pode dar lastro: verificada por gente E ainda vigente.
 *
 * As duas metades são conferidas aqui, e o contrato prova as duas: uma fonte
 * `pending` vigente e uma fonte `verified` vencida têm de ser recusadas pelos
 * seus próprios motivos. Conferir só uma metade é o defeito que deixaria a
 * coleta automática (que nasce `pending`) alimentar o anúncio sozinha.
 */
export function fontesUtilizaveis(fontes: FonteDeLastro[], hoje: string) {
  const utilizaveis: FonteDeLastro[] = [];
  const ignoradas: Array<{ id: string; motivo: string }> = [];
  for (const fonte of fontes ?? []) {
    if (fonte.reviewStatus !== "verified") {
      ignoradas.push({ id: fonte.id, motivo: `fonte em "${fonte.reviewStatus}" — só fonte verificada por uma pessoa dá lastro a número em anúncio.` });
      continue;
    }
    if (!fonte.validUntil || fonte.validUntil < hoje) {
      ignoradas.push({ id: fonte.id, motivo: `fonte vencida em ${fonte.validUntil || "data ausente"} — número de mercado fora da validade não sustenta anúncio de hoje.` });
      continue;
    }
    utilizaveis.push(fonte);
  }
  return { utilizaveis, ignoradas };
}

/**
 * Tipos que o CADASTRO do empreendimento pode sustentar.
 *
 * `percentual` está fora de propósito: `developments` não tem coluna de
 * percentual nenhuma, e deixá-lo entrar faria `total_units = 80` dar lastro a
 * "80% de valorização". Um número só serve de lastro para o tipo de afirmação
 * que ele de fato é.
 */
/**
 * ── O CADASTRO SÓ LASTREIA O QUE ELE DE FATO GUARDA ─────────────────────────
 *
 * `distancia` estava nesta lista e NÃO existe coluna de distância no cadastro.
 * Efeito medido pelo cético desta frente: os seis valores de lastro
 * (price_min, price_max, delivery_date, private_area_min, private_area_max,
 * total_units) viravam um SACO ÚNICO de números sem tipo, e qualquer um casava
 * com qualquer tipo permitido.
 *
 * Concretamente: um prédio com `total_units = 80` dava lastro de "cadastro" à
 * frase "a 80 metros do metrô". Distância é afirmação sobre o MUNDO, não sobre
 * o produto — e afirmação sobre o mundo, num anúncio de imóvel, é exatamente o
 * que precisa de fonte verificada. Era o risco que esta frente existe para
 * fechar, aberto pelo próprio portão dela.
 *
 *
 * `preco_por_m2` também saiu, e por um motivo diferente de `distancia`: ele é
 * valor DERIVADO, e o cadastro não guarda nenhum. Casá-lo com uma coluna de
 * preço cru seria pior que não lastrear — daria a "R$ 12.400/m²" o aval de um
 * `price_min` de 450.000 só porque os dois são "preço". Enquanto ninguém
 * calcular a derivação com as duas pontas (preço E área da MESMA unidade), um
 * número de preço por m² precisa de fonte verificada.
 *
 * `percentual` nunca teve lastro de cadastro, e é o mais sensível de todos:
 * valorização e rentabilidade são afirmação sobre o futuro.
 *
 * Agora cada tipo declara QUAIS colunas podem lastreá-lo. Coluna que não fala
 * do assunto não serve de prova dele.
 */
const COLUNAS_QUE_LASTREIAM: Partial<Record<TipoDeNumero, readonly string[]>> = {
  preco: ["price_min", "price_max"],
  ano_de_entrega: ["delivery_date"],
};
const TIPOS_COM_LASTRO_NO_CADASTRO = new Set<TipoDeNumero>(
  Object.keys(COLUNAS_QUE_LASTREIAM) as TipoDeNumero[],
);

/**
 * O NÚMERO DA FONTE PRECISA SER DO MESMO ASSUNTO.
 *
 * Comparar só o valor era o defeito que o contrato pegou: a fonte dizia
 * "valorização de 8,4% em 12 MESES" e o criativo dizia "valorização de 12% ao
 * ano" — o 12 de "12 meses" dava lastro ao 12% inventado. Agora a comparação é
 * pelo par (tipo, valor), e quando os dois lados sabem o assunto do percentual
 * ("valorizacao", "rentabilidade"), o assunto também precisa bater.
 *
 * O que isto NÃO resolve, e vale dizer em voz alta: fonte e peça podem citar o
 * mesmo número, do mesmo tipo e do mesmo assunto com recortes de tempo
 * diferentes. Essa distância é o que a revisão humana da Fase 69 existe para
 * cobrir — o portão garante procedência, não interpretação.
 */
function mesmoFato(daPeca: NumeroSensivel, daFonte: NumeroSensivel): boolean {
  if (daPeca.tipo !== daFonte.tipo || daPeca.valor !== daFonte.valor) return false;
  if (daPeca.assunto && daFonte.assunto && daPeca.assunto !== daFonte.assunto) return false;
  return true;
}

const ROTULO: Record<TipoDeNumero, string> = {
  percentual: "percentual",
  preco: "preço",
  preco_por_m2: "preço por m²",
  ano_de_entrega: "ano de entrega",
  distancia: "distância",
};

/**
 * A auditoria. Entra o texto do criativo, as fontes regionais do
 * empreendimento e os dados JÁ CADASTRADOS; sai o que pode ser publicado e o
 * que não pode, item a item, com o motivo escrito.
 *
 * `cadastro` são os valores que existem em `developments` (preço, área, prazo).
 * Passá-los é o que impede o portão de reprovar "a partir de R$ 450.000" quando
 * 450000 é literalmente o `price_min` da linha.
 */
export function auditarCriativoContraFontes(input: {
  textos: string[];
  fontes: FonteDeLastro[];
  hoje: string;
  /**
   * Valores do cadastro POR COLUNA. Array plano não serve: sem saber de qual
   * coluna veio o número, "80 unidades" lastreia "80 metros".
   */
  cadastro?: Record<string, string | number | null | undefined>;
}): AuditoriaDeLastro {
  const { utilizaveis, ignoradas } = fontesUtilizaveis(input.fontes ?? [], input.hoje);
  // Um conjunto POR COLUNA. O saco único era o defeito.
  const numerosPorColuna = new Map<string, Set<string>>();
  for (const [coluna, valor] of Object.entries(input.cadastro ?? {})) {
    if (valor === null || valor === undefined || valor === "") continue;
    const conjunto = numerosPorColuna.get(coluna) ?? new Set<string>();
    for (const numero of numerosDoTexto(String(valor))) conjunto.add(numero);
    numerosPorColuna.set(coluna, conjunto);
  }
  const cadastroLastreia = (tipo: TipoDeNumero, valor: string) =>
    (COLUNAS_QUE_LASTREIAM[tipo] ?? []).some((coluna) => numerosPorColuna.get(coluna)?.has(valor));
  // O vocabulário da fonte é TIPADO — os números dela passam pelo mesmo
  // extrator que os da peça, para que "12 meses" nunca dê lastro a "12%".
  const vocabularioDaFonte = utilizaveis.map((fonte) => ({ fonte, numeros: numerosSensiveis(fonte.summary) }));

  const violacoes: ViolacaoDeLastro[] = [];
  const lastros: FatoComLastro[] = [];
  const textos = (input.textos ?? []).map((texto) => String(texto ?? ""));

  textos.forEach((texto, indice) => {
    for (const promessa of PROMESSAS_PROIBIDAS) {
      const match = texto.match(promessa.re);
      if (!match) continue;
      violacoes.push({
        indice,
        texto,
        tipo: "promessa_proibida",
        trecho: match[0].trim(),
        acaoProibida: promessa.acao,
        motivo: `"${match[0].trim()}" é da classe ${promessa.acao}, proibida autonomamente (nível 5). ${promessa.porque} Nenhuma fonte verificada libera isto.`,
      });
    }
    for (const numero of numerosSensiveis(texto)) {
      if (TIPOS_COM_LASTRO_NO_CADASTRO.has(numero.tipo) && cadastroLastreia(numero.tipo, numero.valor)) {
        lastros.push({ indice, trecho: numero.trecho, tipo: numero.tipo, origem: "cadastro", fonte: null });
        continue;
      }
      const casada = vocabularioDaFonte.find((item) => item.numeros.some((daFonte) => mesmoFato(numero, daFonte)));
      if (casada) {
        lastros.push({
          indice,
          trecho: numero.trecho,
          tipo: numero.tipo,
          origem: "fonte_verificada",
          fonte: { id: casada.fonte.id, publisher: casada.fonte.publisher, sourceUrl: casada.fonte.sourceUrl, validUntil: casada.fonte.validUntil },
        });
        continue;
      }
      violacoes.push({
        indice,
        texto,
        tipo: numero.tipo,
        trecho: numero.trecho,
        motivo:
          `"${numero.trecho}" afirma ${ROTULO[numero.tipo]}${numero.assunto ? ` de ${numero.assunto}` : ""} sem lastro: ` +
          `o valor ${numero.valor} não está no cadastro do empreendimento nem em nenhuma das ${utilizaveis.length} fonte(s) regionais verificadas e vigentes. ` +
          `Cadastre a fonte em Estudo regional e mande verificar, ou tire o número da peça.`,
      });
    }
  });

  const reprovados = new Set(violacoes.map((item) => item.indice));
  return {
    aprovado: violacoes.length === 0,
    violacoes,
    lastros,
    textosAprovados: textos.map((_, indice) => indice).filter((indice) => !reprovados.has(indice)),
    fontesUtilizaveis: utilizaveis.length,
    fontesIgnoradas: ignoradas,
  };
}

/**
 * Poda uma lista de textos, devolvendo só o que tem lastro.
 *
 * Existe porque a alternativa — salvar a peça com uma marca de "bloqueada" —
 * confia em todo consumidor futuro respeitar a marca. Aqui o texto sem lastro
 * simplesmente NÃO chega a `creative_assets`, e o chamador recebe a lista do que
 * foi removido para dizer isso ao operador em voz alta.
 */
export function podarTextosSemLastro(input: {
  textos: string[];
  fontes: FonteDeLastro[];
  hoje: string;
  /**
   * Valores do cadastro POR COLUNA. Array plano não serve: sem saber de qual
   * coluna veio o número, "80 unidades" lastreia "80 metros".
   */
  cadastro?: Record<string, string | number | null | undefined>;
}): { mantidos: string[]; removidos: Array<{ texto: string; motivo: string }>; auditoria: AuditoriaDeLastro } {
  const auditoria = auditarCriativoContraFontes(input);
  const textos = (input.textos ?? []).map((texto) => String(texto ?? ""));
  const removidos = [...new Set(auditoria.violacoes.map((item) => item.indice))].sort((a, b) => a - b).map((indice) => ({
    texto: textos[indice] ?? "",
    motivo: auditoria.violacoes.filter((item) => item.indice === indice).map((item) => item.motivo).join(" "),
  }));
  return { mantidos: auditoria.textosAprovados.map((indice) => textos[indice]), removidos, auditoria };
}

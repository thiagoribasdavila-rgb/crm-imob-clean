/**
 * PESQUISA DE REGIÃO COM FONTE OBRIGATÓRIA — núcleo puro.
 *
 * ── O que já existia, e por que nunca rodou ────────────────────────────────
 *
 * A Fase 69 entregou o estudo regional inteiro e ele está vivo no banco de
 * produção (conferido em 02/08/2026: tabela, tabela de eventos e as três
 * funções existem):
 *
 *   · `public.project_region_sources` — categoria, título, publicador, URL
 *     HTTPS, resumo, data de referência, validade e `review_status`;
 *   · `upsert_project_region_source` / `review_project_region_source` /
 *     `sync_project_region_source_register` — insert sempre `pending`, revisão
 *     restrita a diretoria/superintendência, e expiração automática;
 *   · `app/api/v1/developments/[id]/region-study/route.ts` e a tela
 *     `app/(crm)/developments/[id]/region-study/page.tsx`.
 *
 * E `project_region_sources` tem ZERO linha. O motivo é simples: a única porta
 * de entrada era um formulário em que uma pessoa digita título, publicador,
 * URL, resumo e duas datas, à mão, por fonte. Ninguém nunca digitou.
 *
 * Este módulo é a porta que faltava — a COLETA. Ele não substitui nada do que
 * existe: entrega no mesmo formato que `upsert_project_region_source` já exige,
 * e o que ele produz nasce `pending`, para a mesma revisão humana da Fase 69.
 *
 * ── Por que a pergunta não pode ser texto livre ────────────────────────────
 *
 * A pergunta nasce de `developments.neighborhood` e `developments.city` — as
 * colunas reais. Aceitar texto livre transformaria o estudo de "Perdizes, São
 * Paulo" num estudo do que o operador digitou, e o resultado seria gravado
 * amarrado a um empreendimento que não é o do texto. Sem bairro OU sem cidade
 * não há pergunta: devolver estudo de cidade rotulado como estudo de bairro é
 * pior do que dizer que falta cadastro.
 *
 * ── Afirmação sem fonte NÃO entra ──────────────────────────────────────────
 *
 * Três travas independentes, nesta ordem:
 *
 *   1. FORMA — a afirmação precisa vir com categoria válida, título,
 *      publicador, URL https e resumo. É a mesma régua que a RPC aplica; falhar
 *      aqui evita uma ida ao banco para receber `region_source_invalid`.
 *   2. PROCEDÊNCIA — a URL da afirmação precisa estar entre as CITAÇÕES que o
 *      próprio provedor devolveu. Esta é a trava que importa: um modelo escreve
 *      uma URL plausível sem esforço nenhum, e uma URL inventada com publicador
 *      inventado é indistinguível de fonte real na hora da revisão. O provedor
 *      de pesquisa (Perplexity, rota `research` de `lib/ai/provider-router.ts`,
 *      `costPolicy: "research_with_sources"`) devolve `citations` com as páginas
 *      que ele de fato leu. O que não está lá não foi lido.
 *   3. VALIDADE — a validade NÃO é escolhida pelo modelo. Ela é calculada a
 *      partir da data de referência com a tabela declarada em
 *      `VALIDADE_POR_CATEGORIA`. Deixar o modelo dizer "válido até 2036" seria
 *      deixá-lo se autoconceder vigência, e uma fonte já vencida na origem é
 *      descartada em vez de virar linha vencida no banco.
 *
 * Módulo PURO: sem rede, sem banco, sem `server-only`, sem relógio. Quem chama
 * o provedor e quem grava é `lib/marketing/coleta-de-regiao.ts`.
 */

// Extensão explícita: o repositório já importa assim (ver lib/crm/*.ts) porque
// é o que permite ao contrato carregar este módulo direto com
// `node --experimental-strip-types`, sem resolver alias.
import { numerosSensiveis, type NumeroSensivel } from "./fato-com-lastro.ts";

// ---------------------------------------------------------------------------
// Vocabulário — o mesmo do CHECK da tabela
// ---------------------------------------------------------------------------

/**
 * As dez categorias do CHECK de `project_region_sources.category`.
 *
 * Repetidas aqui porque este módulo é puro e não lê SQL nem JSON. O contrato
 * `tests/contracts/fonte-antes-do-fato.test.mjs` confere esta lista contra a
 * migration E contra `config/governed-region-study.json` — divergir faria a
 * coleta produzir linhas que a RPC recusa com `region_source_invalid`, e o
 * operador veria "não foi possível gravar" sem nenhuma pista do porquê.
 */
export const CATEGORIAS_DE_REGIAO = [
  "mobility",
  "education",
  "health",
  "services",
  "leisure",
  "demand",
  "competition",
  "price_m2",
  "demographics",
  "infrastructure",
] as const;

export type CategoriaDeRegiao = (typeof CATEGORIAS_DE_REGIAO)[number];

export function ehCategoriaDeRegiao(valor: unknown): valor is CategoriaDeRegiao {
  return typeof valor === "string" && (CATEGORIAS_DE_REGIAO as readonly string[]).includes(valor);
}

/**
 * O QUE A MÁQUINA GRAVA. Uma constante, e não um literal espalhado.
 *
 * `'verified'` significa "uma pessoa conferiu a fonte, o recorte e a data". Uma
 * coleta automática não pode se atribuir isso nem por engano de digitação, e é
 * por isso que existe um só lugar onde este valor é escrito.
 */
export const REVIEW_STATUS_DA_MAQUINA = "pending" as const;

/**
 * VALIDADE POR CATEGORIA, em dias — decisão declarada, não palpite do modelo.
 *
 * Preço por m², demanda e concorrência são os números que mais envelhecem: seis
 * meses é o limite em que ainda descrevem o mercado de hoje. Demografia vem de
 * censo e pesquisa domiciliar, que mudam de ano em ano. Mobilidade,
 * infraestrutura e equipamentos urbanos mudam devagar, mas mudam — um ano.
 */
export const VALIDADE_POR_CATEGORIA: Record<CategoriaDeRegiao, number> = {
  price_m2: 180,
  demand: 180,
  competition: 180,
  demographics: 730,
  mobility: 365,
  infrastructure: 365,
  education: 365,
  health: 365,
  services: 365,
  leisure: 365,
};

// ---------------------------------------------------------------------------
// A pergunta — feita do bairro e da cidade que estão no banco
// ---------------------------------------------------------------------------

export type EmpreendimentoDaPesquisa = {
  id: string;
  nome: string;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
};

export type PerguntaDeRegiao = {
  pergunta: string | null;
  bairros: string[];
  cidade: string | null;
  estado: string | null;
  /** Vazio quando há pergunta. Não-vazio explica por que não há. */
  problemas: string[];
};

/**
 * Um empreendimento pode cobrir mais de um bairro — "Spin Mood" está cadastrado
 * como "Perdizes / Vila Madalena / Vila Anglo Brasileira". Estudar só o primeiro
 * seria estudar um terço do produto; jogar a string inteira na pergunta viraria
 * uma busca por um bairro que não existe.
 */
export function bairrosDoCadastro(bruto: string | null | undefined): string[] {
  return String(bruto ?? "")
    .split(/[/;|]/)
    .map((parte) => parte.trim())
    .filter((parte) => parte.length >= 2)
    .slice(0, 4);
}

export function perguntaDeRegiao(dev: EmpreendimentoDaPesquisa): PerguntaDeRegiao {
  const bairros = bairrosDoCadastro(dev?.bairro);
  const cidade = String(dev?.cidade ?? "").trim() || null;
  const estado = String(dev?.estado ?? "").trim() || null;
  const problemas: string[] = [];
  if (!bairros.length) problemas.push("`developments.neighborhood` está vazio — sem bairro cadastrado o estudo viraria um estudo de cidade rotulado como estudo de região.");
  if (!cidade) problemas.push("`developments.city` está vazio — sem cidade não dá para desambiguar o bairro.");
  if (problemas.length) return { pergunta: null, bairros, cidade, estado, problemas };

  const local = `${bairros.join(", ")} — ${cidade}${estado ? `/${estado}` : ""}`;
  const pergunta = [
    `Pesquise dados públicos e verificáveis sobre a região de ${local}, no contexto do mercado imobiliário residencial.`,
    "",
    "Cubra, quando houver fonte pública:",
    "- mobilidade (estações de metrô/trem, linhas, obras em andamento);",
    "- educação e saúde (equipamentos relevantes no entorno);",
    "- comércio, serviços e lazer (parques, centros culturais);",
    "- preço médio por m² de venda e de locação residencial no bairro;",
    "- demanda, oferta de lançamentos e concorrência;",
    "- demografia e infraestrutura urbana.",
    "",
    "Cada afirmação precisa vir de UMA fonte pública que você realmente consultou.",
  ].join("\n");
  return { pergunta, bairros, cidade, estado, problemas: [] };
}

/**
 * A instrução do sistema para a rota de pesquisa.
 *
 * Ela pede o campo `referenceDate` (a data da PUBLICAÇÃO consultada) e não pede
 * validade: validade é política nossa, calculada aqui. E proíbe explicitamente
 * completar o que não achou — um modelo de pesquisa que não encontra número
 * tende a produzir um número "típico", e é exatamente esse número que vira
 * processo.
 */
export const SISTEMA_DA_PESQUISA_DE_REGIAO = [
  "Você é pesquisador de mercado imobiliário e trabalha SOMENTE com fontes públicas que você consultou nesta busca.",
  "Responda em português do Brasil.",
  "",
  "REGRAS INEGOCIÁVEIS:",
  "- Toda afirmação carrega a fonte de onde ela saiu. Afirmação sem fonte não deve ser escrita.",
  "- Copie a URL EXATAMENTE como ela aparece na fonte consultada. Nunca escreva uma URL de memória.",
  "- `publisher` é o nome do veículo/instituição que publicou (ex.: Prefeitura de São Paulo, FipeZAP, IBGE, Metrô SP).",
  "- `referenceDate` é a data de publicação ou de referência do dado, no formato AAAA-MM-DD. Se a fonte não trouxer data, NÃO inclua a afirmação.",
  "- Número (preço por m², percentual, prazo) só entra se estiver escrito na fonte. Não estime, não arredonde de memória, não use 'em média' sem número publicado.",
  "- Não fale do empreendimento, do preço dele nem de financiamento. O recorte é a REGIÃO.",
  "- Não escreva dado pessoal de ninguém.",
  "",
  "Responda SOMENTE com JSON válido, sem cercas de código e sem comentários, no formato:",
  '{"afirmacoes":[{"category":"mobility","title":"...","publisher":"...","sourceUrl":"https://...","summary":"...","referenceDate":"AAAA-MM-DD"}]}',
  "",
  `"category" deve ser um destes: ${CATEGORIAS_DE_REGIAO.join(", ")}.`,
  '"summary" tem no mínimo 20 caracteres e diz o que a fonte comprova sobre esta região, com o número quando houver.',
  "Se não encontrar nenhuma fonte para uma categoria, simplesmente não devolva afirmação daquela categoria.",
].join("\n");

// ---------------------------------------------------------------------------
// Recorte de JSON
// ---------------------------------------------------------------------------

/**
 * Modelos devolvem JSON cercado por ``` ou com texto em volta mesmo instruídos a
 * não fazer. Recortar o primeiro objeto balanceado é mais confiável do que
 * confiar na obediência do modelo.
 *
 * Mora aqui, e não em `creative-studio.ts`, porque este módulo é puro: aquele
 * abre importando `@/lib/ai/provider-router`, que tem `server-only`, e nenhum
 * teste consegue carregá-lo — a versão privada que vive lá não tem contrato
 * nenhum e só se sabe que funciona lendo o código. Esta é a mesma regra num
 * lugar que dá para exercitar; quem for mexer naquele arquivo pode passar a
 * importar daqui e apagar a cópia.
 */
export function recortarObjetoJson<T>(texto: string): T | null {
  const limpo = String(texto ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(limpo) as T;
  } catch {
    /* segue para o recorte */
  }
  const inicio = limpo.indexOf("{");
  if (inicio < 0) return null;
  let profundidade = 0;
  for (let i = inicio; i < limpo.length; i += 1) {
    if (limpo[i] === "{") profundidade += 1;
    else if (limpo[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) {
        try {
          return JSON.parse(limpo.slice(inicio, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Da resposta do provedor para a linha de project_region_sources
// ---------------------------------------------------------------------------

/** Exatamente o payload que `upsert_project_region_source` aceita. */
export type PayloadDeFonte = {
  category: CategoriaDeRegiao;
  title: string;
  publisher: string;
  sourceUrl: string;
  summary: string;
  referenceDate: string;
  validUntil: string;
};

export type FonteCandidata = {
  payload: PayloadDeFonte;
  /** Sempre `pending`. A máquina não verifica a si mesma. */
  reviewStatus: typeof REVIEW_STATUS_DA_MAQUINA;
  /** Números do resumo que o revisor precisa conferir com atenção redobrada. */
  numerosSensiveis: NumeroSensivel[];
  /**
   * A data de referência é igual à data da consulta.
   *
   * MEDIDO no ensaio a seco de 02/08/2026 sobre Perdizes: 10 das 11 afirmações
   * aceitas vieram com `referenceDate` = hoje. Páginas de índice de portal
   * (ZAP, Imovelweb) realmente publicam número corrente e não exibem data — para
   * elas hoje é a referência certa. Um artigo de blog sem data também sai assim,
   * e aí a data é uma presunção que ganha 180 dias de validade de brinde.
   *
   * A máquina não sabe distinguir os dois casos, então não finge que sabe: ela
   * marca, e a marca viaja DENTRO do resumo que a tela de revisão mostra.
   */
  dataPresumida: boolean;
};

/**
 * O aviso que entra no próprio resumo quando a data foi presumida.
 *
 * Vai no `summary`, e não num campo novo, porque `summary` é o que a tela
 * `app/(crm)/developments/[id]/region-study/page.tsx` já exibe ao revisor. Campo
 * novo exigiria migration e, até ela ser aplicada, o aviso não chegaria a
 * ninguém — que é o mesmo que não existir.
 */
export function avisoDeDataPresumida(hoje: string): string {
  return ` [Atlas: a fonte não exibiu data de publicação; a coleta registrou a data da consulta (${hoje}) como referência. Confira a data na fonte antes de verificar.]`;
}

export type AfirmacaoDescartada = {
  motivo: string;
  /** O que dava para identificar da afirmação recusada — nunca a afirmação inteira. */
  identificacao: string;
};

export type ColetaAnalisada = {
  aceitas: FonteCandidata[];
  descartadas: AfirmacaoDescartada[];
  /** Citações que o provedor devolveu. Vazio = nada foi de fato consultado. */
  citacoes: string[];
};

/** Mesma régua do CHECK da RPC: só https, sem espaço em branco. */
const URL_ACEITA = /^https:\/\/[^\s]+$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Host + caminho, minúsculos, sem query nem barra final. Compara o que identifica a página. */
function chaveDaUrl(bruto: string): string | null {
  try {
    const url = new URL(String(bruto ?? "").trim());
    if (url.protocol !== "https:") return null;
    const caminho = url.pathname.replace(/\/+$/, "");
    return `${url.host.toLowerCase()}${caminho}`;
  } catch {
    return null;
  }
}

function somarDias(dataIso: string, dias: number): string {
  const base = Date.parse(`${dataIso}T00:00:00Z`);
  if (!Number.isFinite(base)) return "";
  return new Date(base + dias * 86_400_000).toISOString().slice(0, 10);
}

function dataValida(valor: string): boolean {
  if (!DATA_ISO.test(valor)) return false;
  const parsed = new Date(`${valor}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === valor;
}

/**
 * A análise. Entra o texto do provedor + as citações que ELE devolveu; saem as
 * fontes que podem virar linha e, com nome e motivo, as que não podem.
 *
 * Nenhuma afirmação recusada é "corrigida" para caber. Preencher publicador
 * ausente com "desconhecido" ou data ausente com hoje transformaria a recusa em
 * aceitação silenciosa — que é o defeito que este módulo existe para não ter.
 */
export function afirmacoesComFonte(input: {
  texto: string;
  citacoes: string[];
  hoje: string;
}): ColetaAnalisada {
  const citacoes = [...new Set((input.citacoes ?? []).map((item) => String(item ?? "").trim()).filter(Boolean))];
  const chavesCitadas = new Set(citacoes.map(chaveDaUrl).filter((chave): chave is string => Boolean(chave)));
  const descartadas: AfirmacaoDescartada[] = [];
  const aceitas: FonteCandidata[] = [];

  const corpo = recortarObjetoJson<{ afirmacoes?: unknown }>(input.texto);
  if (!corpo || !Array.isArray(corpo.afirmacoes)) {
    return {
      aceitas,
      descartadas: [{ identificacao: "(resposta inteira)", motivo: "o provedor de pesquisa não devolveu JSON com a lista `afirmacoes` — nada foi aproveitado." }],
      citacoes,
    };
  }
  if (!chavesCitadas.size) {
    return {
      aceitas,
      descartadas: [{ identificacao: "(resposta inteira)", motivo: `o provedor devolveu ${corpo.afirmacoes.length} afirmação(ões) e NENHUMA citação. Sem a lista de páginas efetivamente consultadas não há como distinguir fonte lida de URL escrita de memória.` }],
      citacoes,
    };
  }

  for (const bruta of corpo.afirmacoes) {
    const linha = (bruta ?? {}) as Record<string, unknown>;
    const texto = (chave: string) => String(linha[chave] ?? "").trim();
    const identificacao = texto("title").slice(0, 80) || texto("sourceUrl").slice(0, 80) || "(afirmação sem título)";
    const recusar = (motivo: string) => descartadas.push({ identificacao, motivo });

    const category = texto("category");
    if (!ehCategoriaDeRegiao(category)) {
      recusar(`categoria "${category || "(vazia)"}" não é uma das ${CATEGORIAS_DE_REGIAO.length} aceitas pela tabela.`);
      continue;
    }
    const title = texto("title");
    const publisher = texto("publisher");
    const sourceUrl = texto("sourceUrl");
    const summary = texto("summary");
    const referenceDate = texto("referenceDate");
    if (title.length < 3) { recusar("título com menos de 3 caracteres."); continue; }
    if (publisher.length < 2) { recusar("sem publicador — fonte sem quem publicou não é fonte."); continue; }
    if (!URL_ACEITA.test(sourceUrl)) { recusar(`URL "${sourceUrl || "(vazia)"}" não é https sem espaços — a tabela recusa qualquer outra forma.`); continue; }
    if (summary.length < 20) { recusar("resumo com menos de 20 caracteres — não diz o que a fonte comprova."); continue; }
    if (!dataValida(referenceDate)) { recusar(`data de referência "${referenceDate || "(vazia)"}" não é uma data AAAA-MM-DD válida. Fonte sem data não sustenta afirmação de mercado.`); continue; }
    if (referenceDate > input.hoje) { recusar(`data de referência ${referenceDate} está no futuro.`); continue; }

    const chave = chaveDaUrl(sourceUrl);
    if (!chave || !chavesCitadas.has(chave)) {
      recusar(`a URL ${sourceUrl} não está entre as ${citacoes.length} páginas que o provedor declarou ter consultado. Afirmação sem procedência não entra.`);
      continue;
    }

    const validUntil = somarDias(referenceDate, VALIDADE_POR_CATEGORIA[category]);
    if (!validUntil) { recusar(`não foi possível calcular a validade a partir de ${referenceDate}.`); continue; }
    if (validUntil < input.hoje) {
      recusar(`fonte já vencida: referência de ${referenceDate} + ${VALIDADE_POR_CATEGORIA[category]} dias de validade da categoria "${category}" vence em ${validUntil}, antes de hoje (${input.hoje}).`);
      continue;
    }

    const dataPresumida = referenceDate === input.hoje;
    const resumo = `${summary.slice(0, 3800)}${dataPresumida ? avisoDeDataPresumida(input.hoje) : ""}`;
    aceitas.push({
      payload: { category, title: title.slice(0, 300), publisher: publisher.slice(0, 200), sourceUrl, summary: resumo, referenceDate, validUntil },
      reviewStatus: REVIEW_STATUS_DA_MAQUINA,
      // Os números vêm do resumo ORIGINAL: o aviso é texto do Atlas, e um número
      // dele jamais pode virar vocabulário de lastro para um anúncio.
      numerosSensiveis: numerosSensiveis(summary),
      dataPresumida,
    });
  }

  return { aceitas, descartadas, citacoes };
}

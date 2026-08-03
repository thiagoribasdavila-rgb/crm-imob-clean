/**
 * O CRIATIVO QUE NASCE COM LASTRO — núcleo PURO.
 *
 * Aqui mora a REGRA: o que o modelo devolveu vira peça? com qual taxonomia? com
 * qual procedência? e o que exatamente seria gravado? Quem fala com o banco e
 * com o roteador de IA é `gerador-de-criativos.ts`.
 *
 * ── Por que a regra não pode morar junto com o I/O ────────────────────────
 *
 * `provider-router.ts` e `supabase/admin.ts` têm `import "server-only"`:
 * qualquer módulo que os importe fica invisível para `node --test`. Deixar a
 * decisão lá dentro é a armadilha que este repositório já pagou caro — portão
 * que não consegue CARREGAR a regra acaba conferindo se o arquivo contém certas
 * palavras, e um portão assim ficou verde por anos sobre um defeito vivo.
 *
 * Então: sem `@/`, sem `server-only`, sem rede, sem relógio próprio. O contrato
 * `tests/contracts/criativo-nasce-com-lastro.test.mjs` chama estas funções de
 * verdade e vê cada uma recusar.
 */

import { createHash } from "node:crypto";
import { validateCopy, type CopyViolation } from "../ai/creative-strategist.ts";
import {
  conferirNumeros,
  fichaEmTexto,
  type Divergencia,
  type FichaDeFatos,
} from "./fatos-do-empreendimento.ts";

/** Repetido aqui — e não importado de creative-studio.ts — porque este módulo é
 *  puro e aquele arquivo carrega o roteador de IA junto. O contrato confere que
 *  as duas listas não divergem. */
export type ObjetivoDeCampanha =
  | "gerar_leads" | "contato_whatsapp" | "gerar_visitas"
  | "divulgar_lancamento" | "vender_estoque" | "atrair_investidores" | "remarketing";

/**
 * Versão do prompt. Sobe a cada mudança do texto — sem isso, duas peças com o
 * mesmo modelo e resultados diferentes viram mistério insolúvel.
 */
export const PROMPT_VERSAO = "criativo-com-lastro@1";

/**
 * O agente é o prefixo da feature (`agenteDaFeature` corta no primeiro ponto).
 * `creative-studio` está declarado em config/orcamento-e-autonomia-da-ia.json
 * com NÍVEL 2 — "escreve copy e briefing e DEIXA salvo para revisão". Inventar
 * um prefixo novo criaria um agente sem nível declarado e sem teto de gasto.
 */
export const FEATURE_GERACAO = "creative-studio.variacoes-com-lastro";

// ---------------------------------------------------------------------------
// Taxonomia — o vocabulário que o CHECK do banco aceita
// ---------------------------------------------------------------------------

export const ANGULOS = [
  "location", "lifestyle", "investment", "affordability",
  "scarcity", "architecture", "amenities", "trust",
] as const;
export const PERSONAS = [
  "first_home", "upgrade", "investor", "relocation", "downsizing", "unspecified",
] as const;
export const ETAPAS = [
  "discovery", "consideration", "qualification", "visit",
  "proposal", "conversion", "reactivation",
] as const;

export type Angulo = (typeof ANGULOS)[number];
export type Persona = (typeof PERSONAS)[number];
export type Etapa = (typeof ETAPAS)[number];

/** Vocabulário de `creative_intelligence_versions.format`. Um só, nas duas tabelas. */
export const FORMATO_PADRAO = "static";

const naVocabulario = <T extends string>(lista: readonly T[], valor: unknown, padrao: T): T => {
  const v = String(valor ?? "").trim().toLowerCase();
  return (lista as readonly string[]).includes(v) ? (v as T) : padrao;
};

export function etapaDoObjetivo(objetivo: ObjetivoDeCampanha): Etapa {
  switch (objetivo) {
    case "divulgar_lancamento": return "discovery";
    case "gerar_visitas": return "visit";
    case "vender_estoque": return "proposal";
    case "remarketing": return "reactivation";
    default: return "consideration";
  }
}

/** CTA da Meta por objetivo. O texto livre da peça (`chamada`) é outra coisa. */
export function ctaDaMeta(objetivo: ObjetivoDeCampanha): "LEARN_MORE" | "SIGN_UP" | "CONTACT_US" {
  if (objetivo === "contato_whatsapp") return "CONTACT_US";
  if (objetivo === "gerar_leads" || objetivo === "gerar_visitas") return "SIGN_UP";
  return "LEARN_MORE";
}

// ---------------------------------------------------------------------------
// A variação
// ---------------------------------------------------------------------------

export type VariacaoGerada = {
  conceito: string;
  angulo: Angulo;
  persona: Persona;
  etapa: Etapa;
  titulo: string;
  textoPrincipal: string;
  descricao: string;
  chamada: string;
  objecao: string;
};

export type VariacaoAvaliada = VariacaoGerada & {
  aprovada: boolean;
  /** Números citados que o estoque não sustenta. */
  divergencias: Divergencia[];
  /** Limites da Meta e política de HOUSING / atributos pessoais. */
  violacoes: CopyViolation[];
  /** Quantos números a peça cita. Zero é informação, não silêncio. */
  numerosCitados: number;
};

const ROTULO_OBJETIVO: Record<ObjetivoDeCampanha, string> = {
  gerar_leads: "gerar leads qualificadas por formulário",
  contato_whatsapp: "iniciar conversas no WhatsApp",
  gerar_visitas: "agendar visitas ao decorado",
  divulgar_lancamento: "divulgar o lançamento e construir audiência",
  vender_estoque: "vender unidades específicas em estoque",
  atrair_investidores: "atrair investidores",
  remarketing: "reconquistar quem já demonstrou interesse",
};

/**
 * O prompt EXATO que vai ao modelo. Puro de propósito: é o que permite o ensaio
 * a seco mostrar o texto realmente enviado, e não uma reconstrução parecida.
 */
export function montarPromptDeVariacoes(
  ficha: FichaDeFatos,
  objetivo: ObjetivoDeCampanha,
  quantidade: number,
): string {
  return `${fichaEmTexto(ficha)}

Objetivo da campanha: ${ROTULO_OBJETIVO[objetivo]}.

Escreva ${quantidade} variações de anúncio para ESTE MESMO objetivo. Cada
variação precisa defender um ângulo conceitualmente diferente — variações que
só trocam palavras não servem para teste, porque não há o que comparar.

Devolva SOMENTE JSON:
{"variacoes":[{
  "conceito": "nome curto do conceito",
  "angulo": um de [${ANGULOS.join(", ")}],
  "persona": um de [${PERSONAS.join(", ")}],
  "etapa": um de [${ETAPAS.join(", ")}],
  "titulo": "até 40 caracteres",
  "textoPrincipal": "até 125 caracteres",
  "descricao": "até 30 caracteres",
  "chamada": "chamada curta para ação",
  "objecao": "a objeção real que esta variação responde"
}]}

Regras de tamanho são da Meta e não admitem estouro. Se um número não estiver na
ficha acima, a variação NÃO pode citá-lo — escreva a peça sem número.`;
}

/** Encaixa a saída livre do modelo no vocabulário que o banco aceita. */
export function normalizarVariacoes(bruto: unknown, objetivo: ObjetivoDeCampanha): VariacaoGerada[] {
  if (!Array.isArray(bruto)) return [];
  const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return bruto
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        conceito: texto(o.conceito, 120) || "sem conceito",
        angulo: naVocabulario(ANGULOS, o.angulo, "trust"),
        persona: naVocabulario(PERSONAS, o.persona, "unspecified"),
        etapa: naVocabulario(ETAPAS, o.etapa, etapaDoObjetivo(objetivo)),
        titulo: texto(o.titulo, 300),
        textoPrincipal: texto(o.textoPrincipal, 500),
        descricao: texto(o.descricao, 200),
        chamada: texto(o.chamada, 120) || "Saiba mais",
        objecao: texto(o.objecao, 500),
      };
    })
    .filter((v) => v.titulo.length >= 5 && v.textoPrincipal.length >= 10);
}

/** Quantos números a peça cita — dinheiro, metragem ou contagem de unidades. */
export function contarNumeros(texto: string): number {
  const t = String(texto ?? "");
  return (
    [...t.matchAll(/R\$\s*[\d.,]+/gi)].length +
    [...t.matchAll(/\d+(?:[.,]\d+)?\s*(?:m²|m2)/gi)].length +
    [...t.matchAll(/\d+\s*(?:unidades?|apartamentos?|aptos?|studios?)/gi)].length
  );
}

/**
 * Avalia cada variação: números contra o estoque, e texto contra os limites e a
 * política da Meta.
 *
 * A política reusa `validateCopy` de creative-strategist — a régua já existe, e
 * uma segunda régua sobre o mesmo texto seria duas verdades sobre a mesma peça.
 * As perguntas são diferentes e complementares: `validateCopy` pergunta "esta
 * FRASE é permitida?"; `conferirNumeros` pergunta "este NÚMERO existe?".
 */
export function avaliarVariacoes(variacoes: VariacaoGerada[], ficha: FichaDeFatos): VariacaoAvaliada[] {
  return variacoes.map((v) => {
    const divergencias = [
      ...conferirNumeros("titulo", v.titulo, ficha),
      ...conferirNumeros("textoPrincipal", v.textoPrincipal, ficha),
      ...conferirNumeros("descricao", v.descricao, ficha),
      ...conferirNumeros("chamada", v.chamada, ficha),
    ];
    const violacoes = validateCopy({
      product: ficha.nome,
      angles: [],
      primaryTexts: [v.textoPrincipal],
      headlines: [v.titulo],
      descriptions: [v.descricao],
      callToAction: "LEARN_MORE",
      complianceNotes: [],
    });
    return {
      ...v,
      // `creative_intelligence_versions` exige objeção de 5 a 500 caracteres, e
      // uma variação boa não pode morrer no banco porque o modelo foi lacônico.
      objecao: v.objecao.length >= 5 ? v.objecao : `Objeção não declarada pelo modelo no conceito "${v.conceito}".`,
      aprovada: divergencias.length === 0 && violacoes.length === 0,
      divergencias,
      violacoes,
      numerosCitados: contarNumeros(`${v.titulo} ${v.textoPrincipal} ${v.descricao} ${v.chamada}`),
    };
  });
}

// ---------------------------------------------------------------------------
// O plano de gravação — o que torna o ensaio a seco possível
// ---------------------------------------------------------------------------

export type LinhaCreativeAsset = {
  organization_id: string;
  /**
   * SEMPRE nulo. A FK desta coluna aponta para `campaigns` — tabela com 0 linhas
   * — e NÃO para `marketing_campaigns`, que tem 8. Gravar o id da segunda aqui
   * dá SQLSTATE 23503, e foi o que impediu toda peça de existir. O vínculo real
   * viaja em `metadata.marketingCampaignId`.
   */
  campaign_id: null;
  name: string;
  format: string;
  channel: string;
  headline: string;
  primary_text: string;
  description: string;
  call_to_action: string;
  status: "draft";
  created_by: string;
  metadata: Record<string, unknown>;
};

export type LinhaVersao = {
  organization_id: string;
  version_number: 1;
  development_id: string;
  funnel_stage: Etapa;
  persona_moment: Persona;
  message_angle: Angulo;
  primary_promise: string;
  objection_addressed: string;
  format: string;
  hook: string;
  call_to_action: string;
  content_hash: string;
  created_by: string;
};

export type ResultadoDaGeracao = {
  variacoes: VariacaoGerada[];
  provedor: string;
  modelo: string;
  tokens: number;
  custoUsd: number | null;
  geradoEm: string;
  /** `true` quando o roteador caiu no fallback local: NÃO houve texto de modelo. */
  semModelo: boolean;
};

export type ContextoDeGravacao = {
  ficha: FichaDeFatos;
  objetivo: ObjetivoDeCampanha;
  criadoPor: string;
  geracao: ResultadoDaGeracao;
  /** Id em `marketing_campaigns`, quando houver. Vai para metadata, não para FK. */
  marketingCampaignId?: string | null;
};

export type PlanoDeGravacao = {
  /** Peça e versão andam juntas: peça sem versão nunca entra na aprovação. */
  pecas: Array<{ asset: LinhaCreativeAsset; versao: LinhaVersao }>;
  recusadas: VariacaoAvaliada[];
  /** Por que não dá para gravar nada — vazio quando dá. Zero nunca é saúde. */
  impedimentos: string[];
};

/**
 * Monta EXATAMENTE as linhas que seriam gravadas, sem gravar. É o ensaio a seco
 * do produto, não um atalho de teste: quem gera precisa ver a peça e conferir os
 * números ANTES de a peça existir.
 */
export function planejarGravacao(
  avaliadas: VariacaoAvaliada[],
  ctx: ContextoDeGravacao,
): PlanoDeGravacao {
  const impedimentos: string[] = [];
  if (ctx.geracao.semModelo) {
    impedimentos.push(
      "o roteador de IA caiu no fallback local (sem provedor): nenhum texto foi escrito por modelo, e template fixo não vira peça",
    );
  }
  if (!avaliadas.length) impedimentos.push("o modelo não devolveu nenhuma variação utilizável");
  if (ctx.ficha.unidadesDisponiveis <= 0) {
    impedimentos.push("não há unidade disponível em properties — anunciar estoque inexistente é propaganda enganosa");
  }

  const aprovadas = avaliadas.filter((v) => v.aprovada);
  const recusadas = avaliadas.filter((v) => !v.aprovada);
  if (avaliadas.length && !aprovadas.length) {
    const problemas = recusadas.reduce((n, v) => n + v.divergencias.length + v.violacoes.length, 0);
    impedimentos.push(
      `todas as ${avaliadas.length} variações foram recusadas na conferência (${problemas} problema(s))`,
    );
  }

  const pecas = aprovadas.map((v) => ({
    asset: {
      organization_id: ctx.ficha.organizationId,
      campaign_id: null as null,
      name: `${ctx.ficha.nome} · ${v.conceito}`.slice(0, 200),
      format: FORMATO_PADRAO,
      channel: "meta",
      headline: v.titulo,
      primary_text: v.textoPrincipal,
      description: v.descricao,
      call_to_action: v.chamada,
      status: "draft" as const,
      created_by: ctx.criadoPor,
      metadata: {
        marketingCampaignId: ctx.marketingCampaignId ?? null,
        developmentId: ctx.ficha.developmentId,
        objetivo: ctx.objetivo,
        conceito: v.conceito,
        ctaDaMeta: ctaDaMeta(ctx.objetivo),
        procedencia: procedenciaDa(v, ctx),
        aprovacao: {
          estado: "rascunho",
          exigeRevisaoHumana: true,
          publicadoNaMeta: false,
          fluxo:
            "creative_intelligence_versions.review_status (diretoria, RPC review_creative_intelligence_version) antes de qualquer proposta na Caixa de Aprovações",
        },
      },
    },
    versao: {
      organization_id: ctx.ficha.organizationId,
      version_number: 1 as const,
      development_id: ctx.ficha.developmentId,
      funnel_stage: v.etapa,
      persona_moment: v.persona,
      message_angle: v.angulo,
      primary_promise: v.textoPrincipal.slice(0, 500),
      objection_addressed: v.objecao.slice(0, 500),
      format: FORMATO_PADRAO,
      hook: v.titulo.slice(0, 300),
      call_to_action: v.chamada.slice(0, 120),
      content_hash: hashDoConteudo(v, ctx),
      created_by: ctx.criadoPor,
    },
  }));

  return { pecas, recusadas, impedimentos };
}

/** A procedência gravada na peça: modelo, prompt, fatos do CRM e fontes web. */
export function procedenciaDa(v: VariacaoAvaliada, ctx: ContextoDeGravacao) {
  return {
    promptVersao: PROMPT_VERSAO,
    feature: FEATURE_GERACAO,
    provedor: ctx.geracao.provedor,
    modelo: ctx.geracao.modelo,
    tokensTotais: ctx.geracao.tokens,
    custoEstimadoUsd: ctx.geracao.custoUsd,
    geradoEm: ctx.geracao.geradoEm,
    // Quais fatos do CRM entraram — com a origem de cada um.
    fatosDoCRM: ctx.ficha.fatos.map((f) => ({
      chave: f.chave,
      valor: f.valor,
      unidade: f.unidade,
      origem: f.origem,
    })),
    // O que veio da web, se veio. Formato combinado com a frente de pesquisa.
    fontesWeb: ctx.ficha.fontesWeb.map((f) => ({
      url: f.url,
      publicador: f.publicador,
      publicadoEm: f.publicadoEm,
    })),
    conferencia: {
      numerosCitados: v.numerosCitados,
      divergencias: v.divergencias,
      violacoesDePolitica: v.violacoes,
      estoqueNoMomento: ctx.ficha.unidadesDisponiveis,
      faixaNoMomento: { precoMin: ctx.ficha.precoMin, precoMax: ctx.ficha.precoMax },
    },
    divergenciasDeCadastro: ctx.ficha.divergenciasDeCadastro,
  };
}

/** Chave de deduplicação: `UNIQUE (organization_id, content_hash)` no banco. */
export function hashDoConteudo(v: VariacaoGerada, ctx: ContextoDeGravacao): string {
  const canonico = JSON.stringify({
    developmentId: ctx.ficha.developmentId,
    objetivo: ctx.objetivo,
    angulo: v.angulo,
    persona: v.persona,
    etapa: v.etapa,
    titulo: v.titulo,
    textoPrincipal: v.textoPrincipal,
    descricao: v.descricao,
    chamada: v.chamada,
  });
  return createHash("sha256").update(canonico).digest("hex");
}

/**
 * O portão até a Meta. A peça só pode entrar numa proposta de publicação
 * (`approval_requests`) depois que a diretoria aprovou a VERSÃO — o fluxo que
 * `app/api/v1/marketing/creatives` já implementa pela RPC
 * `review_creative_intelligence_version`.
 */
export function podeIrParaMeta(reviewStatus: string | null | undefined): boolean {
  return String(reviewStatus ?? "") === "approved";
}

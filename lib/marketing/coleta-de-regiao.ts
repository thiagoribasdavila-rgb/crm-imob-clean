import "server-only";
import { generateAIText } from "@/lib/ai/provider-router";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { avaliarAcaoDeAgente } from "@/lib/ai/niveis-de-autonomia";
import {
  afirmacoesComFonte,
  perguntaDeRegiao,
  REVIEW_STATUS_DA_MAQUINA,
  SISTEMA_DA_PESQUISA_DE_REGIAO,
  type AfirmacaoDescartada,
  type EmpreendimentoDaPesquisa,
  type FonteCandidata,
} from "@/lib/marketing/pesquisa-de-regiao";

/**
 * COLETA FUNDAMENTADA DO ESTUDO DE REGIÃO — a ponta que fala com o mundo.
 *
 * Junta três peças que já existiam e nunca se encontraram:
 *
 *   · a rota de PESQUISA do roteador (`task: "research"`), que
 *     `lib/ai/commercial-orchestrator.ts` fixa em `["perplexity","local"]` com
 *     `costPolicy: "research_with_sources"` e razão `citations_required` — é a
 *     única rota do produto que devolve `citations`;
 *   · `lib/marketing/pesquisa-de-regiao.ts`, que decide o que daquela resposta
 *     tem procedência suficiente para virar linha;
 *   · a RPC `upsert_project_region_source` da Fase 69, que já grava sempre
 *     `pending` e já exige ator com papel de gestão.
 *
 * ── O que este módulo NÃO faz, de propósito ────────────────────────────────
 *
 * Não escreve `review_status`. Nem pode: a RPC insere `pending` por conta
 * própria e ignora qualquer tentativa de dizer outra coisa. Quem verifica é
 * gente, por `review_project_region_source`, que exige diretoria ou
 * superintendência e uma justificativa de no mínimo 10 caracteres.
 *
 * Não inventa desfecho. Se o provedor de pesquisa não atende, o roteador cai no
 * fallback determinístico (`provider: "local"`) — e aqui isso vira
 * `pesquisa_indisponivel` com a causa, e não uma coleta de zero fontes
 * desenhada como sucesso.
 */

/** O agente desta rotina, declarado em `config/orcamento-e-autonomia-da-ia.json`. */
export const AGENTE_DA_COLETA = "pesquisa-de-regiao";

/**
 * A feature — o prefixo antes do ponto É o agente, porque
 * `agenteDaFeature()` (lib/ai/limitador-de-ia.ts) corta na primeira parte. Sem
 * essa coincidência o teto POR AGENTE contaria esta rotina como "desconhecido".
 */
export const FEATURE_DA_COLETA = `${AGENTE_DA_COLETA}.coleta`;

export type StatusDaColeta =
  | "gravado"
  | "ensaio_seco"
  | "sem_recorte"
  | "autonomia_recusada"
  | "pesquisa_indisponivel"
  | "sem_fonte";

export type FonteGravada = { sourceId: string | null; title: string; category: string; erro: string | null };

export type ResultadoDaColeta = {
  status: StatusDaColeta;
  /** Sempre presente e sempre em voz alta: zero nunca aparece sem explicação. */
  motivo: string;
  development: { id: string; nome: string; bairros: string[]; cidade: string | null };
  pergunta: string | null;
  citacoes: string[];
  aceitas: FonteCandidata[];
  descartadas: AfirmacaoDescartada[];
  gravadas: FonteGravada[];
  reviewStatus: typeof REVIEW_STATUS_DA_MAQUINA;
  consumo: { provedor: string; modelo: string; tokens: number; custoEstimadoUsd: number | null } | null;
};

type EntradaDaColeta = {
  organizationId: string;
  developmentId: string;
  /** Perfil que disparou a coleta. A RPC exige gestor; a rota já confere antes. */
  actorId: string;
  /**
   * Ensaio a seco: pesquisa de verdade, análise de verdade, e NENHUMA escrita.
   * Serve para conferir procedência antes de deixar a coleta encostar no banco.
   */
  ensaioSeco?: boolean;
  hoje?: string;
  signal?: AbortSignal;
};

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function coletarFontesDeRegiao(entrada: EntradaDaColeta): Promise<ResultadoDaColeta> {
  const hoje = entrada.hoje || hojeIso();
  const admin = getSupabaseAdmin();

  const { data: dev, error: erroDev } = await admin
    .from("developments")
    .select("id,name,neighborhood,city,state")
    .eq("id", entrada.developmentId)
    .eq("organization_id", entrada.organizationId)
    .maybeSingle();
  // O erro da consulta não é descartado na desestruturação: banco fora do ar e
  // empreendimento inexistente responderiam a mesma coisa, e "não achei" é uma
  // afirmação forte demais para se fazer sem ter conseguido perguntar.
  if (erroDev) throw new Error(`Não foi possível ler o empreendimento: ${erroDev.message}`);
  if (!dev) throw new Error("Empreendimento não encontrado neste escopo.");

  const empreendimento: EmpreendimentoDaPesquisa = {
    id: String(dev.id),
    nome: String(dev.name ?? ""),
    bairro: (dev.neighborhood as string | null) ?? null,
    cidade: (dev.city as string | null) ?? null,
    estado: (dev.state as string | null) ?? null,
  };
  const recorte = perguntaDeRegiao(empreendimento);
  const base = {
    development: { id: empreendimento.id, nome: empreendimento.nome, bairros: recorte.bairros, cidade: recorte.cidade },
    pergunta: recorte.pergunta,
    reviewStatus: REVIEW_STATUS_DA_MAQUINA,
  } as const;

  if (!recorte.pergunta) {
    return {
      ...base,
      status: "sem_recorte",
      motivo: `A pergunta de pesquisa nasce do cadastro, não de texto livre. ${recorte.problemas.join(" ")}`,
      citacoes: [],
      aceitas: [],
      descartadas: [],
      gravadas: [],
      consumo: null,
    };
  }

  const resposta = await generateAIText({
    task: "research",
    feature: FEATURE_DA_COLETA,
    organizationId: entrada.organizationId,
    userId: entrada.actorId,
    containsPersonalData: false,
    system: SISTEMA_DA_PESQUISA_DE_REGIAO,
    prompt: recorte.pergunta,
    timeoutMs: 60_000,
    signal: entrada.signal,
  });

  const consumo = {
    provedor: resposta.provider,
    modelo: resposta.model,
    tokens: resposta.usage.totalTokens,
    custoEstimadoUsd: resposta.cost?.estimatedUsd ?? null,
  };

  // Fallback determinístico não é pesquisa. Ele responde com um aviso em prosa,
  // sem citação nenhuma — tratá-lo como resposta produziria "0 fontes" como se
  // a região não tivesse nada publicado.
  if (resposta.provider === "local") {
    const causas = (resposta.falhas ?? []).map((falha) => `${falha.classe}: ${falha.mensagem} (resolve: ${falha.quemResolve})`);
    return {
      ...base,
      status: "pesquisa_indisponivel",
      motivo: `O provedor de pesquisa não atendeu, então NADA foi coletado — isto não é "a região não tem fontes". ${causas.length ? causas.join(" · ") : "Nenhum provedor externo estava na ordem do tier de pesquisa."}`,
      citacoes: [],
      aceitas: [],
      descartadas: [],
      gravadas: [],
      consumo,
    };
  }

  const analise = afirmacoesComFonte({ texto: resposta.text, citacoes: resposta.citations ?? [], hoje });

  if (!analise.aceitas.length) {
    return {
      ...base,
      status: "sem_fonte",
      motivo: `Nenhuma afirmação sobreviveu à conferência de procedência: ${analise.descartadas.length} descartada(s). Nada foi gravado.`,
      citacoes: analise.citacoes,
      aceitas: [],
      descartadas: analise.descartadas,
      gravadas: [],
      consumo,
    };
  }

  if (entrada.ensaioSeco) {
    return {
      ...base,
      status: "ensaio_seco",
      motivo: `ENSAIO A SECO: ${analise.aceitas.length} fonte(s) passaram na conferência e NENHUMA foi gravada. Repita sem ensaioSeco para enviar à revisão humana.`,
      citacoes: analise.citacoes,
      aceitas: analise.aceitas,
      descartadas: analise.descartadas,
      gravadas: [],
      consumo,
    };
  }

  // Gravar é escrita interna reversível (a fonte nasce pendente e pode ser
  // rejeitada). O catálogo de níveis é quem autoriza — e um agente que ninguém
  // declarou nasce no nível 0, então esta trava recusa a escrita em vez de
  // deixar uma rotina não revisada gravar no banco.
  const veredicto = avaliarAcaoDeAgente({ agente: AGENTE_DA_COLETA, acao: "gravar_interno_reversivel" });
  if (!veredicto.permitido) {
    return {
      ...base,
      status: "autonomia_recusada",
      motivo: `A gravação foi recusada pelo catálogo de níveis de autonomia. ${veredicto.motivo}`,
      citacoes: analise.citacoes,
      aceitas: analise.aceitas,
      descartadas: analise.descartadas,
      gravadas: [],
      consumo,
    };
  }

  const gravadas: FonteGravada[] = [];
  for (const candidata of analise.aceitas) {
    const { data, error } = await admin.rpc("upsert_project_region_source", {
      p_actor_id: entrada.actorId,
      p_organization_id: entrada.organizationId,
      p_development_id: entrada.developmentId,
      p_source_id: null,
      p_payload: candidata.payload,
    });
    if (error) {
      logger.warn("pesquisa_de_regiao.fonte_recusada", {
        developmentId: entrada.developmentId,
        category: candidata.payload.category,
        publisher: candidata.payload.publisher,
        reason: error.message,
      });
      gravadas.push({ sourceId: null, title: candidata.payload.title, category: candidata.payload.category, erro: error.message });
      continue;
    }
    const retorno = (data ?? {}) as { sourceId?: string };
    gravadas.push({ sourceId: retorno.sourceId ?? null, title: candidata.payload.title, category: candidata.payload.category, erro: null });
  }

  const salvas = gravadas.filter((item) => item.erro === null).length;
  return {
    ...base,
    status: "gravado",
    motivo: `${salvas} de ${analise.aceitas.length} fonte(s) gravadas como "${REVIEW_STATUS_DA_MAQUINA}" — nenhuma alimenta anúncio ou dossiê antes de uma pessoa verificar em Estudo regional.`,
    citacoes: analise.citacoes,
    aceitas: analise.aceitas,
    descartadas: analise.descartadas,
    gravadas,
    consumo,
  };
}

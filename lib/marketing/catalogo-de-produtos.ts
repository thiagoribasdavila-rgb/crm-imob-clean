/**
 * CATÁLOGO DE PRODUTOS DO RELATÓRIO DE CUSTO — de quem é esta linha de gasto/lead.
 *
 * ── AS DUAS GAVETAS ────────────────────────────────────────────────────────
 *
 * "A qual empreendimento (e a qual incorporadora) esta linha pertence?" tem
 * DUAS gavetas neste produto, e o relatório de custo lia uma TERCEIRA que nem
 * existe:
 *
 *   (a) `leads.development_id` → `developments.id`
 *       Gravada pela ingestão da Meta na MESMA transação que grava
 *       `leads.campaign_id` (app/api/v2/outbox/process, após cruzar a ponte
 *       `crm_projects.development_id`). É onde o produto ESCREVE hoje, e por
 *       isso é a CANÔNICA. Medido em 02/08/2026: 198 das 490 leads.
 *
 *   (b) `marketing_campaigns.project_id` → `crm_projects.id`
 *       → `crm_projects.development_id` → `developments.id`
 *       O cadastro da campanha. Existe, é a ponte documentada em
 *       relatorio-incorporador e developers/[id]/weekly-report — mas NENHUM
 *       escritor do repositório a preenche. Medido em 02/08/2026: 0 de 8
 *       campanhas. Vale quando estiver preenchida; nunca é inventada.
 *
 *   (c) `marketing_campaigns.development_id` — NÃO EXISTE. Era o que o
 *       relatório de custo pedia. PostgREST devolve 42703 e o chamador caía
 *       num fallback sem colunas, em silêncio: a corrente inteira morria no
 *       primeiro elo e o bloco que nomeia a incorporadora nunca era alcançado.
 *
 * Este módulo é a fonte ÚNICA da resolução para os dois caminhos da rota (banco
 * e Meta ao vivo) — dois caminhos com regras próprias é como a divergência
 * nasce de novo.
 *
 * ── NOME DA INCORPORADORA ──────────────────────────────────────────────────
 *
 * `public.developers` não tem coluna `name`: tem `trade_name` (fantasia) e
 * `legal_name` (razão social). Relatório comercial fala o fantasia ("Kallas"),
 * com recuo para a razão social ("Kallas Incorporações").
 *
 * ── SILÊNCIO ───────────────────────────────────────────────────────────────
 *
 * Nenhuma leitura daqui engole erro: toda falha entra em `falhas[]` e derruba
 * `resolvido`. Quem chama decide o que fazer (logar, publicar "não sei"), mas
 * não tem como NÃO SABER que falhou — que era exatamente o buraco anterior.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
// Import RELATIVO com extensão: `@/` é inalcançável para `node --test`, e a
// paginação exaustiva precisa ser a MESMA regra do resto do repositório —
// reescrever o laço aqui seria criar a terceira versão da mesma verdade.
import { fetchAllRowsPure } from "../supabase/paginacao-exaustiva.ts";

export const COLUNAS_DE_EMPREENDIMENTO = "id,name,developer_id";
export const COLUNAS_DE_INCORPORADORA = "id,trade_name,legal_name";
export const COLUNAS_DA_PONTE_DE_PROJETO = "id,development_id";

export type LinhaDeEmpreendimento = { id: string; name: string | null; developer_id: string | null };
export type LinhaDeIncorporadora = { id: string; trade_name: string | null; legal_name: string | null };
export type LinhaDaPonteDeProjeto = { id: string; development_id: string | null };

export type EtapaDoCatalogo = "empreendimentos" | "incorporadoras" | "ponte_de_projetos";
export type FalhaDeLeitura = { etapa: EtapaDoCatalogo; code?: string; message?: string; truncado?: boolean };

export type CatalogoDeProdutos = {
  /** developments.id → nome do empreendimento + id da incorporadora. */
  empreendimentos: Map<string, { nome: string | null; incorporadoraId: string | null }>;
  /** developers.id → nome fantasia (recuo: razão social). */
  incorporadoras: Map<string, string>;
  /** crm_projects.id → developments.id (a ponte entre os dois cadastros). */
  ponteDeProjetos: Map<string, string>;
  falhas: FalhaDeLeitura[];
  /** Sei nomear empreendimento e incorporadora? false = "não sei", nunca "não tem". */
  resolvido: boolean;
  /** Sei traduzir o projeto declarado na campanha? */
  ponteResolvida: boolean;
};

/** Fantasia primeiro, razão social como recuo. Vazio é ausência, não nome. */
export function nomeDeIncorporadora(linha: LinhaDeIncorporadora): string | null {
  return linha.trade_name?.trim() || linha.legal_name?.trim() || null;
}

export function montarCatalogo(entrada: {
  empreendimentos?: LinhaDeEmpreendimento[];
  incorporadoras?: LinhaDeIncorporadora[];
  projetos?: LinhaDaPonteDeProjeto[];
  falhas?: FalhaDeLeitura[];
}): CatalogoDeProdutos {
  const falhas = entrada.falhas ?? [];
  const empreendimentos = new Map<string, { nome: string | null; incorporadoraId: string | null }>();
  for (const linha of entrada.empreendimentos ?? []) {
    if (!linha?.id) continue;
    empreendimentos.set(linha.id, { nome: linha.name ?? null, incorporadoraId: linha.developer_id ?? null });
  }
  const incorporadoras = new Map<string, string>();
  for (const linha of entrada.incorporadoras ?? []) {
    const nome = nomeDeIncorporadora(linha);
    if (linha?.id && nome) incorporadoras.set(linha.id, nome);
  }
  const ponteDeProjetos = new Map<string, string>();
  for (const linha of entrada.projetos ?? []) {
    if (linha?.id && linha.development_id) ponteDeProjetos.set(linha.id, linha.development_id);
  }
  return {
    empreendimentos,
    incorporadoras,
    ponteDeProjetos,
    falhas,
    resolvido: !falhas.some((f) => f.etapa === "empreendimentos" || f.etapa === "incorporadoras"),
    ponteResolvida: !falhas.some((f) => f.etapa === "ponte_de_projetos"),
  };
}

/**
 * De onde veio a resposta. Publicar a ORIGEM é o que impede a próxima geração
 * de confundir "não tem incorporadora" com "não consegui descobrir".
 */
export type OrigemDoProduto =
  | "lead"                          // gaveta canônica: a lead disse, na própria transação
  | "campanha"                      // cadastro da campanha (project_id) via ponte
  | "sem_vinculo"                   // nem a lead nem a campanha declararam
  | "empreendimento_fora_do_catalogo"; // id declarado que o catálogo não conhece

export type ProdutoResolvido = { product: string | null; developer: string | null; origem: OrigemDoProduto };

/**
 * Resolve produto/incorporadora de UMA linha.
 *
 * Precedência: o que a LEAD gravou vence o cadastro da campanha — é o dado
 * escrito na transação, e uma campanha pode servir mais de um empreendimento
 * (medido: a campanha 120251113236400624 tem leads de 3 empreendimentos).
 */
export function resolverProduto(
  catalogo: CatalogoDeProdutos,
  entrada: { developmentId?: string | null; projectId?: string | null },
): ProdutoResolvido {
  const daLead = entrada.developmentId?.trim() || null;
  const daCampanha = !daLead && entrada.projectId ? catalogo.ponteDeProjetos.get(entrada.projectId) ?? null : null;
  const id = daLead ?? daCampanha;
  if (!id) return { product: null, developer: null, origem: "sem_vinculo" };
  const empreendimento = catalogo.empreendimentos.get(id);
  if (!empreendimento) return { product: null, developer: null, origem: "empreendimento_fora_do_catalogo" };
  const developer = empreendimento.incorporadoraId
    ? catalogo.incorporadoras.get(empreendimento.incorporadoraId) ?? null
    : null;
  return { product: empreendimento.nome, developer, origem: daLead ? "lead" : "campanha" };
}

/** Frase publicada na resposta — a tela precisa poder dizer de onde veio o rótulo. */
export const BASE_DO_ROTULO =
  "empreendimento = `leads.development_id` (gravado na MESMA transação que `leads.campaign_id`) e, sem lead, " +
  "`marketing_campaigns.project_id` → `crm_projects.development_id` → `developments`. " +
  "incorporadora = `developers.trade_name` (fantasia) com recuo para `legal_name` (razão social). " +
  "resolved=false → a leitura falhou; rótulo nulo é 'não sei', não 'sem incorporadora'.";

/**
 * Lê o catálogo da organização: empreendimentos, as incorporadoras deles e a
 * ponte de projetos. Não lança — devolve as falhas para o chamador logar.
 */
export async function carregarCatalogoDeProdutos(
  cliente: SupabaseClient,
  organizationId: string,
): Promise<CatalogoDeProdutos> {
  const falhas: FalhaDeLeitura[] = [];

  const [empreendimentos, projetos] = await Promise.all([
    fetchAllRowsPure<LinhaDeEmpreendimento>((de, ate) => cliente
      .from("developments")
      .select(COLUNAS_DE_EMPREENDIMENTO)
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .range(de, ate)),
    fetchAllRowsPure<LinhaDaPonteDeProjeto>((de, ate) => cliente
      .from("crm_projects")
      .select(COLUNAS_DA_PONTE_DE_PROJETO)
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .range(de, ate)),
  ]);
  if (empreendimentos.error || empreendimentos.truncated) {
    falhas.push({ etapa: "empreendimentos", ...empreendimentos.error, truncado: empreendimentos.truncated });
  }
  if (projetos.error || projetos.truncated) {
    falhas.push({ etapa: "ponte_de_projetos", ...projetos.error, truncado: projetos.truncated });
  }

  const idsDeIncorporadora = [...new Set(empreendimentos.rows.map((d) => d.developer_id).filter(Boolean))] as string[];
  let incorporadoras: LinhaDeIncorporadora[] = [];
  if (idsDeIncorporadora.length) {
    const leitura = await cliente
      .from("developers")
      .select(COLUNAS_DE_INCORPORADORA)
      .in("id", idsDeIncorporadora)
      .eq("organization_id", organizationId);
    if (leitura.error) {
      falhas.push({ etapa: "incorporadoras", code: leitura.error.code, message: leitura.error.message });
    }
    incorporadoras = (leitura.data ?? []) as LinhaDeIncorporadora[];
  }

  return montarCatalogo({
    empreendimentos: empreendimentos.rows,
    incorporadoras,
    projetos: projetos.rows,
    falhas,
  });
}

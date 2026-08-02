import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

/**
 * ── A TABELA `activities` NUNCA TEVE `title` ──────────────────────────────
 *
 * Colunas REAIS, conferidas em produção (pozbrcsfthnhmnebfoxv) em 2026-08-02
 * via information_schema.columns:
 *
 *   id, lead_id, type, description, created_at, organization_id,
 *   user_id, metadata, occurred_at
 *
 * Sete escritas do app mandavam `title` e SETE morriam caladas: o PostgREST
 * devolve 42703 ("column \"title\" does not exist"), o chamador descartava o
 * erro (`Promise.allSettled`, ou `await` sem olhar o retorno) e a operação
 * seguia como se tivesse gravado. Duas leituras pediam `title` no `select` e
 * caíam na mesma armadilha pelo outro lado: `data ?? []` transforma a consulta
 * que falhou em lista vazia, e a timeline desenhava "Lead criado no CRM" e mais
 * nada — para 444 das 490 leads que TÊM movimentação gravada.
 *
 * Ausência de evidência virando ausência de dado. Sem erro, sem log, sem pista.
 *
 * ── ONDE A MANCHETE PASSA A MORAR ────────────────────────────────────────
 *
 * NÃO inventamos coluna nem migration. A manchete vai para `metadata.title`,
 * que é exatamente a convenção que o próprio repositório já usa para tabela sem
 * coluna de título — veja `mapLiveLeadEvent` em `lib/compat/live-writes.ts:74`,
 * que lê `metadata.title` antes de cair no tipo do evento.
 *
 * `description` continua sendo a frase humana, igual ao que a RPC
 * `move_pipeline_lead` grava nas 481 linhas que já existem ("Etapa alterada:
 * novo → perdido"). Quem escrevia só `title` e não `description` passa a ter a
 * manchete também em `description` — melhor repetir do que perder.
 *
 * ── POR QUE UM HELPER, E NÃO SETE CORREÇÕES SOLTAS ───────────────────────
 *
 * Sete cópias da mesma forma foi o que permitiu a divergência passar sem
 * ninguém notar. Com um ponto só, a próxima migração que mexer em `activities`
 * quebra UM lugar — e quebra alto, porque `registrarAtividade` confere o
 * retorno e loga em `error`.
 */

/** Cliente Supabase (admin ou de sessão) — só precisamos de `.from`. */
type ClienteDeAtividade = Pick<SupabaseClient, "from">;

export type EntradaDeAtividade = {
  organizationId: string;
  leadId: string;
  userId?: string | null;
  /** valor de `activities.type` — chave de máquina, não texto de tela */
  type: string;
  /** manchete de tela; gravada em `metadata.title` (a coluna não existe) */
  titulo: string;
  /** frase humana; sem ela, a manchete é reaproveitada */
  description?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
};

export type ResultadoDaAtividade =
  | { ok: true }
  | { ok: false; code?: string; message: string };

/** Monta a linha com as colunas que a tabela REALMENTE tem. */
export function linhaDeAtividade(entrada: EntradaDeAtividade): Record<string, unknown> {
  const titulo = entrada.titulo.trim();
  const metadata: Record<string, unknown> = { ...(entrada.metadata ?? {}) };
  if (titulo) metadata.title = titulo;
  return {
    organization_id: entrada.organizationId,
    lead_id: entrada.leadId,
    user_id: entrada.userId ?? null,
    type: entrada.type,
    description: entrada.description ?? (titulo || null),
    metadata,
    occurred_at: entrada.occurredAt ?? new Date().toISOString(),
  };
}

/**
 * Grava e CONFERE. Nunca lança: o chamador decide se a falha da trilha derruba
 * a operação principal (quase nunca deve — a venda já aconteceu), mas a falha
 * passa obrigatoriamente pelo log de erro antes de o chamador poder ignorá-la.
 */
export async function registrarAtividade(
  db: ClienteDeAtividade,
  entrada: EntradaDeAtividade,
): Promise<ResultadoDaAtividade> {
  const { error } = await db.from("activities").insert(linhaDeAtividade(entrada));
  if (!error) return { ok: true };
  logger.error("activities.escrita_nao_confirmada", error, {
    organizationId: entrada.organizationId,
    leadId: entrada.leadId,
    type: entrada.type,
    code: error.code,
  });
  return { ok: false, code: error.code, message: error.message };
}

/** Colunas que EXISTEM — use este select em vez de listar na mão. */
export const SELECT_DE_ATIVIDADE = "id,user_id,description,type,metadata,occurred_at";

const rotulosPorTipo: Record<string, string> = {
  pipeline_stage_changed: "Etapa do funil alterada",
  ai_qualification: "Qualificação recalibrada pela IA",
  commercial_simulation: "Simulação comercial criada",
  commercial_proposal_decision: "Decisão sobre proposta comercial",
  whatsapp_insight: "IA leu a conversa no WhatsApp",
  experience_alert: "IA detectou atrito no atendimento",
  visit: "Visita realizada",
  system: "Registro do sistema",
};

/**
 * Manchete de uma linha de `activities`.
 *
 * Prioridade: `metadata.title` (o que as escritas novas gravam) → rótulo do
 * tipo → o tipo humanizado. As 481 linhas que a RPC já gravou não têm
 * `metadata.title`, e é por isso que o rótulo por tipo existe: elas precisam
 * aparecer na timeline como "Etapa do funil alterada", não como o genérico
 * "Atividade registrada" que não diz nada a ninguém.
 */
export function tituloDaAtividade(row: { type?: unknown; metadata?: unknown }): string {
  const metadata =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {};
  const titulo = typeof metadata.title === "string" ? metadata.title.trim() : "";
  if (titulo) return titulo;
  const tipo = String(row.type ?? "").trim();
  if (!tipo) return "Atividade registrada";
  return rotulosPorTipo[tipo] ?? tipo.replaceAll("_", " ");
}

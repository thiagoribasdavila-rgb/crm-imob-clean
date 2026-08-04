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

/**
 * ── A MANCHETE MUDOU DE CASA, E NÃO DE DONO ────────────────────────────────
 *
 * `tituloDaAtividade` vale para as DUAS gavetas de histórico (`activities` e
 * `lead_events`): as duas guardam a manchete em `metadata.title` e as duas caem
 * no rótulo por tipo quando ela falta. Vocabulário duplicado em dois arquivos é
 * como as duas gavetas começaram a divergir — então ele passou a morar em
 * `historico-do-lead.ts`, que é PURO e por isso alcançável por contrato (este
 * arquivo usa `@/` e some do `node --test`).
 *
 * O reexport mantém `registro-de-atividade` como o ponto único de quem já a
 * importava: nada muda para quem chama.
 */
export { tituloDaAtividade } from "./historico-do-lead.ts";

// Import RELATIVO com extensão `.ts` (quando houver), nunca o atalho `@/`: os
// contratos rodam em `node --test`, que não conhece os `paths` do tsconfig. Um
// módulo puro que usa `@/` fica inalcançável por teste. Por isso este arquivo
// só importa TIPO do supabase-js — `import type` some na compilação e o módulo
// continua importável por contrato.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ── O HISTÓRICO DE UMA LEAD MORA EM TRÊS GAVETAS, E CADA LEITOR ABRIA UMA ───
 *
 * Medido no banco vivo (pozbrcsfthnhmnebfoxv) em 2026-08-02:
 *
 *   pipeline_stage_moves ..... 478 linhas · 444 leads   (movimentação de funil)
 *   activities ............... 481 linhas · 444 leads   (TODAS com metadata.moveId)
 *   lead_events .............. 109 linhas ·  42 leads   (39 call + 16 whatsapp + notas)
 *
 *   leads com activities e NENHUM lead_event ......... 415
 *   leads com lead_events e NENHUMA activity .........  13
 *
 * E os leitores discordavam:
 *
 *   GET /api/v1/leads/[id] ....... lia SÓ lead_events  → "Ainda não há interação
 *                                  registrada com este cliente" em 415 fichas
 *   POST .../qualify ............. contava SÓ activities → 55 contatos reais
 *                                  (39 call + 16 whatsapp) fora do engajamento
 *
 * O valor não ficava errado: ficava AUSENTE. E ausência se parece com "o cliente
 * não respondeu".
 *
 * ── QUAL É A CANÔNICA, PELO CRITÉRIO DA TRANSAÇÃO ───────────────────────────
 *
 * A RPC `move_pipeline_lead` (supabase/migrations/20260727050000) escreve, na
 * MESMA transação que muda `leads.status`:
 *
 *   1. uma linha em `pipeline_stage_moves`, guardando o id em `move_id`;
 *   2. uma linha em `activities` com `metadata.moveId = move_id`.
 *
 * A segunda APONTA para a primeira. Isso não é interpretação: está escrito no
 * `jsonb_build_object('moveId', move_id, …)` da migration. `activities` é o
 * ESPELHO; `pipeline_stage_moves` é o fato. Conferido: das 481 linhas de
 * `activities`, 481 têm `metadata.moveId` e 478 acham a linha canônica.
 *
 * Então:
 *   · MOVIMENTAÇÃO → `pipeline_stage_moves` (canônica, e é o que a linha do
 *     tempo da ficha já desenha).
 *   · INTERAÇÃO → `lead_events` (é onde o CRM grava contato hoje: a rota de
 *     primeiro contato escreve ali) MAIS as linhas de `activities` que NÃO são
 *     espelho (`registrarAtividade` passou a gravar ali hoje: `ai_qualification`,
 *     `whatsapp_insight`). Hoje são 0 linhas — e é exatamente por isso que
 *     precisam entrar agora: a próxima qualificação de IA cairia numa gaveta que
 *     ninguém abre, e ninguém notaria, de novo.
 *
 * ── POR QUE O ESPELHO É EXCLUÍDO DA LISTA DE INTERAÇÕES ─────────────────────
 *
 * `components/crm/acompanhamento-corretor-linha-do-tempo.tsx` já desenha as duas
 * metades: as interações que a ficha devolve E a movimentação lida de
 * `pipeline_stage_moves`. Jogar o espelho na lista de interações faria CADA
 * mudança de etapa aparecer DUAS vezes na mesma tela, e o contador "N interações"
 * passaria a contar movimentação. Trocar "falta metade" por "conta duas vezes"
 * não é conserto.
 *
 * O corte é por `metadata.moveId`, não por `type`: é o ponteiro para a linha
 * canônica, escrito pela própria transação. Filtro por nome de tipo erra assim
 * que alguém inventar um tipo novo de movimentação — o ponteiro, não.
 *
 * ── AUSÊNCIA NÃO É ZERO ─────────────────────────────────────────────────────
 *
 * Cada gaveta devolve o próprio `mensuravel`. Leitura que FALHOU nunca vira
 * lista vazia sem aviso: quem chama decide entre degradar com log ou recusar,
 * mas não pode confundir "não deu para ler" com "não aconteceu".
 */

/** Só precisamos de `.from`; serve para o cliente admin e para o de sessão. */
type ClienteDeLeitura = Pick<SupabaseClient, "from">;

/**
 * Colunas REAIS de `activities` — a tabela nunca teve `title`.
 * Espelha `SELECT_DE_ATIVIDADE` de `lib/crm/registro-de-atividade.ts`; o
 * contrato `activities-sem-title` prova que as duas strings continuam iguais
 * (não dá para importar de lá: aquele módulo usa `@/` e some do `node --test`).
 */
export const SELECT_DE_ATIVIDADE_NO_HISTORICO = "id,user_id,description,type,metadata,occurred_at";

/** Colunas REAIS de `lead_events`, as mesmas que `recordLiveLeadEvent` devolve. */
export const SELECT_DE_EVENTO_DE_LEAD = "id,event_type,type,description,metadata,created_by,created_at";

/**
 * Colunas REAIS de `pipeline_stage_moves`. Conferidas em produção: a tabela NÃO
 * tem `created_at` — ordenar por ela faz o PostgREST errar e a rota degradar em
 * silêncio.
 */
export const SELECT_DE_MOVIMENTO_DO_LEDGER =
  "id,from_stage,to_stage,reason,discard_reason_key,discard_notes,reversal_of,actor_id,occurred_at";

/** O ponteiro que marca a linha de `activities` como espelho do ledger. */
export const CHAVE_DO_ESPELHO = "moveId";

/** O que a ficha declara como origem do histórico. */
export const FONTES_DO_HISTORICO = "lead_events+activities+pipeline_stage_moves";

export type FonteDoHistorico = "lead_events" | "activities";

export type ItemDoHistorico = {
  id: string;
  /** De qual gaveta esta linha veio — some da tela, aparece no diagnóstico. */
  fonte: FonteDoHistorico;
  user_id: string | null;
  title: string;
  description: string | null;
  type: string;
  metadata: Record<string, unknown>;
  occurred_at: string | null;
};

export type MovimentoDoHistorico = {
  id: string;
  quando: string | null;
  de: string | null;
  para: string | null;
  /** A frase que a própria RPC grava no espelho: "Etapa alterada: novo → perdido". */
  frase: string;
};

export type FatoDoHistorico = { quando: string | null; resumo: string };

export type HistoricoDaLead = {
  /** Contato, nota, qualificação — NUNCA o espelho da movimentação. */
  interacoes: ItemDoHistorico[];
  /** Quantas interações existem no banco (não quantas coube no `limite`). */
  interacoesTotal: number;
  /** Movimentação de funil, da fonte canônica. */
  movimentos: MovimentoDoHistorico[];
  movimentosTotal: number;
  /** Interações + movimentação. É este número que responde "há história?". */
  total: number;
  /** O fato mais recente de qualquer natureza, com a frase que o descreve. */
  ultimoFato: FatoDoHistorico | null;
  /** `false` = a leitura falhou. Total menor NÃO significa menos história. */
  mensuravel: { eventos: boolean; atividades: boolean; movimentos: boolean };
  /** Códigos de erro por gaveta, para o chamador logar sem adivinhar. */
  falhas: Array<{ fonte: string; code: string | null; message: string }>;
};

const rotulosPorTipo: Record<string, string> = {
  pipeline_stage_changed: "Etapa do funil alterada",
  pipeline_stage_reverted: "Movimentação desfeita",
  pipeline_move_reverted: "Movimentação desfeita",
  ai_qualification: "Qualificação recalibrada pela IA",
  commercial_simulation: "Simulação comercial criada",
  commercial_proposal_decision: "Decisão sobre proposta comercial",
  whatsapp_insight: "IA leu a conversa no WhatsApp",
  experience_alert: "IA detectou atrito no atendimento",
  visit: "Visita realizada",
  system: "Registro do sistema",
  // As 10 linhas de `lead_events` sem `metadata.title` medidas em 02/08/2026 são
  // todas `lead_assigned`/`distribution`: sem rótulo elas apareciam na ficha como
  // a chave crua "lead_assigned".
  lead_assigned: "Lead distribuída",
  distribution: "Lead distribuída",
  lead_created: "Lead criada no CRM",
  lead_updated: "Dados do lead atualizados",
  call: "Ligação registrada",
  whatsapp: "WhatsApp registrado",
  email: "E-mail registrado",
  note: "Anotação do corretor",
};

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string | null {
  const limpo = typeof valor === "string" ? valor.trim() : "";
  return limpo || null;
}

/**
 * Manchete de uma linha de histórico, das DUAS gavetas.
 *
 * Prioridade: `metadata.title` (o que as escritas gravam desde que se descobriu
 * que `activities.title` nunca existiu) → rótulo do tipo → o tipo humanizado.
 */
export function tituloDaAtividade(row: { type?: unknown; metadata?: unknown }): string {
  const titulo = texto(objeto(row.metadata).title);
  if (titulo) return titulo;
  const tipo = String(row.type ?? "").trim();
  if (!tipo) return "Atividade registrada";
  return rotulosPorTipo[tipo] ?? tipo.replaceAll("_", " ");
}

/**
 * Esta linha de `activities` é o espelho de uma linha do ledger?
 *
 * O critério é o ponteiro gravado pela transação, não o nome do tipo.
 */
export function ehEspelhoDoLedger(row: { metadata?: unknown }): boolean {
  return Boolean(texto(objeto(row.metadata)[CHAVE_DO_ESPELHO]));
}

export function normalizarAtividade(row: Record<string, unknown>): ItemDoHistorico {
  const metadata = objeto(row.metadata);
  return {
    id: String(row.id ?? ""),
    fonte: "activities",
    user_id: row.user_id == null ? null : String(row.user_id),
    title: tituloDaAtividade(row),
    description: texto(row.description),
    type: String(row.type ?? "note"),
    metadata,
    occurred_at: typeof row.occurred_at === "string" ? row.occurred_at : null,
  };
}

export function normalizarEventoDeLead(row: Record<string, unknown>): ItemDoHistorico {
  const metadata = objeto(row.metadata);
  // `event_type` é a coluna que o CRM preenche sempre; `type` é a irmã legada.
  const tipo = String(row.event_type ?? row.type ?? "note");
  return {
    id: String(row.id ?? ""),
    fonte: "lead_events",
    user_id: row.created_by == null ? null : String(row.created_by),
    title: tituloDaAtividade({ type: tipo, metadata }),
    description: texto(row.description),
    type: tipo,
    metadata,
    occurred_at: typeof row.created_at === "string" ? row.created_at : null,
  };
}

/**
 * A frase da movimentação, no mesmo formato que a RPC grava no espelho — para a
 * ficha dizer "Etapa alterada: novo → perdido" em vez de "não há interação".
 */
export function fraseDoMovimento(row: {
  from_stage?: unknown;
  to_stage?: unknown;
  reason?: unknown;
  discard_notes?: unknown;
}): string {
  const de = texto(row.from_stage) ?? "etapa não registrada";
  const para = texto(row.to_stage) ?? "etapa não registrada";
  const motivo = texto(row.reason) ?? texto(row.discard_notes);
  return motivo ? `Etapa alterada: ${de} → ${para} · ${motivo}` : `Etapa alterada: ${de} → ${para}`;
}

export function normalizarMovimento(row: Record<string, unknown>): MovimentoDoHistorico {
  return {
    id: String(row.id ?? ""),
    quando: typeof row.occurred_at === "string" ? row.occurred_at : null,
    de: texto(row.from_stage),
    para: texto(row.to_stage),
    frase: fraseDoMovimento(row),
  };
}

function instante(valor: string | null): number {
  if (!valor) return 0;
  const tempo = new Date(valor).getTime();
  return Number.isFinite(tempo) ? tempo : 0;
}

/**
 * A UNIÃO. Puro de propósito: é a regra que os dois leitores precisam
 * compartilhar, e regra que não dá para exercitar sem banco não é guardada por
 * ninguém.
 *
 * `activities` entra SEM os espelhos do ledger — a movimentação vem inteira da
 * fonte canônica, e contá-la duas vezes é o defeito oposto ao que se conserta.
 */
export function unirInteracoes(
  atividades: Array<Record<string, unknown>>,
  eventos: Array<Record<string, unknown>>,
  limite = 100,
): ItemDoHistorico[] {
  const daTrilha = (atividades ?? []).filter((row) => !ehEspelhoDoLedger(row)).map(normalizarAtividade);
  const daLinhaDoTempo = (eventos ?? []).map(normalizarEventoDeLead);
  return [...daTrilha, ...daLinhaDoTempo]
    .sort((a, b) => instante(b.occurred_at) - instante(a.occurred_at))
    .slice(0, Math.max(0, limite));
}

/** O fato mais recente entre interações e movimentação. */
export function ultimoFatoDoHistorico(
  interacoes: ItemDoHistorico[],
  movimentos: MovimentoDoHistorico[],
): FatoDoHistorico | null {
  const primeiraInteracao = interacoes[0] ?? null;
  const primeiroMovimento = movimentos[0] ?? null;
  if (!primeiraInteracao && !primeiroMovimento) return null;
  const interacaoVence =
    primeiraInteracao != null
    && (!primeiroMovimento || instante(primeiraInteracao.occurred_at) >= instante(primeiroMovimento.quando));
  if (interacaoVence && primeiraInteracao) {
    return {
      quando: primeiraInteracao.occurred_at,
      resumo: primeiraInteracao.description || primeiraInteracao.title,
    };
  }
  return primeiroMovimento ? { quando: primeiroMovimento.quando, resumo: primeiroMovimento.frase } : null;
}

type Leitura = { data: unknown; error: { code?: string | null; message: string } | null; count: number | null };

function linhas(leitura: Leitura): Array<Record<string, unknown>> {
  return Array.isArray(leitura.data) ? (leitura.data as Array<Record<string, unknown>>) : [];
}

/**
 * A ÚNICA leitura de histórico de lead do produto.
 *
 * Três gavetas, uma resposta. Quem precisar de histórico chama daqui — foi
 * exatamente a leitura escrita à mão em cada rota que deixou a ficha e a
 * pontuação discordarem sobre a mesma lead.
 */
export async function lerHistoricoDoLead(
  db: ClienteDeLeitura,
  { organizationId, leadId, limite = 100 }: { organizationId: string; leadId: string; limite?: number },
): Promise<HistoricoDaLead> {
  const daTabelaDeAtividade = (comCorteNoBanco: boolean) => {
    const consulta = db.from("activities").select(SELECT_DE_ATIVIDADE_NO_HISTORICO, { count: "exact" });
    // O corte do espelho vai para o BANCO: filtrar só em memória faria a
    // contagem exata (`count`) continuar somando movimentação.
    const comCorte = comCorteNoBanco ? consulta.is(`metadata->>${CHAVE_DO_ESPELHO}`, null) : consulta;
    return comCorte
      .eq("lead_id", leadId)
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false })
      .limit(limite);
  };

  const [eventos, atividadesFiltradas, movimentos] = (await Promise.all([
    db
      .from("lead_events")
      .select(SELECT_DE_EVENTO_DE_LEAD, { count: "exact" })
      .eq("lead_id", leadId)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limite),
    daTabelaDeAtividade(true),
    db
      .from("pipeline_stage_moves")
      .select(SELECT_DE_MOVIMENTO_DO_LEDGER, { count: "exact" })
      .eq("lead_id", leadId)
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(limite),
  ])) as unknown as [Leitura, Leitura, Leitura];

  const falhas: HistoricoDaLead["falhas"] = [];

  /**
   * Banco que não aceite filtrar por caminho de JSON não pode custar a trilha
   * inteira: sem esta volta, um 42883 aqui derrubaria em silêncio o engajamento
   * de toda lead com qualificação de IA registrada. Medido em produção
   * (PostgREST de 02/08/2026) o filtro FUNCIONA — 481 linhas com `moveId`, 0 sem
   * — então este ramo é seguro por precaução, não por sintoma.
   *
   * O preço da volta é a contagem: sem corte no banco, `count` soma o espelho, e
   * por isso o total passa a ser o que veio na página. Fica anotado em `falhas`.
   */
  let atividades = atividadesFiltradas;
  let contagemDeAtividadeVemDaPagina = false;
  if (atividadesFiltradas.error) {
    falhas.push({
      fonte: "activities",
      code: atividadesFiltradas.error.code ?? null,
      message: `corte do espelho no banco recusado (${atividadesFiltradas.error.message}); refeito em memória`,
    });
    atividades = (await daTabelaDeAtividade(false)) as unknown as Leitura;
    contagemDeAtividadeVemDaPagina = !atividades.error;
  }

  const daTrilha = linhas(atividades).filter((row) => !ehEspelhoDoLedger(row));
  const interacoes = unirInteracoes(linhas(atividades), linhas(eventos), limite);
  const listaDeMovimentos = linhas(movimentos).map(normalizarMovimento);

  const anotar = (fonte: string, leitura: Leitura) => {
    if (leitura.error) falhas.push({ fonte, code: leitura.error.code ?? null, message: leitura.error.message });
    return !leitura.error;
  };
  const mensuravel = {
    eventos: anotar("lead_events", eventos),
    atividades: anotar("activities", atividades),
    movimentos: anotar("pipeline_stage_moves", movimentos),
  };

  // `count` é a contagem do banco; a lista pode estar cortada pelo `limite`, e
  // usar `interacoes.length` como total faria a ficha subnotificar exatamente as
  // leads mais trabalhadas. Leitura que falhou contribui 0 — e é para isso que
  // `mensuravel` existe.
  const deAtividade = contagemDeAtividadeVemDaPagina ? daTrilha.length : atividades.count ?? daTrilha.length;
  const interacoesTotal = (eventos.count ?? linhas(eventos).length) + deAtividade;
  const movimentosTotal = movimentos.count ?? listaDeMovimentos.length;

  return {
    interacoes,
    interacoesTotal,
    movimentos: listaDeMovimentos,
    movimentosTotal,
    total: interacoesTotal + movimentosTotal,
    ultimoFato: ultimoFatoDoHistorico(interacoes, listaDeMovimentos),
    mensuravel,
    falhas,
  };
}

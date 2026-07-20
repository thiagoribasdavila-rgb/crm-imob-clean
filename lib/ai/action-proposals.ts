/**
 * SALTO V4.1 — Motor de propostas de ação (Copiloto que EXECUTA).
 *
 * Transforma um sinal proativo (os mesmos do cockpit/kanban: follow-up vencido,
 * lead parado, quente sem toque, objeção aberta) numa AÇÃO CONCRETA E REVISÁVEL,
 * que entra na Caixa de Aprovações (`approval_requests`, entity_type
 * "lead_action") e só executa após decisão humana — nunca sozinha.
 *
 * Governança (contrato, não comentário):
 *   - 100% determinístico nesta v1: zero prompt, zero PII saindo daqui.
 *   - `requiresApproval: true` sempre; a execução vive na rota de decisão.
 *   - Toda proposta carrega `reason` legível (o porquê) e `preview` (o que
 *     exatamente vai acontecer) — o aprovador decide em segundos.
 *   - Kinds de efeito externo (mensagem) seguem o caminho seguro existente
 *     (messages + outbox + supressões); os internos (tarefa/reagendamento/
 *     redistribuição) executam via tabelas base com auditoria em lead_events.
 */

export const ACTION_PROPOSAL_VERSION = 1;
export const ACTION_PROPOSAL_REQUEST_TYPE = "action_proposal";
export const ACTION_PROPOSAL_ENTITY_TYPE = "lead_action";

export type ProposalSignalKind =
  | "follow_up_overdue"
  | "stale_stage"
  | "high_score_no_contact"
  | "objection_open";

export type ProposalActionKind =
  | "reschedule_followup"
  | "create_task"
  | "send_message"
  | "reassign_lead";

export type ProposalLeadInput = {
  id: string;
  name?: string | null;
  status?: string | null;
  score?: number | null;
  assignedTo?: string | null;
  phoneAvailable?: boolean;
};

export type ProposalContext = {
  /** Dias parados/sem toque, quando o sinal informar (nunca inventado). */
  daysStalled?: number | null;
  /** Follow-up vencido a reagendar (id + agendamento original). */
  overdueFollowupId?: string | null;
  /** Tipo da objeção aberta (taxonomia existente), quando houver. */
  objectionType?: string | null;
};

export type ActionProposalPayload = {
  version: number;
  kind: ProposalActionKind;
  signal: ProposalSignalKind;
  title: string;
  reason: string;
  preview: string;
  action: Record<string, string | number | boolean | null>;
  guard: { requiresApproval: true; source: "deterministic" };
};

const DAY_MS = 86_400_000;

function leadLabel(lead: ProposalLeadInput): string {
  return (lead.name || "").trim() || "o lead";
}

function nextBusinessMorning(from: Date): string {
  // Próxima manhã útil 09:00 em America/Sao_Paulo (UTC-3, sem DST vigente):
  // 09:00 BRT = 12:00 UTC. Sábado pula para segunda; domingo idem.
  const base = new Date(from.getTime() + DAY_MS);
  const day = new Date(base.getTime() - 3 * 3_600_000).getUTCDay();
  const skip = day === 6 ? 2 : day === 0 ? 1 : 0;
  const target = new Date(base.getTime() + skip * DAY_MS);
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), 12, 0, 0)).toISOString();
}

/**
 * Constrói a proposta determinística para um sinal. Retorna null quando o
 * sinal não tem ação preparável com os dados disponíveis (estado honesto).
 */
export function buildActionProposal(
  signal: ProposalSignalKind,
  lead: ProposalLeadInput,
  context: ProposalContext = {},
  now: Date = new Date(),
): ActionProposalPayload | null {
  if (!lead.id) return null;
  const nome = leadLabel(lead);
  const scheduledAt = nextBusinessMorning(now);
  const scheduledLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(scheduledAt));

  if (signal === "follow_up_overdue") {
    if (!context.overdueFollowupId) return null;
    return {
      version: ACTION_PROPOSAL_VERSION,
      kind: "reschedule_followup",
      signal,
      title: `Reagendar follow-up de ${nome}`,
      reason: "Follow-up vencido: manter o compromisso vivo evita perder o timing da negociação.",
      preview: `Novo agendamento: ${scheduledLabel} (próxima manhã útil).`,
      action: { followupId: context.overdueFollowupId, leadId: lead.id, scheduledAt },
      guard: { requiresApproval: true, source: "deterministic" },
    };
  }

  if (signal === "high_score_no_contact") {
    const dias = context.daysStalled ?? null;
    return {
      version: ACTION_PROPOSAL_VERSION,
      kind: "create_task",
      signal,
      title: `Contato prioritário com ${nome}`,
      reason: dias !== null
        ? `Lead quente sem toque há ${dias} ${dias === 1 ? "dia" : "dias"}: a janela de resposta ideal está fechando.`
        : "Lead quente sem contato registrado: a janela de resposta ideal está fechando.",
      preview: `Tarefa ALTA "Contato prioritário" para ${scheduledLabel}.`,
      action: { leadId: lead.id, title: `Contato prioritário: ${nome}`.slice(0, 120), priority: "ALTA", dueAt: scheduledAt },
      guard: { requiresApproval: true, source: "deterministic" },
    };
  }

  if (signal === "stale_stage") {
    const dias = context.daysStalled ?? null;
    const semDono = !lead.assignedTo;
    if (semDono) {
      return {
        version: ACTION_PROPOSAL_VERSION,
        kind: "reassign_lead",
        signal,
        title: `Distribuir ${nome} pela cascata`,
        reason: dias !== null
          ? `Parado há ${dias} ${dias === 1 ? "dia" : "dias"} e sem responsável: a cascata encontra o corretor com menor carga.`
          : "Sem responsável definido: a cascata encontra o corretor com menor carga.",
        preview: "Atribuição pela cascata hierárquica (corretor disponível com menor carga; gerente segura a fila se não houver).",
        action: { leadId: lead.id, strategy: "hierarchical_cascade" },
        guard: { requiresApproval: true, source: "deterministic" },
      };
    }
    return {
      version: ACTION_PROPOSAL_VERSION,
      kind: "create_task",
      signal,
      title: `Retomar ${nome} (parado)`,
      reason: dias !== null
        ? `Parado no estágio "${lead.status || "atual"}" há ${dias} ${dias === 1 ? "dia" : "dias"}: uma ação registrada destrava ou descarta com critério.`
        : `Parado no estágio "${lead.status || "atual"}": uma ação registrada destrava ou descarta com critério.`,
      preview: `Tarefa "Retomar negociação" para ${scheduledLabel}.`,
      action: { leadId: lead.id, title: `Retomar negociação: ${nome}`.slice(0, 120), priority: "NORMAL", dueAt: scheduledAt },
      guard: { requiresApproval: true, source: "deterministic" },
    };
  }

  if (signal === "objection_open") {
    return {
      version: ACTION_PROPOSAL_VERSION,
      kind: "create_task",
      signal,
      title: `Responder objeção de ${nome}`,
      reason: context.objectionType
        ? `Objeção aberta (${context.objectionType}): objeção sem resposta esfria o lead e vira descarte.`
        : "Objeção aberta sem resposta: objeção parada esfria o lead e vira descarte.",
      preview: `Tarefa ALTA "Responder objeção${context.objectionType ? ` (${context.objectionType})` : ""}" para ${scheduledLabel}.`,
      action: { leadId: lead.id, title: `Responder objeção: ${nome}`.slice(0, 120), priority: "ALTA", dueAt: scheduledAt, objectionType: context.objectionType ?? null },
      guard: { requiresApproval: true, source: "deterministic" },
    };
  }

  return null;
}

/** Quem pode DECIDIR cada kind (a criação é livre para quem acessa o lead). */
export function approverScope(kind: ProposalActionKind): "leadership" {
  // v1: TODA execução passa pela liderança (gate existente da rota de decisão).
  // Auto-aprovação de ações internas pelo dono do lead fica para a v2, com
  // trilha própria — governança primeiro.
  void kind;
  return "leadership";
}

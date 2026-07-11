export type DecisionCandidate = {
  key: string;
  sourceType: string;
  sourceId: string | null;
  decisionType: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  rationale: string;
  recommendedAction: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  confidence: number;
  requiresApproval: boolean;
  expiresAt: string;
};

function expires(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function leadDecision(lead: Record<string, unknown>): DecisionCandidate | null {
  const id = String(lead.id ?? "");
  const score = Number(lead.score ?? 0);
  const temperature = String(lead.temperature ?? "").toLowerCase();
  const status = String(lead.status ?? "novo");
  if (!id || (score < 70 && !["quente", "hot"].includes(temperature))) return null;

  return {
    key: `lead-priority:${id}:${status}`,
    sourceType: "lead",
    sourceId: id,
    decisionType: "prioritize_lead",
    priority: score >= 85 ? "critical" : "high",
    title: `Priorizar atendimento de ${String(lead.name ?? "lead")}`,
    rationale: `Lead com score ${score} e temperatura ${temperature || "não informada"}. A velocidade de contato influencia a conversão.`,
    recommendedAction: { action: "create_follow_up", dueInMinutes: score >= 85 ? 15 : 60, ownerStrategy: "assigned_broker_or_round_robin" },
    evidence: [{ metric: "lead_score", value: score }, { metric: "temperature", value: temperature }, { metric: "stage", value: status }],
    confidence: Math.min(98, Math.max(70, score)),
    requiresApproval: false,
    expiresAt: expires(24),
  };
}

export function overdueTaskDecision(task: Record<string, unknown>): DecisionCandidate | null {
  const id = String(task.id ?? "");
  const dueAt = task.due_at ? new Date(String(task.due_at)) : null;
  const status = String(task.status ?? "").toLowerCase();
  if (!id || !dueAt || dueAt >= new Date() || ["done", "concluida", "completed"].includes(status)) return null;

  const overdueHours = Math.max(1, Math.floor((Date.now() - dueAt.getTime()) / 3_600_000));
  return {
    key: `overdue-task:${id}:${dueAt.toISOString()}`,
    sourceType: "task",
    sourceId: id,
    decisionType: "recover_sla",
    priority: overdueHours >= 24 ? "critical" : "high",
    title: `Recuperar tarefa atrasada: ${String(task.title ?? "follow-up")}`,
    rationale: `Tarefa vencida há aproximadamente ${overdueHours} hora(s), criando risco de perda de SLA e conversão.`,
    recommendedAction: { action: "escalate_task", overdueHours, notify: ["assignee", "manager"] },
    evidence: [{ metric: "due_at", value: dueAt.toISOString() }, { metric: "overdue_hours", value: overdueHours }],
    confidence: 96,
    requiresApproval: false,
    expiresAt: expires(12),
  };
}

export function campaignDecision(campaign: Record<string, unknown>, targetCpl = 50): DecisionCandidate | null {
  const id = String(campaign.id ?? "");
  const spend = Number(campaign.spend ?? 0);
  const leads = Number(campaign.leads_count ?? 0);
  const cpl = leads > 0 ? spend / leads : spend;
  if (!id || spend <= 0 || cpl <= targetCpl * 1.2) return null;

  return {
    key: `campaign-cpl:${id}:${Math.floor(cpl)}`,
    sourceType: "campaign",
    sourceId: id,
    decisionType: "optimize_campaign",
    priority: cpl > targetCpl * 1.8 ? "critical" : "high",
    title: `Revisar campanha ${String(campaign.name ?? "sem nome")}`,
    rationale: `CPL atual de R$ ${cpl.toFixed(2)} está acima da meta de R$ ${targetCpl.toFixed(2)}.`,
    recommendedAction: { action: "pause_or_reallocate_budget", targetCpl, currentCpl: cpl, requiresHumanApproval: true },
    evidence: [{ metric: "spend", value: spend }, { metric: "leads", value: leads }, { metric: "cpl", value: cpl }],
    confidence: 92,
    requiresApproval: true,
    expiresAt: expires(6),
  };
}

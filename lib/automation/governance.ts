export type AutomationRisk = "low" | "medium" | "high" | "critical";

export type AutomationAction = {
  type: string;
  channel?: string;
  recipients?: number;
  financialImpact?: number;
  publishesExternally?: boolean;
  containsPersonalData?: boolean;
};

export type GovernanceDecision = {
  risk: AutomationRisk;
  requiresApproval: boolean;
  reasons: string[];
  allowedAutomatically: boolean;
};

export function evaluateAutomation(action: AutomationAction): GovernanceDecision {
  const reasons: string[] = [];
  let score = 0;

  if (action.publishesExternally) {
    score += 3;
    reasons.push("Publicação externa exige revisão humana.");
  }
  if ((action.recipients ?? 0) > 50) {
    score += 3;
    reasons.push("Disparo em massa acima de 50 destinatários.");
  }
  if ((action.financialImpact ?? 0) > 0) {
    score += 4;
    reasons.push("Ação com impacto financeiro.");
  }
  if (action.containsPersonalData) {
    score += 2;
    reasons.push("Ação processa dados pessoais.");
  }
  if (["contract", "payment", "campaign_publish", "bulk_message"].includes(action.type)) {
    score += 4;
    reasons.push("Tipo de ação classificado como sensível.");
  }

  const risk: AutomationRisk = score >= 8 ? "critical" : score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  const requiresApproval = risk !== "low";

  return {
    risk,
    requiresApproval,
    reasons: reasons.length ? reasons : ["Ação de baixo risco dentro dos limites operacionais."],
    allowedAutomatically: !requiresApproval,
  };
}

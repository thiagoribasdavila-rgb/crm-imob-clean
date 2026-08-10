type MemoryReleaseGate = {
  scope: "authenticated_organization";
  containsPii: false;
  readsMessageContent: false;
  automaticDecision: false;
  proof: {
    observedConversations: number;
    observedMessages: number;
    usableMessages: number;
    canonicalMessages: number;
    completeCommercialMemories: number;
    minimumTraceabilityPercent: number;
  };
  gate: {
    status: "ready_for_human_release" | "blocked";
    readyForHumanRelease: boolean;
    passedControls: number;
    totalControls: number;
    blockers: string[];
    requiresHumanApproval: true;
  };
  measuredAt: string;
};

type ReviewCode =
  | "TECHNICAL_GATE"
  | "REAL_EVIDENCE"
  | "FULL_TRACEABILITY"
  | "PRIVACY_BOUNDARY"
  | "OPERATIONAL_SCOPE"
  | "EVIDENCE_LIMITS";

export function buildWhatsAppMemoryHumanReview(gate: MemoryReleaseGate) {
  const canBeReviewed = gate.gate.readyForHumanRelease;
  const checklist: Array<{
    code: ReviewCode;
    label: string;
    evidenceReady: boolean;
    humanConfirmationRequired: boolean;
  }> = [
    {
      code: "TECHNICAL_GATE",
      label: "Todos os controles técnicos foram comprovados",
      evidenceReady: gate.gate.passedControls === gate.gate.totalControls,
      humanConfirmationRequired: false,
    },
    {
      code: "REAL_EVIDENCE",
      label: "Há conversas e mensagens reais observadas",
      evidenceReady:
        gate.proof.observedConversations > 0 && gate.proof.observedMessages > 0,
      humanConfirmationRequired: false,
    },
    {
      code: "FULL_TRACEABILITY",
      label: "A menor cobertura de rastreabilidade é 100%",
      evidenceReady: gate.proof.minimumTraceabilityPercent === 100,
      humanConfirmationRequired: false,
    },
    {
      code: "PRIVACY_BOUNDARY",
      label: "A revisão não abre conteúdo bruto nem dados pessoais",
      evidenceReady:
        !gate.containsPii &&
        !gate.readsMessageContent &&
        !gate.automaticDecision,
      humanConfirmationRequired: false,
    },
    {
      code: "OPERATIONAL_SCOPE",
      label: "Diretor valida o escopo operacional antes da liberação",
      evidenceReady: canBeReviewed,
      humanConfirmationRequired: true,
    },
    {
      code: "EVIDENCE_LIMITS",
      label: "Diretor reconhece que a prova não mede ganho de vendas ou precisão preditiva",
      evidenceReady: canBeReviewed,
      humanConfirmationRequired: true,
    },
  ];

  return {
    scope: gate.scope,
    containsPii: false as const,
    readsMessageContent: false as const,
    automaticDecision: false as const,
    review: {
      status: canBeReviewed
        ? ("awaiting_human_decision" as const)
        : ("blocked_by_technical_evidence" as const),
      canBeReviewed,
      approved: false as const,
      requiresAuthenticatedDirector: true as const,
      checklist,
      evidenceReady: checklist.filter((item) => item.evidenceReady).length,
      totalChecklistItems: checklist.length,
      humanConfirmationsPending: checklist.filter(
        (item) => item.humanConfirmationRequired,
      ).length,
      blockers: gate.gate.blockers,
    },
    proof: gate.proof,
    measuredAt: gate.measuredAt,
    decisionGuard:
      "Esta leitura nunca aprova a memória. A decisão precisa ser registrada por um diretor autenticado em fluxo auditável.",
    limitations: [
      "Nenhum conteúdo bruto, telefone, e-mail ou identidade pessoal é lido ou retornado.",
      "Evidência técnica pronta não equivale a aprovação operacional.",
      "A revisão não comprova aumento de vendas nem precisão preditiva.",
    ],
  };
}

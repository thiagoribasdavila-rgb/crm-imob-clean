type MemoryHumanReview = {
  scope: "authenticated_organization";
  containsPii: false;
  readsMessageContent: false;
  automaticDecision: false;
  review: {
    status: "awaiting_human_decision" | "blocked_by_technical_evidence";
    canBeReviewed: boolean;
    approved: false;
    requiresAuthenticatedDirector: true;
    humanConfirmationsPending: number;
    blockers: string[];
  };
  measuredAt: string;
};

type DecisionRequirementCode =
  | "AUTHENTICATED_SESSION"
  | "AUTHORIZED_ROLE"
  | "TENANT_MATCH"
  | "EXPLICIT_DECISION"
  | "DECISION_REASON"
  | "HUMAN_CONFIRMATIONS"
  | "IDEMPOTENCY_KEY"
  | "AUDIT_EVENT";

const requirements: Array<{
  code: DecisionRequirementCode;
  label: string;
}> = [
  { code: "AUTHENTICATED_SESSION", label: "Sessão autenticada e válida" },
  { code: "AUTHORIZED_ROLE", label: "Papel administrativo ou diretivo" },
  { code: "TENANT_MATCH", label: "Decisor pertence à mesma organização" },
  { code: "EXPLICIT_DECISION", label: "Decisão explícita: aprovar ou rejeitar" },
  { code: "DECISION_REASON", label: "Justificativa com ao menos 20 caracteres" },
  { code: "HUMAN_CONFIRMATIONS", label: "Duas confirmações humanas registradas" },
  { code: "IDEMPOTENCY_KEY", label: "Chave de idempotência obrigatória" },
  { code: "AUDIT_EVENT", label: "Evento de auditoria obrigatório" },
];

export function buildWhatsAppMemoryDirectorDecisionContract(
  review: MemoryHumanReview,
) {
  const technicallyDecidable = review.review.canBeReviewed;

  return {
    scope: review.scope,
    containsPii: false as const,
    readsMessageContent: false as const,
    automaticDecision: false as const,
    contract: {
      status: technicallyDecidable
        ? ("ready_for_authenticated_decision_flow" as const)
        : ("blocked_by_technical_evidence" as const),
      technicallyDecidable,
      persisted: false as const,
      executed: false as const,
      effectiveDecision: null,
      authenticationRequired: true as const,
      tenantMatchRequired: true as const,
      allowedRoles: ["admin", "director"] as const,
      allowedDecisions: ["approve", "reject"] as const,
      minimumReasonLength: 20,
      requiredHumanConfirmations: 2,
      idempotencyKeyRequired: true as const,
      auditEventRequired: true as const,
      requirements,
      blockers: review.review.blockers,
    },
    evidenceMeasuredAt: review.measuredAt,
    decisionGuard:
      "Este contrato apenas define como uma decisão futura deverá ser autenticada, validada e auditada. Nenhuma aprovação ou rejeição é registrada nesta fase.",
    limitations: [
      "Não existe chamada de escrita, endpoint de decisão ou alteração no Supabase nesta fase.",
      "A decisão só poderá produzir efeito após persistência idempotente no escopo da organização e registro de auditoria.",
      "Evidência técnica completa não comprova ganho de vendas nem precisão preditiva.",
    ],
  };
}

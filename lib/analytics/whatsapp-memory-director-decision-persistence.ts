type DirectorDecisionContract = {
  scope: "authenticated_organization";
  containsPii: false;
  readsMessageContent: false;
  automaticDecision: false;
  contract: {
    status:
      | "ready_for_authenticated_decision_flow"
      | "blocked_by_technical_evidence";
    technicallyDecidable: boolean;
    persisted: false;
    executed: false;
    effectiveDecision: null;
    allowedRoles: readonly ["admin", "director"];
    allowedDecisions: readonly ["approve", "reject"];
    minimumReasonLength: number;
    requiredHumanConfirmations: number;
    idempotencyKeyRequired: boolean;
    auditEventRequired: boolean;
    blockers: string[];
  };
  evidenceMeasuredAt: string;
};

export function buildWhatsAppMemoryDirectorDecisionPersistence(
  contract: DirectorDecisionContract,
) {
  const persistenceReady = contract.contract.technicallyDecidable;

  return {
    scope: contract.scope,
    containsPii: false as const,
    readsMessageContent: false as const,
    automaticDecision: false as const,
    persistence: {
      status: persistenceReady
        ? ("local_ledger_ready_remote_application_pending" as const)
        : ("blocked_by_technical_evidence" as const),
      persistenceReady,
      appendOnly: true,
      tenantScoped: true,
      serviceRoleOnlyWrite: true,
      directorReadOnly: true,
      idempotent: true,
      auditEventAtomic: true,
      evidenceFreshnessHours: 24,
      remoteMigrationApplied: false,
      endpointExposed: true,
      decisionPersisted: false,
      learningActivated: false,
      blockers: contract.contract.blockers,
    },
    evidenceMeasuredAt: contract.evidenceMeasuredAt,
    guard:
      "O endpoint e a interface permanecem bloqueados para escrita até a reconciliação da migration. Toda evidência é recalculada no servidor antes do registro.",
    limitations: [
      "A migration ainda não foi aplicada ao Supabase remoto.",
      "A interface não permite escrita enquanto o ledger remoto não responder.",
      "Registrar uma decisão não ativa aprendizado nem comprova impacto comercial.",
    ],
  };
}

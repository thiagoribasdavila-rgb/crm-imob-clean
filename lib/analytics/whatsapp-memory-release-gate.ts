type EvidenceSource = {
  total: number;
  observed: number;
  truncated: boolean;
};

type ConversationContinuityEvidence = {
  source: EvidenceSource;
  ownership: {
    linked: number;
    unlinked: number;
    ownershipComparable: number;
    alignedOwner: number;
    ownerMismatch: number;
    conversationOwnerMissing: number;
    leadOwnerMissing: number;
    bothUnassigned: number;
    missingLeadRecord: number;
    alignmentRate: number;
  };
};

type LearningCaptureEvidence = {
  source: EvidenceSource;
  capture: {
    total: number;
    structurallyUsable: number;
    structuralCoveragePercent: number;
  };
  traceability: {
    externallyTraceable: number;
    coveragePercent: number;
  };
  canonicalMemory: {
    coveredMessages: number;
    coveragePercent: number;
    structuredLearningReady: boolean;
  };
  authorization: {
    rawContentLearningAuthorized: false;
  };
  learning: {
    mode: "structured_only";
    structuredLearningReady: boolean;
    rawContentLearningReady: false;
  };
};

type CommercialContextEvidence = {
  source: EvidenceSource;
  context: {
    total: number;
    complete: number;
    completenessPercent: number;
  };
  readiness: {
    decisionSupportReady: boolean;
    rawContentUsed: false;
    requiresHumanReview: true;
  };
};

type ControlCode =
  | "REAL_TRAFFIC"
  | "COMPLETE_OBSERVATION"
  | "LEAD_LINKAGE"
  | "OWNERSHIP_PROVEN"
  | "OWNERSHIP_WITHOUT_GAPS"
  | "STRUCTURAL_CAPTURE"
  | "EXTERNAL_TRACEABILITY"
  | "CANONICAL_MEMORY"
  | "COMMERCIAL_CONTEXT"
  | "SAFE_HUMAN_GOVERNANCE";

const percent = (values: number[]) =>
  values.length ? Math.min(...values.map((value) => Math.max(0, value))) : 0;

export function buildWhatsAppMemoryReleaseGate(input: {
  continuity: ConversationContinuityEvidence;
  capture: LearningCaptureEvidence;
  context: CommercialContextEvidence;
  now?: string;
}) {
  const { continuity, capture, context } = input;
  const controls: Array<{ code: ControlCode; passed: boolean; label: string }> = [
    {
      code: "REAL_TRAFFIC",
      passed: capture.capture.total > 0 && continuity.source.total > 0,
      label: "Existe tráfego real observado",
    },
    {
      code: "COMPLETE_OBSERVATION",
      passed:
        !continuity.source.truncated &&
        !capture.source.truncated &&
        !context.source.truncated,
      label: "As fontes foram lidas integralmente",
    },
    {
      code: "LEAD_LINKAGE",
      passed:
        continuity.ownership.linked > 0 && continuity.ownership.unlinked === 0,
      label: "Todas as conversas estão ligadas a leads",
    },
    {
      code: "OWNERSHIP_PROVEN",
      passed:
        continuity.ownership.ownershipComparable > 0 &&
        continuity.ownership.alignmentRate === 100,
      label: "A titularidade foi comparada e está alinhada",
    },
    {
      code: "OWNERSHIP_WITHOUT_GAPS",
      passed:
        continuity.ownership.ownerMismatch === 0 &&
        continuity.ownership.conversationOwnerMissing === 0 &&
        continuity.ownership.leadOwnerMissing === 0 &&
        continuity.ownership.bothUnassigned === 0 &&
        continuity.ownership.missingLeadRecord === 0,
      label: "Não há lacunas de responsabilidade",
    },
    {
      code: "STRUCTURAL_CAPTURE",
      passed:
        capture.capture.structurallyUsable > 0 &&
        capture.capture.structuralCoveragePercent === 100,
      label: "A captura estrutural está completa",
    },
    {
      code: "EXTERNAL_TRACEABILITY",
      passed:
        capture.traceability.externallyTraceable > 0 &&
        capture.traceability.coveragePercent === 100,
      label: "Toda mensagem possui rastreabilidade externa",
    },
    {
      code: "CANONICAL_MEMORY",
      passed:
        capture.canonicalMemory.coveredMessages > 0 &&
        capture.canonicalMemory.coveragePercent === 100 &&
        capture.canonicalMemory.structuredLearningReady,
      label: "Toda mensagem útil possui evento canônico",
    },
    {
      code: "COMMERCIAL_CONTEXT",
      passed:
        context.context.complete > 0 &&
        context.context.completenessPercent === 100 &&
        context.readiness.decisionSupportReady,
      label: "O contexto comercial está completo",
    },
    {
      code: "SAFE_HUMAN_GOVERNANCE",
      passed:
        capture.learning.mode === "structured_only" &&
        capture.learning.structuredLearningReady &&
        !capture.learning.rawContentLearningReady &&
        !capture.authorization.rawContentLearningAuthorized &&
        !context.readiness.rawContentUsed &&
        context.readiness.requiresHumanReview,
      label: "O uso é estruturado e sujeito à revisão humana",
    },
  ];

  const blockers = controls.filter((control) => !control.passed);
  const passedControls = controls.length - blockers.length;
  const readyForHumanRelease = blockers.length === 0;

  return {
    scope: "authenticated_organization" as const,
    containsPii: false as const,
    readsMessageContent: false as const,
    automaticDecision: false as const,
    proof: {
      observedConversations: continuity.source.observed,
      observedMessages: capture.source.observed,
      usableMessages: capture.capture.structurallyUsable,
      canonicalMessages: capture.canonicalMemory.coveredMessages,
      completeCommercialMemories: context.context.complete,
      minimumTraceabilityPercent: percent([
        continuity.ownership.alignmentRate,
        capture.capture.structuralCoveragePercent,
        capture.traceability.coveragePercent,
        capture.canonicalMemory.coveragePercent,
        context.context.completenessPercent,
      ]),
    },
    controls,
    gate: {
      status: readyForHumanRelease
        ? ("ready_for_human_release" as const)
        : ("blocked" as const),
      readyForHumanRelease,
      passedControls,
      totalControls: controls.length,
      blockers: blockers.map((control) => control.code),
      requiresHumanApproval: true as const,
    },
    measuredAt: new Date(input.now ?? Date.now()).toISOString(),
    limitations: [
      "O gate prova cobertura, rastreabilidade e governança; não comprova ganho de vendas nem precisão preditiva.",
      "A liberação final exige revisão humana autenticada mesmo quando todos os controles técnicos passam.",
      "Nenhum conteúdo bruto de conversa, telefone ou identidade pessoal é lido ou retornado.",
    ],
  };
}

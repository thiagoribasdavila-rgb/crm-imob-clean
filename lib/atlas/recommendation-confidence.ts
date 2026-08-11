export type RecommendationEvidenceLevel = "high" | "medium" | "initial";

export type RecommendationConfidenceInput = {
  assignedTo?: string | null;
  campaignId?: string | null;
  evaluatedAt?: string | null;
  firstContactSlaMet?: boolean | null;
  firstResponseMinutes?: number | null;
  lastInteractionAt?: string | null;
  nextActionAt?: string | null;
  operationalPriorityLabel: string;
  operationalPriorityReason: string;
  projectEvidenceCount?: number | null;
  score?: number | null;
  source?: string | null;
  status?: string | null;
  temperature?: string | null;
};

export type RecommendationEvidence = {
  aiConfidence: {
    label: "Não aferida";
    status: "not-measured";
  };
  disclaimer: "Não representa probabilidade de venda.";
  evaluatedAt: string | null;
  evidenceCount: number;
  evidenceLabel: "Evidência alta" | "Evidência média" | "Evidência inicial";
  evidenceLevel: RecommendationEvidenceLevel;
  methodLabel: "Regras operacionais explicáveis";
  operationalPriorityLabel: string;
  originLabel: "Dados registrados no CRM";
  reasons: string[];
  salesProbabilityClaimAllowed: false;
  score: {
    label: "Score cadastrado" | "Score não informado";
    origin: "Cadastro operacional do CRM";
    value: number | null;
  };
  totalSignals: 9;
};

const TOTAL_SIGNALS = 9 as const;

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function addReason(reasons: string[], value: string | null | undefined) {
  const normalized = value?.trim();
  if (normalized && !reasons.includes(normalized)) reasons.push(normalized);
}

export function buildRecommendationEvidence(
  input: RecommendationConfidenceInput,
): RecommendationEvidence {
  const hasScore = typeof input.score === "number" && Number.isFinite(input.score);
  const scoreValue = hasScore ? Number(input.score) : null;
  const hasCampaignOrigin = hasText(input.source) || hasText(input.campaignId);
  const hasSlaEvidence =
    typeof input.firstContactSlaMet === "boolean" ||
    (typeof input.firstResponseMinutes === "number" &&
      Number.isFinite(input.firstResponseMinutes));

  const evidenceCount = [
    hasScore,
    hasText(input.temperature),
    hasText(input.status),
    hasCampaignOrigin,
    hasText(input.assignedTo),
    hasText(input.lastInteractionAt),
    hasText(input.nextActionAt),
    hasSlaEvidence,
    Number(input.projectEvidenceCount ?? 0) > 0,
  ].filter(Boolean).length;

  const evidenceLevel: RecommendationEvidenceLevel =
    evidenceCount >= 7 ? "high" : evidenceCount >= 4 ? "medium" : "initial";
  const evidenceLabel =
    evidenceLevel === "high"
      ? "Evidência alta"
      : evidenceLevel === "medium"
        ? "Evidência média"
        : "Evidência inicial";

  const reasons: string[] = [];
  addReason(reasons, input.operationalPriorityReason);
  if (hasCampaignOrigin) {
    const origin = input.campaignId || input.source;
    addReason(reasons, `Origem comercial registrada: ${origin}.`);
  }
  if (hasSlaEvidence) {
    addReason(
      reasons,
      input.firstContactSlaMet === false
        ? "SLA de primeiro contato fora do prazo registrado."
        : input.firstContactSlaMet === true
          ? "SLA de primeiro contato cumprido."
          : `Primeira resposta registrada em ${input.firstResponseMinutes} min.`,
    );
  }
  if (reasons.length < 3 && Number(input.projectEvidenceCount ?? 0) > 0) {
    addReason(
      reasons,
      `${input.projectEvidenceCount} ${
        input.projectEvidenceCount === 1 ? "sinal" : "sinais"
      } cliente × projeto registrado(s).`,
    );
  }

  return {
    aiConfidence: {
      label: "Não aferida",
      status: "not-measured",
    },
    disclaimer: "Não representa probabilidade de venda.",
    evaluatedAt: input.evaluatedAt ?? null,
    evidenceCount,
    evidenceLabel,
    evidenceLevel,
    methodLabel: "Regras operacionais explicáveis",
    operationalPriorityLabel: input.operationalPriorityLabel,
    originLabel: "Dados registrados no CRM",
    reasons: reasons.slice(0, 3),
    salesProbabilityClaimAllowed: false,
    score: {
      label: hasScore ? "Score cadastrado" : "Score não informado",
      origin: "Cadastro operacional do CRM",
      value: scoreValue,
    },
    totalSignals: TOTAL_SIGNALS,
  };
}

export type AssistedInteractionLearningInput = {
  drafted: number;
  confirmed: number;
  feedbackReceived: number;
  helpfulRate: number | null;
  confirmationRate: number | null;
  averageMinutesToNextAction: number | null;
};

export type AssistedInteractionLearningAssessment = {
  status: "insufficient_sample" | "observe" | "review" | "stable";
  sample: {
    draftedMinimum: number;
    feedbackMinimum: number;
    hasDraftSample: boolean;
    hasFeedbackSample: boolean;
  };
  title: string;
  recommendation: string;
  evidence: string;
  humanReviewRequired: true;
  automaticExternalAction: false;
};

const minimumDrafts = 15;
const minimumFeedback = 8;

export function assessAssistedInteractionLearning(
  input: AssistedInteractionLearningInput,
): AssistedInteractionLearningAssessment {
  const hasDraftSample = input.drafted >= minimumDrafts;
  const hasFeedbackSample = input.feedbackReceived >= minimumFeedback;
  const base = {
    sample: { draftedMinimum: minimumDrafts, feedbackMinimum: minimumFeedback, hasDraftSample, hasFeedbackSample },
    humanReviewRequired: true as const,
    automaticExternalAction: false as const,
  };

  if (!hasDraftSample) {
    return {
      ...base,
      status: "insufficient_sample",
      title: "Amostra ainda insuficiente",
      recommendation: "Continue usando a captura assistida com revisão humana. Não faça mudanças de processo com base nesta leitura.",
      evidence: `${input.drafted} de ${minimumDrafts} rascunhos mínimos no período.`,
    };
  }

  if (input.confirmationRate !== null && input.confirmationRate < 60) {
    return {
      ...base,
      status: "review",
      title: "Revisar clareza do rascunho",
      recommendation: "Revise com a equipe se os campos sugeridos refletem o atendimento antes de ampliar o uso.",
      evidence: `Confirmação humana de ${input.confirmationRate.toFixed(1)}% em ${input.drafted} rascunhos.`,
    };
  }

  if (hasFeedbackSample && input.helpfulRate !== null && input.helpfulRate < 70) {
    return {
      ...base,
      status: "review",
      title: "Utilidade percebida abaixo da meta interna",
      recommendation: "Reúna exemplos com a equipe e ajuste o roteiro de revisão; não altere o atendimento automaticamente.",
      evidence: `${input.helpfulRate.toFixed(1)}% de avaliações “ajudou” em ${input.feedbackReceived} retornos.`,
    };
  }

  if (input.averageMinutesToNextAction !== null && input.averageMinutesToNextAction > 24 * 60) {
    return {
      ...base,
      status: "observe",
      title: "Próxima ação demora para aparecer",
      recommendation: "Verifique se a rotina após a confirmação está clara para o corretor e para a agenda.",
      evidence: `Média de ${Math.round(input.averageMinutesToNextAction)} min até o próximo registro comercial.`,
    };
  }

  return {
    ...base,
    status: "stable",
    title: hasFeedbackSample ? "Uso consistente para acompanhamento" : "Acompanhamento em consolidação",
    recommendation: hasFeedbackSample
      ? "Mantenha a revisão humana e acompanhe o resultado com novas amostras antes de qualquer mudança de processo."
      : "Aumente as avaliações voluntárias antes de concluir se a preparação está ajudando a equipe.",
    evidence: hasFeedbackSample
      ? `${input.helpfulRate?.toFixed(1) ?? "—"}% de utilidade percebida em ${input.feedbackReceived} retornos.`
      : `${input.feedbackReceived} de ${minimumFeedback} avaliações mínimas disponíveis.`,
  };
}

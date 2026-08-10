export type AiCalibrationEvidence = {
  configuredGenerativeProviders: number;
  validatedGenerativeProviders: number;
  usageEvents: number;
  memoryRecords: number;
  verifiedKnowledgeDocuments: number;
  supervisedDecisions: number;
  passedHomologationChecks: number;
  totalHomologationChecks: number;
  measuredAt: string | null;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function evidenceScore(...checks: boolean[]) {
  if (!checks.length) return 0;
  return clampPercent((checks.filter(Boolean).length / checks.length) * 100);
}

export function buildAiCalibration(evidence: AiCalibrationEvidence) {
  const providerExecution = evidenceScore(
    evidence.configuredGenerativeProviders > 0,
    evidence.validatedGenerativeProviders > 0,
  );
  const knowledgeAndMemory = evidenceScore(
    evidence.verifiedKnowledgeDocuments > 0,
    evidence.memoryRecords > 0,
  );
  const supervisedLearning = evidenceScore(
    evidence.usageEvents > 0,
    evidence.supervisedDecisions > 0,
    evidence.memoryRecords > 0,
  );
  const operationalValidation = evidence.totalHomologationChecks > 0
    ? clampPercent((evidence.passedHomologationChecks / evidence.totalHomologationChecks) * 100)
    : 0;
  const realOperationEvidence = evidenceScore(
    evidence.usageEvents > 0,
    evidence.supervisedDecisions > 0,
    evidence.passedHomologationChecks > 0,
    Boolean(evidence.measuredAt),
  );
  const dimensions = [
    { name: "Execucao do provedor", percent: providerExecution },
    { name: "Conhecimento e memoria", percent: knowledgeAndMemory },
    { name: "Aprendizado supervisionado", percent: supervisedLearning },
    { name: "Validacao operacional", percent: operationalValidation },
    { name: "Evidencia em operacao real", percent: realOperationEvidence },
  ];
  const percent = clampPercent(
    dimensions.reduce((total, dimension) => total + dimension.percent, 0) / dimensions.length,
  );
  const controls = [
    evidence.configuredGenerativeProviders > 0,
    evidence.validatedGenerativeProviders > 0,
    evidence.usageEvents > 0,
    evidence.memoryRecords > 0,
    evidence.verifiedKnowledgeDocuments > 0,
    evidence.supervisedDecisions > 0,
  ].filter(Boolean).length;
  const status = percent === 0
    ? "sem_evidencia"
    : percent < 50
      ? "inicial"
      : percent < 80
        ? "em_validacao"
        : "evidenciada";
  const next = evidence.validatedGenerativeProviders === 0
    ? "Executar um teste supervisionado com provedor configurado e registrar a resposta real."
    : evidence.memoryRecords === 0
      ? "Registrar interacoes e resultados supervisionados para formar memoria comercial estruturada."
      : evidence.passedHomologationChecks < evidence.totalHomologationChecks
        ? "Concluir os cenarios de homologacao com evidencias humanas e resultados reais."
        : "Acompanhar qualidade, custo e resultados reais; recalibrar somente com nova evidencia.";

  return {
    percent,
    status,
    basis: "evidence_coverage" as const,
    accuracyClaimed: false as const,
    measuredAt: evidence.measuredAt,
    dimensions,
    controls,
    totalControls: 6,
    scenarios: evidence.passedHomologationChecks,
    totalScenarios: evidence.totalHomologationChecks,
    evidence,
    next,
  };
}

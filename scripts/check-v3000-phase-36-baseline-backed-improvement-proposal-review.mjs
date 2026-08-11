import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalEvidenceSha256 } from "./check-v3000-phase-35-baseline-backed-lessons-learned-review.mjs";

const requiredChecks = [
  "manualProposalReviewConfirmed", "lessonsLearnedEvidenceReviewed", "evidenceChainReviewed",
  "sameArtifactConfirmed", "sameReleaseReferenceConfirmed", "sameSourceCycleReferenceConfirmed",
  "sameCycleReferenceConfirmed", "verifiedBaselineReferenceConfirmed", "allProposalsReviewed",
  "evidenceLinksReviewed", "businessImpactAssessed", "operationalImpactAssessed",
  "userImpactAssessed", "securityImpactAssessed", "privacyImpactAssessed", "costImpactAssessed",
  "riskAssessed", "effortAssessed", "priorityAssigned", "ownerAndDueDateRecorded",
  "dependenciesRecorded", "acceptanceCriteriaRecorded", "proposalsRemainDocumentaryOnly",
  "rollbackReadinessPreserved", "noCriticalIncident", "noUnresolvedHighSeverityIncident",
  "noMaterialRegressionDetected", "noAutomaticDeploymentPerformed", "noAutomaticExecutionPerformed",
  "noAutomaticPlanningPerformed", "noAutomaticBaselineMutationPerformed",
  "noAutomaticCycleActivationPerformed",
];

const requiredStringFields = [
  "releaseIdentifier", "lessonsReviewEvidenceSha256", "sourceCycleIdentifier", "cycleIdentifier",
  "verifiedBaselineIdentifier", "lessonsReviewIdentifier", "proposalReviewIdentifier",
  "prioritizedImprovementBacklogReference", "reviewDecidedBy", "witnessedBy",
  "reviewStartedAt", "reviewCompletedAt", "recordedAt",
];

const requiredPriorities = ["P0", "P1", "P2", "P3"];

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} não encontrado.`);
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new Error(`${label} não contém JSON válido.`); }
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} divergente.`);
}

function string(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} é obrigatório.`);
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} deve ser inteiro não negativo.`);
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
}

function safeContract(contract) {
  equal(contract.phase, 36, "Fase do contrato");
  equal(contract.origin, "https://atlasaios.com.br", "Origem do contrato");
  equal(contract.requiredStatus, "approved", "Status exigido");
  equal(contract.requiredDecision, "accept-prioritized-improvement-proposals-for-planning-review", "Decisão exigida");
  equal(contract.requiredDecisionRole, "DIRETOR", "Papel decisor");
  if (!Array.isArray(contract.requiredChecks) || !sameMembers(contract.requiredChecks, requiredChecks)) {
    throw new Error("Contrato não preserva as confirmações obrigatórias da Fase 36.");
  }
  if (!Array.isArray(contract.requiredStringFields) || !sameMembers(contract.requiredStringFields, requiredStringFields)) {
    throw new Error("Contrato não preserva os campos textuais obrigatórios da Fase 36.");
  }
  if (!Array.isArray(contract.requiredPriorities) || !sameMembers(contract.requiredPriorities, requiredPriorities)) {
    throw new Error("Contrato deve exigir exatamente P0, P1, P2 e P3.");
  }
  if (contract.minimumAcceptedProposals < 1) throw new Error("É preciso aceitar ao menos uma proposta.");
  if (contract.maximumP0Proposals !== 0) throw new Error("A Fase 36 não pode aceitar proposta P0 sem incidente crítico.");
  if (contract.minimumReviewDurationMinutes < 20) throw new Error("A revisão deve durar no mínimo 20 minutos.");
  for (const [field, expected, label] of [
    ["maximumUnsubstantiatedProposals", 0, "Propostas sem evidência"],
    ["requiredDatabaseMigrationsByGate", 0, "Migrations"],
    ["requiredBootstrapExecutionsByGate", 0, "Bootstraps"],
    ["requiredBusinessDataMutationsByGate", 0, "Mutações comerciais"],
    ["requiredUsersProvisionedByGate", 0, "Usuários provisionados"],
    ["requiredSecretValuesRecorded", false, "Segredos"],
    ["requiredPersonalDataInEvidence", false, "Dados pessoais"],
    ["deploymentPerformedByGate", false, "Deploy"],
    ["databaseMutationAllowedByGate", false, "Mutação de banco"],
    ["automaticUserProvisioningAllowed", false, "Provisionamento automático"],
    ["automaticImprovementPlanningAllowed", false, "Planejamento automático de melhoria"],
    ["automaticNextCyclePlanningAllowed", false, "Planejamento automático de ciclo"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da baseline"],
    ["automaticCycleActivationAllowed", false, "Ativação automática"],
    ["automaticExecutionAllowed", false, "Execução automática"],
    ["automaticExpansionAllowed", false, "Expansão automática"],
    ["automaticRollbackAllowed", false, "Rollback automático"],
  ]) equal(contract[field], expected, label);
}

function pending(status, previous) {
  return {
    phase: 36, ok: true, improvementProposalReviewStatus: status,
    lessonsLearnedReviewEvidenceVerified: false, proposalReviewEvidenceVerified: false,
    manualImprovementProposalReviewVerified: false, improvementProposalReviewRequired: false,
    improvementProposalReviewCompleted: false, improvementPlanningReviewRequired: false,
    improvementPlanningReviewStarted: false, nextCyclePlanningAuthorized: false,
    baselineMutationAuthorized: false, automaticProductionActionAllowed: false,
    automaticImprovementPlanningAllowed: false, automaticNextCyclePlanningAllowed: false,
    automaticBaselineMutationAllowed: false, automaticCycleActivationAllowed: false,
    automaticExecutionAllowed: false, automaticExpansionAllowed: false,
    automaticRollbackAllowed: false, artifactVerified: previous.artifactVerified,
    sha256: previous.sha256, sourceFingerprint: previous.sourceFingerprint,
    deploymentPerformedByGate: false, usersProvisionedByGate: 0,
    databaseMutationsByGate: 0, secretValuesRecordedByGate: false,
  };
}

export function evaluateBaselineBackedImprovementProposalReview({
  lessonsLearnedReviewResult,
  lessonsLearnedReviewEvidence = null,
  proposalReviewEvidence = null,
  contract,
  phase11Contract,
}) {
  safeContract(contract);
  equal(lessonsLearnedReviewResult.ok, true, "Gate da Fase 35");
  equal(lessonsLearnedReviewResult.artifactVerified, true, "Artefato da Fase 35");
  equal(lessonsLearnedReviewResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  equal(lessonsLearnedReviewResult.sourceFingerprint, phase11Contract.candidate.sourceFingerprint, "Fingerprint da release");

  if (lessonsLearnedReviewResult.lessonsLearnedReviewStatus !== "baseline-backed-cycle-lessons-reviewed") {
    return pending(lessonsLearnedReviewResult.lessonsLearnedReviewStatus, lessonsLearnedReviewResult);
  }

  for (const [field, expected, label] of [
    ["cycleClosureEvidenceVerified", true, "Encerramento verificado"],
    ["lessonsLearnedEvidenceVerified", true, "Lições verificadas"],
    ["manualLessonsLearnedReviewVerified", true, "Revisão manual de lições"],
    ["lessonsLearnedReviewRequired", false, "Revisão de lições pendente"],
    ["lessonsLearnedReviewCompleted", true, "Revisão de lições concluída"],
    ["improvementProposalReviewRequired", true, "Revisão de propostas exigida"],
    ["improvementProposalReviewStarted", false, "Revisão iniciada pela Fase 35"],
    ["nextCyclePlanningAuthorized", false, "Planejamento autorizado pela Fase 35"],
    ["automaticProductionActionAllowed", false, "Ação automática da Fase 35"],
    ["automaticImprovementProposalReviewAllowed", false, "Revisão automática da Fase 35"],
    ["automaticNextCyclePlanningAllowed", false, "Planejamento automático da Fase 35"],
    ["automaticBaselineMutationAllowed", false, "Mutação automática da Fase 35"],
    ["automaticCycleActivationAllowed", false, "Ativação automática da Fase 35"],
    ["automaticExecutionAllowed", false, "Execução automática da Fase 35"],
    ["automaticExpansionAllowed", false, "Expansão automática da Fase 35"],
    ["automaticRollbackAllowed", false, "Rollback automático da Fase 35"],
    ["deploymentPerformedByGate", false, "Deploy pela Fase 35"],
    ["databaseMutationsByGate", 0, "Mutações de banco pela Fase 35"],
  ]) equal(lessonsLearnedReviewResult[field], expected, label);

  if (!proposalReviewEvidence) return pending("awaiting-baseline-backed-improvement-proposal-review-evidence", lessonsLearnedReviewResult);
  if (!lessonsLearnedReviewEvidence) throw new Error("A evidência da Fase 35 é obrigatória para revisar propostas.");

  const evidence = proposalReviewEvidence;
  equal(evidence.phase, 36, "Fase da evidência");
  equal(evidence.status, contract.requiredStatus, "Status da revisão");
  equal(evidence.decision, contract.requiredDecision, "Decisão da revisão");
  equal(evidence.reviewDecisionRole, contract.requiredDecisionRole, "Papel decisor");
  equal(evidence.candidateSha256, lessonsLearnedReviewResult.sha256, "SHA-256 da revisão");
  equal(evidence.sourceFingerprint, lessonsLearnedReviewResult.sourceFingerprint, "Fingerprint da revisão");
  equal(evidence.origin, contract.origin, "Origem da revisão");
  equal(evidence.releaseIdentifier, lessonsLearnedReviewResult.releaseIdentifier, "Identificador da release");
  equal(evidence.lessonsReviewEvidenceSha256, canonicalEvidenceSha256(lessonsLearnedReviewEvidence), "Hash canônico da Fase 35");
  for (const field of ["sourceCycleIdentifier", "cycleIdentifier", "verifiedBaselineIdentifier", "lessonsReviewIdentifier"]) {
    equal(evidence[field], lessonsLearnedReviewResult[field], field);
  }
  for (const field of contract.requiredChecks) equal(evidence[field], true, field);
  for (const field of contract.requiredStringFields) string(evidence[field], field);

  for (const field of [
    "reviewedProposalCount", "acceptedProposalCount", "deferredProposalCount",
    "rejectedProposalCount", "evidenceBackedProposalCount", "assignedAcceptedProposalCount",
    "acceptedProposalsWithDueDateCount", "acceptedProposalsWithAcceptanceCriteriaCount",
    "dependencyAssessmentCount", "unsubstantiatedProposalCount",
  ]) integer(evidence[field], field);
  equal(evidence.reviewedProposalCount, lessonsLearnedReviewResult.improvementProposalCount, "Propostas revisadas");
  equal(evidence.acceptedProposalCount + evidence.deferredProposalCount + evidence.rejectedProposalCount, evidence.reviewedProposalCount, "Classificação das propostas");
  if (evidence.acceptedProposalCount < contract.minimumAcceptedProposals) throw new Error("A revisão deve aceitar ao menos uma proposta.");
  equal(evidence.evidenceBackedProposalCount, evidence.reviewedProposalCount, "Propostas sustentadas por evidência");
  equal(evidence.assignedAcceptedProposalCount, evidence.acceptedProposalCount, "Propostas aceitas com responsável");
  equal(evidence.acceptedProposalsWithDueDateCount, evidence.acceptedProposalCount, "Propostas aceitas com prazo");
  equal(evidence.acceptedProposalsWithAcceptanceCriteriaCount, evidence.acceptedProposalCount, "Propostas aceitas com critério de aceite");
  equal(evidence.dependencyAssessmentCount, evidence.reviewedProposalCount, "Propostas com dependências avaliadas");
  if (evidence.unsubstantiatedProposalCount > contract.maximumUnsubstantiatedProposals) throw new Error("Propostas sem evidência não são aceitas.");

  if (!evidence.priorityCounts || typeof evidence.priorityCounts !== "object" || Array.isArray(evidence.priorityCounts)) {
    throw new Error("priorityCounts deve ser um objeto.");
  }
  if (!sameMembers(Object.keys(evidence.priorityCounts), contract.requiredPriorities)) throw new Error("Prioridades devem ser exatamente P0, P1, P2 e P3.");
  let prioritized = 0;
  for (const priority of contract.requiredPriorities) {
    integer(evidence.priorityCounts[priority], `Prioridade ${priority}`);
    prioritized += evidence.priorityCounts[priority];
  }
  equal(prioritized, evidence.acceptedProposalCount, "Propostas aceitas priorizadas");
  if (evidence.priorityCounts.P0 > contract.maximumP0Proposals) throw new Error("P0 exige tratamento de incidente crítico fora deste gate.");

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Bootstraps pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) equal(evidence[field], expected, label);
  if (evidence.reviewDecidedBy === evidence.witnessedBy) throw new Error("A testemunha deve ser distinta de quem decidiu.");

  const previousRecordedAt = timestamp(lessonsLearnedReviewResult.recordedAt, "recordedAt da Fase 35");
  const startedAt = timestamp(evidence.reviewStartedAt, "reviewStartedAt");
  const completedAt = timestamp(evidence.reviewCompletedAt, "reviewCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (startedAt < previousRecordedAt) throw new Error("A revisão não pode começar antes da Fase 35.");
  if (completedAt <= startedAt) throw new Error("reviewCompletedAt deve ser posterior ao início.");
  const durationMinutes = (completedAt - startedAt) / 60_000;
  if (durationMinutes < contract.minimumReviewDurationMinutes) throw new Error("A revisão deve durar no mínimo 20 minutos.");
  if (recordedAt < completedAt) throw new Error("recordedAt não pode anteceder o fim da revisão.");

  return {
    phase: 36, ok: true,
    improvementProposalReviewStatus: "baseline-backed-improvement-proposals-reviewed",
    lessonsLearnedReviewEvidenceVerified: true, proposalReviewEvidenceVerified: true,
    manualImprovementProposalReviewVerified: true, improvementProposalReviewRequired: false,
    improvementProposalReviewCompleted: true, improvementPlanningReviewRequired: true,
    improvementPlanningReviewStarted: false, nextCyclePlanningAuthorized: false,
    baselineMutationAuthorized: false, automaticProductionActionAllowed: false,
    automaticImprovementPlanningAllowed: false, automaticNextCyclePlanningAllowed: false,
    automaticBaselineMutationAllowed: false, automaticCycleActivationAllowed: false,
    automaticExecutionAllowed: false, automaticExpansionAllowed: false,
    automaticRollbackAllowed: false, reviewedProposalCount: evidence.reviewedProposalCount,
    acceptedProposalCount: evidence.acceptedProposalCount,
    deferredProposalCount: evidence.deferredProposalCount,
    rejectedProposalCount: evidence.rejectedProposalCount,
    priorityCounts: evidence.priorityCounts, artifactVerified: true,
    sha256: lessonsLearnedReviewResult.sha256,
    sourceFingerprint: lessonsLearnedReviewResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    sourceCycleIdentifier: evidence.sourceCycleIdentifier,
    cycleIdentifier: evidence.cycleIdentifier,
    verifiedBaselineIdentifier: evidence.verifiedBaselineIdentifier,
    lessonsReviewIdentifier: evidence.lessonsReviewIdentifier,
    proposalReviewIdentifier: evidence.proposalReviewIdentifier,
    prioritizedImprovementBacklogReference: evidence.prioritizedImprovementBacklogReference,
    reviewDecidedBy: evidence.reviewDecidedBy, witnessedBy: evidence.witnessedBy,
    reviewStartedAt: evidence.reviewStartedAt, reviewCompletedAt: evidence.reviewCompletedAt,
    recordedAt: evidence.recordedAt, durationMinutes,
    deploymentPerformedByGate: false, usersProvisionedByGate: 0,
    databaseMutationsByGate: 0, secretValuesRecordedByGate: false,
  };
}

export function argument(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1] || null;
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) || null : null;
}

function runCli() {
  const argv = process.argv.slice(2);
  const paths = {
    contract: argument(argv, "--phase-36-contract") || "config/v3000-phase-36-baseline-backed-improvement-proposal-review.json",
    phase11: argument(argv, "--phase-11-contract") || "config/v3000-phase-11-homologation.json",
    result35: argument(argv, "--phase-35-result"), evidence35: argument(argv, "--phase-35-evidence"),
    evidence36: argument(argv, "--phase-36-evidence"),
  };
  if (!paths.result35) throw new Error("Use --phase-35-result para o resultado verificado da Fase 35.");
  const result = evaluateBaselineBackedImprovementProposalReview({
    lessonsLearnedReviewResult: readJson(resolve(paths.result35), "Resultado da Fase 35"),
    lessonsLearnedReviewEvidence: paths.evidence35 ? readJson(resolve(paths.evidence35), "Evidência da Fase 35") : null,
    proposalReviewEvidence: paths.evidence36 ? readJson(resolve(paths.evidence36), "Evidência da Fase 36") : null,
    contract: readJson(resolve(paths.contract), "Contrato da Fase 36"),
    phase11Contract: readJson(resolve(paths.phase11), "Contrato da Fase 11"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { runCli(); } catch (error) { console.error(`Fase 36 reprovada: ${error.message}`); process.exitCode = 1; }
}

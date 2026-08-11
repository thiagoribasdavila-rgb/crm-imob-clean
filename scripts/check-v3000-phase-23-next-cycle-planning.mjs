import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyContinuousOperationReview,
} from "./check-v3000-phase-22-continuous-operation-review.mjs";

export { canonicalEvidenceSha256 };

const defaults = {
  phase23Contract: "config/v3000-phase-23-next-cycle-planning.json",
  phase22Contract: "config/v3000-phase-22-continuous-operation-review.json",
  phase21Contract: "config/v3000-phase-21-sustained-operation-validation.json",
  phase20Contract: "config/v3000-phase-20-sustained-operation.json",
  phase19Contract: "config/v3000-phase-19-expanded-cohort-validation.json",
  phase18Contract: "config/v3000-phase-18-expansion-execution.json",
  phase17Contract: "config/v3000-phase-17-controlled-expansion.json",
  phase16Contract: "config/v3000-phase-16-pilot-validation.json",
  phase15Contract: "config/v3000-phase-15-controlled-pilot.json",
  phase14Contract: "config/v3000-phase-14-operational-observation.json",
  phase13Contract: "config/v3000-phase-13-release-closure.json",
  phase12Contract: "config/v3000-phase-12-installation-handoff.json",
  phase11Contract: "config/v3000-phase-11-homologation.json",
  handoff: "docs/evidence/V3000_PHASE_12_INSTALLATION_HANDOFF.json",
};

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} não encontrado.`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} não contém JSON válido.`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} divergente.`);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} é obrigatório.`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} deve ser um inteiro não negativo.`);
  }
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve ser um número finito.`);
  }
}

function timestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`);
  return parsed;
}

function normalizedUniqueList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} deve ser uma lista.`);
  const normalized = value.map((entry) =>
    typeof entry === "string" ? entry.trim().toUpperCase() : entry,
  );
  if (normalized.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${label} contém item inválido.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} não pode conter itens duplicados.`);
  }
  return normalized;
}

function pendingResult(status, reviewResult) {
  return {
    phase: 23,
    ok: true,
    nextCyclePlanningStatus: status,
    nextCyclePlanApproved: false,
    nextCycleExecutionReviewEligible: false,
    nextCycleExecutionAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: reviewResult.artifactVerified,
    sha256: reviewResult.sha256,
    sourceFingerprint: reviewResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateNextCyclePlanning({
  reviewResult,
  continuousOperationReviewEvidence = null,
  nextCyclePlanningEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 23, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticNextCycleExecutionAllowed, false, "Execução automática do ciclo");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(reviewResult.ok, true, "Gate da Fase 22");
  assertEqual(reviewResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(reviewResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    reviewResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!reviewResult.continuousOperationReviewApproved || !reviewResult.nextCyclePlanningEligible) {
    return pendingResult("awaiting-continuous-operation-review", reviewResult);
  }
  if (!nextCyclePlanningEvidence) {
    return pendingResult("awaiting-next-cycle-plan", reviewResult);
  }
  if (!continuousOperationReviewEvidence) {
    throw new Error("A evidência da Fase 22 é obrigatória para planejar o próximo ciclo.");
  }

  const evidence = nextCyclePlanningEvidence;
  assertEqual(evidence.phase, 23, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status do plano");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão do plano");
  assertEqual(evidence.candidateSha256, reviewResult.sha256, "SHA-256 do plano");
  assertEqual(evidence.sourceFingerprint, reviewResult.sourceFingerprint, "Fingerprint do plano");
  assertEqual(evidence.origin, contract.origin, "Origem do plano");
  assertEqual(evidence.releaseIdentifier, reviewResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.continuousOperationReviewEvidenceSha256,
    canonicalEvidenceSha256(continuousOperationReviewEvidence),
    "Hash canônico da evidência da Fase 22",
  );

  for (const check of contract.requiredChecks) assertEqual(evidence[check], true, check);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.plannedUserCeiling, "Teto de usuários planejados");
  if (evidence.plannedUserCeiling < contract.minimumPlannedUserCount) {
    throw new Error("O plano deve incluir pelo menos um usuário já validado.");
  }
  if (evidence.plannedUserCeiling > reviewResult.reviewedUserCount) {
    throw new Error("O plano não pode superar a coorte humana já revisada.");
  }

  const roles = normalizedUniqueList(evidence.rolesPlanned, "rolesPlanned");
  if (roles.length !== contract.requiredRoles.length) {
    throw new Error("O plano deve preservar somente os papéis já validados.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role) || !reviewResult.rolesReviewed.includes(role)) {
      throw new Error(`Papel obrigatório não planejado: ${role}.`);
    }
  }

  assertNonNegativeInteger(
    evidence.minimumSuccessfulRequiredJourneys,
    "Meta de jornadas obrigatórias",
  );
  if (
    evidence.minimumSuccessfulRequiredJourneys < contract.minimumSuccessfulRequiredJourneys ||
    evidence.minimumSuccessfulRequiredJourneys < reviewResult.successfulRequiredJourneys
  ) {
    throw new Error("A meta de jornadas obrigatórias não pode regredir.");
  }
  assertNonNegativeInteger(
    evidence.maximumRequiredJourneyFailures,
    "Tolerância de falhas em jornadas obrigatórias",
  );
  assertEqual(
    evidence.maximumRequiredJourneyFailures,
    contract.maximumRequiredJourneyFailures,
    "Tolerância de falhas em jornadas obrigatórias",
  );

  assertFiniteNumber(evidence.minimumAvailabilityPercent, "Meta de disponibilidade");
  if (
    evidence.minimumAvailabilityPercent < contract.minimumAvailabilityPercent ||
    evidence.minimumAvailabilityPercent < reviewResult.availabilityPercent
  ) {
    throw new Error("A meta de disponibilidade não pode regredir.");
  }
  assertFiniteNumber(evidence.minimumMonitoringCoveragePercent, "Meta de monitoramento");
  if (
    evidence.minimumMonitoringCoveragePercent < contract.minimumMonitoringCoveragePercent ||
    evidence.minimumMonitoringCoveragePercent < reviewResult.monitoringCoveragePercent
  ) {
    throw new Error("A meta de cobertura de monitoramento não pode regredir.");
  }

  for (const [field, expected, label] of [
    ["maximumCriticalIncidents", contract.maximumCriticalIncidents, "Tolerância de incidentes críticos"],
    [
      "maximumUnresolvedHighSeverityIncidents",
      contract.maximumUnresolvedHighSeverityIncidents,
      "Tolerância de incidentes graves não resolvidos",
    ],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  assertNonNegativeInteger(evidence.estimatedCostCeilingCents, "Teto de custo estimado");

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais executadas pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) {
    assertEqual(evidence[field], expected, label);
  }

  assertEqual(evidence.priorWindowClosedAt, reviewResult.decidedAt, "Encerramento da janela anterior");
  if (evidence.planningOwner === reviewResult.decisionOwner) {
    throw new Error("O responsável pelo plano deve ser independente da decisão da Fase 22.");
  }
  if (evidence.approvedBy === evidence.planningOwner) {
    throw new Error("O aprovador do plano deve ser independente do planejador.");
  }

  const priorWindowClosedAt = timestamp(evidence.priorWindowClosedAt, "priorWindowClosedAt");
  const approvedAt = timestamp(evidence.approvedAt, "approvedAt");
  const plannedWindowStart = timestamp(evidence.plannedWindowStart, "plannedWindowStart");
  const plannedWindowEnd = timestamp(evidence.plannedWindowEnd, "plannedWindowEnd");
  if (approvedAt < priorWindowClosedAt) {
    throw new Error("O plano não pode ser aprovado antes do encerramento da Fase 22.");
  }
  if (plannedWindowStart < approvedAt) {
    throw new Error("A janela planejada não pode começar antes da aprovação humana.");
  }
  if (plannedWindowEnd <= plannedWindowStart) {
    throw new Error("O fim da janela planejada deve ser posterior ao início.");
  }

  return {
    phase: 23,
    ok: true,
    nextCyclePlanningStatus: "next-cycle-plan-approved",
    nextCyclePlanApproved: true,
    planningDecision: evidence.decision,
    nextCycleExecutionReviewEligible: true,
    nextCycleExecutionAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    plannedUserCeiling: evidence.plannedUserCeiling,
    rolesPlanned: roles,
    minimumSuccessfulRequiredJourneys: evidence.minimumSuccessfulRequiredJourneys,
    maximumRequiredJourneyFailures: evidence.maximumRequiredJourneyFailures,
    minimumAvailabilityPercent: evidence.minimumAvailabilityPercent,
    minimumMonitoringCoveragePercent: evidence.minimumMonitoringCoveragePercent,
    maximumCriticalIncidents: evidence.maximumCriticalIncidents,
    maximumUnresolvedHighSeverityIncidents:
      evidence.maximumUnresolvedHighSeverityIncidents,
    estimatedCostCeilingCents: evidence.estimatedCostCeilingCents,
    artifactVerified: true,
    sha256: reviewResult.sha256,
    sourceFingerprint: reviewResult.sourceFingerprint,
    releaseIdentifier: reviewResult.releaseIdentifier,
    continuousOperationReviewEvidenceSha256:
      evidence.continuousOperationReviewEvidenceSha256,
    cycleIdentifier: evidence.cycleIdentifier,
    planningOwner: evidence.planningOwner,
    approvedBy: evidence.approvedBy,
    sanitizedPlanReference: evidence.sanitizedPlanReference,
    priorWindowClosedAt: evidence.priorWindowClosedAt,
    plannedWindowStart: evidence.plannedWindowStart,
    plannedWindowEnd: evidence.plannedWindowEnd,
    approvedAt: evidence.approvedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyNextCyclePlanning(input) {
  const reviewResult = verifyContinuousOperationReview(input);
  return evaluateNextCyclePlanning({
    reviewResult,
    continuousOperationReviewEvidence: input.continuousOperationReviewEvidence,
    nextCyclePlanningEvidence: input.nextCyclePlanningEvidence,
    contract: input.phase23Contract,
    phase11Contract: input.phase11Contract,
  });
}

export function argument(argv, name) {
  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1] || null;
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) || null : null;
}

function contract(argv, argumentName, fallback, label) {
  return readJson(resolve(argument(argv, argumentName) || fallback), label);
}

function optionalEvidence(argv, argumentName, label) {
  const path = argument(argv, argumentName);
  return path ? readJson(resolve(path), label) : null;
}

function runCli() {
  const argv = process.argv.slice(2);
  const zipPath = argument(argv, "--zip");
  const checksumPath = argument(argv, "--checksum");
  const proofPath = argument(argv, "--proof");
  if (!zipPath || !checksumPath || !proofPath) {
    throw new Error("Use --zip, --checksum e --proof para o artefato aprovado.");
  }

  console.log(JSON.stringify(verifyNextCyclePlanning({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    phase23Contract: contract(argv, "--phase-23-contract", defaults.phase23Contract, "Contrato da Fase 23"),
    phase22Contract: contract(argv, "--phase-22-contract", defaults.phase22Contract, "Contrato da Fase 22"),
    phase21Contract: contract(argv, "--phase-21-contract", defaults.phase21Contract, "Contrato da Fase 21"),
    phase20Contract: contract(argv, "--phase-20-contract", defaults.phase20Contract, "Contrato da Fase 20"),
    phase19Contract: contract(argv, "--phase-19-contract", defaults.phase19Contract, "Contrato da Fase 19"),
    phase18Contract: contract(argv, "--phase-18-contract", defaults.phase18Contract, "Contrato da Fase 18"),
    phase17Contract: contract(argv, "--phase-17-contract", defaults.phase17Contract, "Contrato da Fase 17"),
    phase16Contract: contract(argv, "--phase-16-contract", defaults.phase16Contract, "Contrato da Fase 16"),
    phase15Contract: contract(argv, "--phase-15-contract", defaults.phase15Contract, "Contrato da Fase 15"),
    phase14Contract: contract(argv, "--phase-14-contract", defaults.phase14Contract, "Contrato da Fase 14"),
    phase13Contract: contract(argv, "--phase-13-contract", defaults.phase13Contract, "Contrato da Fase 13"),
    phase12Contract: contract(argv, "--phase-12-contract", defaults.phase12Contract, "Contrato da Fase 12"),
    phase11Contract: contract(argv, "--phase-11-contract", defaults.phase11Contract, "Contrato da Fase 11"),
    handoff: contract(argv, "--handoff", defaults.handoff, "Handoff da Fase 12"),
    productionEvidence: optionalEvidence(argv, "--production-evidence", "Evidência pós-deploy da Fase 11"),
    releaseEvidence: optionalEvidence(argv, "--release-evidence", "Aceite operacional da Fase 13"),
    observationEvidence: optionalEvidence(argv, "--observation-evidence", "Observação operacional da Fase 14"),
    pilotEvidence: optionalEvidence(argv, "--pilot-evidence", "Autorização do piloto da Fase 15"),
    pilotValidationEvidence: optionalEvidence(argv, "--pilot-validation-evidence", "Validação operacional do piloto da Fase 16"),
    expansionEvidence: optionalEvidence(argv, "--expansion-evidence", "Decisão de expansão da Fase 17"),
    executionEvidence: optionalEvidence(argv, "--execution-evidence", "Execução manual da Fase 18"),
    expandedCohortValidationEvidence: optionalEvidence(argv, "--expanded-cohort-validation-evidence", "Validação da coorte expandida da Fase 19"),
    sustainedOperationEvidence: optionalEvidence(argv, "--sustained-operation-evidence", "Autorização da operação sustentada da Fase 20"),
    sustainedOperationValidationEvidence: optionalEvidence(argv, "--sustained-operation-validation-evidence", "Validação da operação sustentada da Fase 21"),
    continuousOperationReviewEvidence: optionalEvidence(argv, "--continuous-operation-review-evidence", "Revisão da operação contínua da Fase 22"),
    nextCyclePlanningEvidence: optionalEvidence(argv, "--next-cycle-planning-evidence", "Plano controlado do próximo ciclo da Fase 23"),
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 23 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifySustainedOperationValidation } from "./check-v3000-phase-21-sustained-operation-validation.mjs";

const defaults = {
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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalEvidenceSha256(evidence) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(evidence)))
    .digest("hex");
}

function pendingResult(status, validationResult) {
  return {
    phase: 22,
    ok: true,
    continuousOperationReviewStatus: status,
    continuousOperationReviewApproved: false,
    validatedWindowClosed: false,
    nextCyclePlanningEligible: false,
    automaticProductionActionAllowed: false,
    continuousOperationAutomaticallyAuthorized: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: validationResult.artifactVerified,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateContinuousOperationReview({
  validationResult,
  sustainedOperationValidationEvidence = null,
  continuousOperationReviewEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 22, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticContinuousOperationAllowed, false, "Operação contínua automática");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(validationResult.ok, true, "Gate da Fase 21");
  assertEqual(validationResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(validationResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    validationResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!validationResult.sustainedOperationValidated) {
    return pendingResult("awaiting-sustained-operation-validation", validationResult);
  }
  if (!continuousOperationReviewEvidence) {
    return pendingResult("awaiting-continuous-operation-review", validationResult);
  }
  if (!sustainedOperationValidationEvidence) {
    throw new Error("A evidência da Fase 21 é obrigatória para revisar a operação contínua.");
  }

  const evidence = continuousOperationReviewEvidence;
  assertEqual(evidence.phase, 22, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da revisão");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da revisão");
  assertEqual(evidence.candidateSha256, validationResult.sha256, "SHA-256 da revisão");
  assertEqual(
    evidence.sourceFingerprint,
    validationResult.sourceFingerprint,
    "Fingerprint da revisão",
  );
  assertEqual(evidence.origin, contract.origin, "Origem da revisão");
  assertEqual(
    evidence.releaseIdentifier,
    validationResult.releaseIdentifier,
    "Identificador da release",
  );
  assertEqual(
    evidence.sustainedOperationValidationEvidenceSha256,
    canonicalEvidenceSha256(sustainedOperationValidationEvidence),
    "Hash canônico da evidência da Fase 21",
  );

  for (const check of contract.requiredChecks) assertEqual(evidence[check], true, check);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.reviewedUserCount, "Usuários revisados");
  assertNonNegativeInteger(evidence.userAccessValidatedCount, "Acessos revisados");
  assertEqual(evidence.reviewedUserCount, validationResult.observedUserCount, "Coorte revisada");
  assertEqual(
    evidence.userAccessValidatedCount,
    validationResult.userAccessValidatedCount,
    "Cobertura de acessos revisada",
  );

  const roles = normalizedUniqueList(evidence.rolesReviewed, "rolesReviewed");
  if (roles.length !== contract.requiredRoles.length) {
    throw new Error("A revisão deve preservar somente os papéis validados.");
  }
  for (const role of contract.requiredRoles) {
    if (!roles.includes(role) || !validationResult.rolesObserved.includes(role)) {
      throw new Error(`Papel obrigatório não revisado: ${role}.`);
    }
  }

  for (const [field, expected, label] of [
    ["successfulRequiredJourneys", validationResult.successfulRequiredJourneys, "Jornadas obrigatórias concluídas"],
    ["failedRequiredJourneys", contract.maximumRequiredJourneyFailures, "Falhas em jornadas obrigatórias"],
    ["availabilityPercent", validationResult.availabilityPercent, "Disponibilidade revisada"],
    ["monitoringCoveragePercent", validationResult.monitoringCoveragePercent, "Cobertura de monitoramento revisada"],
    ["dailyReviewsCompleted", validationResult.dailyReviewsCompleted, "Revisões diárias revisadas"],
    ["criticalIncidents", contract.maximumCriticalIncidents, "Incidentes críticos"],
    ["unresolvedHighSeverityIncidents", contract.maximumUnresolvedHighSeverityIncidents, "Incidentes graves não resolvidos"],
  ]) {
    assertEqual(evidence[field], expected, label);
  }

  for (const field of [
    "successfulRequiredJourneys",
    "failedRequiredJourneys",
    "dailyReviewsCompleted",
    "criticalIncidents",
    "unresolvedHighSeverityIncidents",
  ]) {
    assertNonNegativeInteger(evidence[field], field);
  }

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

  assertEqual(
    evidence.validatedWindowStart,
    validationResult.observedWindowStart,
    "Início da janela validada",
  );
  assertEqual(
    evidence.validatedWindowEnd,
    validationResult.observedWindowEnd,
    "Fim da janela validada",
  );
  assertEqual(
    evidence.phase21ReviewedAt,
    validationResult.reviewedAt,
    "Revisão registrada na Fase 21",
  );
  if (
    evidence.decisionOwner === validationResult.validationOwner ||
    evidence.decisionOwner === validationResult.rollbackOwner
  ) {
    throw new Error("O responsável pela decisão deve ser independente da validação e do rollback.");
  }
  const reviewedAt = timestamp(evidence.phase21ReviewedAt, "phase21ReviewedAt");
  const decidedAt = timestamp(evidence.decidedAt, "decidedAt");
  if (decidedAt < reviewedAt) {
    throw new Error("A decisão não pode ocorrer antes da revisão final da Fase 21.");
  }

  return {
    phase: 22,
    ok: true,
    continuousOperationReviewStatus: "continuous-operation-review-approved",
    continuousOperationReviewApproved: true,
    reviewDecision: evidence.decision,
    validatedWindowClosed: true,
    nextCyclePlanningEligible: true,
    automaticProductionActionAllowed: false,
    continuousOperationAutomaticallyAuthorized: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    reviewedUserCount: evidence.reviewedUserCount,
    rolesReviewed: roles,
    successfulRequiredJourneys: evidence.successfulRequiredJourneys,
    failedRequiredJourneys: evidence.failedRequiredJourneys,
    availabilityPercent: evidence.availabilityPercent,
    monitoringCoveragePercent: evidence.monitoringCoveragePercent,
    dailyReviewsCompleted: evidence.dailyReviewsCompleted,
    artifactVerified: true,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    releaseIdentifier: validationResult.releaseIdentifier,
    sustainedOperationValidationEvidenceSha256:
      evidence.sustainedOperationValidationEvidenceSha256,
    decisionOwner: evidence.decisionOwner,
    sanitizedDecisionReference: evidence.sanitizedDecisionReference,
    validatedWindowStart: evidence.validatedWindowStart,
    validatedWindowEnd: evidence.validatedWindowEnd,
    phase21ReviewedAt: evidence.phase21ReviewedAt,
    decidedAt: evidence.decidedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyContinuousOperationReview(input) {
  const validationResult = verifySustainedOperationValidation(input);
  return evaluateContinuousOperationReview({
    validationResult,
    sustainedOperationValidationEvidence: input.sustainedOperationValidationEvidence,
    continuousOperationReviewEvidence: input.continuousOperationReviewEvidence,
    contract: input.phase22Contract,
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

  console.log(JSON.stringify(verifyContinuousOperationReview({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
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
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 22 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

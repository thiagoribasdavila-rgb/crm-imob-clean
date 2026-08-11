import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyNextCycleValidation,
} from "./check-v3000-phase-26-next-cycle-validation.mjs";

export { canonicalEvidenceSha256 };

const defaults = {
  phase27Contract: "config/v3000-phase-27-next-cycle-closure.json",
  handoff: "docs/evidence/V3000_PHASE_12_INSTALLATION_HANDOFF.json",
};
for (let phase = 11; phase <= 26; phase += 1) {
  defaults[`phase${phase}Contract`] = `config/v3000-phase-${phase}-${({
    11: "homologation",
    12: "installation-handoff",
    13: "release-closure",
    14: "operational-observation",
    15: "controlled-pilot",
    16: "pilot-validation",
    17: "controlled-expansion",
    18: "expansion-execution",
    19: "expanded-cohort-validation",
    20: "sustained-operation",
    21: "sustained-operation-validation",
    22: "continuous-operation-review",
    23: "next-cycle-planning",
    24: "next-cycle-execution-readiness",
    25: "next-cycle-execution",
    26: "next-cycle-validation",
  })[phase]}.json`;
}

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

function sameMembers(actual, expected) {
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
}

function pendingResult(status, validationResult) {
  return {
    phase: 27,
    ok: true,
    nextCycleClosureStatus: status,
    nextCycleClosureEvidenceVerified: false,
    manualNextCycleClosureVerified: false,
    nextCycleFormallyClosed: false,
    nextCycleClosureReviewRequired:
      status === "awaiting-next-cycle-closure-review",
    lessonsLearnedReviewRequired: false,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticCycleClosureAllowed: false,
    automaticNextCyclePlanningAllowed: false,
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

function assertSafeContract(contract) {
  assertEqual(contract.phase, 27, "Fase do contrato");
  assertEqual(contract.requiredDecisionRole, "DIRETOR", "Papel da decisão");
  assertEqual(contract.maximumFailedRequiredJourneys, 0, "Tolerância a falhas de jornada");
  assertEqual(contract.maximumCriticalIncidents, 0, "Tolerância a incidentes críticos");
  assertEqual(contract.maximumUnresolvedHighSeverityIncidents, 0, "Tolerância a incidentes graves não resolvidos");
  assertEqual(contract.maximumMaterialRegressions, 0, "Tolerância a regressões materiais");
  assertEqual(contract.requiredDatabaseMigrationsByGate, 0, "Migrations exigidas pelo gate");
  assertEqual(contract.requiredBootstrapExecutionsByGate, 0, "Bootstraps exigidos pelo gate");
  assertEqual(contract.requiredBusinessDataMutationsByGate, 0, "Mutações comerciais exigidas pelo gate");
  assertEqual(contract.requiredUsersProvisionedByGate, 0, "Usuários exigidos pelo gate");
  assertEqual(contract.requiredSecretValuesRecorded, false, "Registro de segredos exigido");
  assertEqual(contract.requiredPersonalDataInEvidence, false, "Dados pessoais exigidos na evidência");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticCycleClosureAllowed, false, "Encerramento automático");
  assertEqual(contract.automaticNextCyclePlanningAllowed, false, "Planejamento automático");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
}

export function evaluateNextCycleClosure({
  validationResult,
  nextCycleValidationEvidence = null,
  nextCycleClosureEvidence = null,
  contract,
  phase11Contract,
}) {
  assertSafeContract(contract);
  assertEqual(validationResult.ok, true, "Gate da Fase 26");
  assertEqual(validationResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(validationResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(validationResult.sourceFingerprint, phase11Contract.candidate.sourceFingerprint, "Fingerprint da release");

  if (validationResult.nextCycleValidationStatus !== "next-cycle-validated") {
    return pendingResult(validationResult.nextCycleValidationStatus, validationResult);
  }
  assertEqual(
    validationResult.nextCycleClosureReviewRequired,
    true,
    "Revisão de encerramento exigida pela Fase 26",
  );
  if (!nextCycleClosureEvidence) {
    const result = pendingResult("awaiting-next-cycle-closure-review", validationResult);
    result.lessonsLearnedReviewRequired = false;
    return result;
  }
  if (!nextCycleValidationEvidence) {
    throw new Error("A evidência da Fase 26 é obrigatória para encerrar o ciclo validado.");
  }

  const evidence = nextCycleClosureEvidence;
  assertEqual(evidence.phase, 27, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status do encerramento");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão do encerramento");
  assertEqual(evidence.closureDecisionRole, contract.requiredDecisionRole, "Papel da decisão");
  assertEqual(evidence.candidateSha256, validationResult.sha256, "SHA-256 do encerramento");
  assertEqual(evidence.sourceFingerprint, validationResult.sourceFingerprint, "Fingerprint do encerramento");
  assertEqual(evidence.origin, contract.origin, "Origem do encerramento");
  assertEqual(evidence.releaseIdentifier, validationResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.nextCycleValidationEvidenceSha256,
    canonicalEvidenceSha256(nextCycleValidationEvidence),
    "Hash canônico da evidência da Fase 26",
  );
  assertEqual(evidence.cycleIdentifier, validationResult.cycleIdentifier, "Identificador do ciclo");

  for (const check of contract.requiredChecks) assertEqual(evidence[check], true, check);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.closedUserCount, "Quantidade de usuários encerrada");
  assertEqual(evidence.closedUserCount, validationResult.validatedUserCount, "Quantidade de usuários encerrada");
  const roles = normalizedUniqueList(evidence.rolesClosed, "rolesClosed");
  const validatedRoles = normalizedUniqueList(validationResult.rolesValidated, "rolesValidated da Fase 26");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, validatedRoles)) {
    throw new Error("Os papéis encerrados devem ser exatamente os validados na Fase 26.");
  }

  for (const [field, expected, label] of [
    ["acceptedSuccessfulRequiredJourneys", validationResult.successfulRequiredJourneys, "Jornadas obrigatórias aceitas"],
    ["acceptedFailedRequiredJourneys", validationResult.failedRequiredJourneys, "Falhas de jornadas obrigatórias aceitas"],
    ["acceptedCriticalIncidents", validationResult.criticalIncidents, "Incidentes críticos aceitos"],
    ["acceptedUnresolvedHighSeverityIncidents", validationResult.unresolvedHighSeverityIncidents, "Incidentes graves não resolvidos aceitos"],
    ["acceptedMaterialRegressions", validationResult.materialRegressions, "Regressões materiais aceitas"],
    ["acceptedObservedCostCents", validationResult.observedCostCents, "Custo observado aceito"],
  ]) {
    assertNonNegativeInteger(evidence[field], label);
    assertEqual(evidence[field], expected, label);
  }
  assertFiniteNumber(evidence.acceptedAvailabilityPercent, "Disponibilidade aceita");
  assertEqual(evidence.acceptedAvailabilityPercent, validationResult.validatedAvailabilityPercent, "Disponibilidade aceita");
  assertFiniteNumber(evidence.acceptedMonitoringCoveragePercent, "Monitoramento aceito");
  assertEqual(evidence.acceptedMonitoringCoveragePercent, validationResult.validatedMonitoringCoveragePercent, "Monitoramento aceito");

  if (evidence.acceptedFailedRequiredJourneys > contract.maximumFailedRequiredJourneys) throw new Error("O encerramento excedeu a tolerância de falhas em jornadas.");
  if (evidence.acceptedCriticalIncidents > contract.maximumCriticalIncidents) throw new Error("O encerramento excedeu a tolerância de incidentes críticos.");
  if (evidence.acceptedUnresolvedHighSeverityIncidents > contract.maximumUnresolvedHighSeverityIncidents) throw new Error("O encerramento excedeu a tolerância de incidentes graves.");
  if (evidence.acceptedMaterialRegressions > contract.maximumMaterialRegressions) throw new Error("O encerramento aceitou regressão material.");

  for (const [field, expected, label] of [
    ["databaseMigrationsByGate", contract.requiredDatabaseMigrationsByGate, "Migrations executadas pelo gate"],
    ["bootstrapExecutionsByGate", contract.requiredBootstrapExecutionsByGate, "Execuções de bootstrap pelo gate"],
    ["businessDataMutationsByGate", contract.requiredBusinessDataMutationsByGate, "Mutações comerciais executadas pelo gate"],
    ["usersProvisionedByGate", contract.requiredUsersProvisionedByGate, "Usuários provisionados pelo gate"],
    ["secretValuesRecorded", contract.requiredSecretValuesRecorded, "Registro de segredos"],
    ["containsPersonalData", contract.requiredPersonalDataInEvidence, "Dados pessoais na evidência"],
  ]) assertEqual(evidence[field], expected, label);

  if ([validationResult.validatedBy, validationResult.reviewedBy].includes(evidence.closureDecidedBy)) {
    throw new Error("O decisor do encerramento deve ser independente da validação da Fase 26.");
  }
  if (
    [
      evidence.closureDecidedBy,
      validationResult.validatedBy,
      validationResult.reviewedBy,
    ].includes(evidence.witnessedBy)
  ) {
    throw new Error("A testemunha do encerramento deve ser independente da decisão e da validação.");
  }

  const validationCompletedAt = timestamp(validationResult.validationCompletedAt, "validationCompletedAt da Fase 26");
  const closureStartedAt = timestamp(evidence.closureReviewStartedAt, "closureReviewStartedAt");
  const closureCompletedAt = timestamp(evidence.closureReviewCompletedAt, "closureReviewCompletedAt");
  const recordedAt = timestamp(evidence.recordedAt, "recordedAt");
  if (closureStartedAt < validationCompletedAt) throw new Error("A revisão de encerramento não pode começar antes do fim da validação.");
  if (closureCompletedAt <= closureStartedAt) throw new Error("closureReviewCompletedAt deve ser posterior ao início da revisão.");
  const durationMinutes = (closureCompletedAt - closureStartedAt) / 60_000;
  if (durationMinutes < contract.minimumClosureReviewDurationMinutes) {
    throw new Error(`A revisão de encerramento deve durar no mínimo ${contract.minimumClosureReviewDurationMinutes} minutos.`);
  }
  if (recordedAt < closureCompletedAt) throw new Error("recordedAt não pode anteceder o fim da revisão.");

  return {
    phase: 27,
    ok: true,
    nextCycleClosureStatus: "next-cycle-formally-closed",
    nextCycleClosureEvidenceVerified: true,
    manualNextCycleClosureVerified: true,
    nextCycleFormallyClosed: true,
    nextCycleClosureReviewRequired: false,
    lessonsLearnedReviewRequired: true,
    nextCyclePlanningAuthorized: false,
    automaticProductionActionAllowed: false,
    automaticCycleClosureAllowed: false,
    automaticNextCyclePlanningAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    closedUserCount: evidence.closedUserCount,
    rolesClosed: roles,
    successfulRequiredJourneys: evidence.acceptedSuccessfulRequiredJourneys,
    failedRequiredJourneys: evidence.acceptedFailedRequiredJourneys,
    acceptedAvailabilityPercent: evidence.acceptedAvailabilityPercent,
    acceptedMonitoringCoveragePercent: evidence.acceptedMonitoringCoveragePercent,
    criticalIncidents: evidence.acceptedCriticalIncidents,
    unresolvedHighSeverityIncidents: evidence.acceptedUnresolvedHighSeverityIncidents,
    materialRegressions: evidence.acceptedMaterialRegressions,
    observedCostCents: evidence.acceptedObservedCostCents,
    artifactVerified: true,
    sha256: validationResult.sha256,
    sourceFingerprint: validationResult.sourceFingerprint,
    releaseIdentifier: evidence.releaseIdentifier,
    nextCycleValidationEvidenceSha256: evidence.nextCycleValidationEvidenceSha256,
    cycleIdentifier: evidence.cycleIdentifier,
    closureDecidedBy: evidence.closureDecidedBy,
    witnessedBy: evidence.witnessedBy,
    sanitizedClosureReference: evidence.sanitizedClosureReference,
    closureReviewStartedAt: evidence.closureReviewStartedAt,
    closureReviewCompletedAt: evidence.closureReviewCompletedAt,
    recordedAt: evidence.recordedAt,
    durationMinutes,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyNextCycleClosure(input) {
  const validationResult = verifyNextCycleValidation(input);
  return evaluateNextCycleClosure({
    validationResult,
    nextCycleValidationEvidence: input.nextCycleValidationEvidence,
    nextCycleClosureEvidence: input.nextCycleClosureEvidence,
    contract: input.phase27Contract,
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
  if (!zipPath || !checksumPath || !proofPath) throw new Error("Use --zip, --checksum e --proof para o artefato aprovado.");

  const contractArgs = { phase27Contract: contract(argv, "--phase-27-contract", defaults.phase27Contract, "Contrato da Fase 27") };
  for (let phase = 11; phase <= 26; phase += 1) {
    const key = `phase${phase}Contract`;
    contractArgs[key] = contract(argv, `--phase-${phase}-contract`, defaults[key], `Contrato da Fase ${phase}`);
  }
  const evidenceArguments = {
    productionEvidence: ["--production-evidence", "Evidência pós-deploy da Fase 11"],
    releaseEvidence: ["--release-evidence", "Aceite operacional da Fase 13"],
    observationEvidence: ["--observation-evidence", "Observação operacional da Fase 14"],
    pilotEvidence: ["--pilot-evidence", "Autorização do piloto da Fase 15"],
    pilotValidationEvidence: ["--pilot-validation-evidence", "Validação operacional do piloto da Fase 16"],
    expansionEvidence: ["--expansion-evidence", "Decisão de expansão da Fase 17"],
    executionEvidence: ["--execution-evidence", "Execução manual da Fase 18"],
    expandedCohortValidationEvidence: ["--expanded-cohort-validation-evidence", "Validação da coorte expandida da Fase 19"],
    sustainedOperationEvidence: ["--sustained-operation-evidence", "Autorização da operação sustentada da Fase 20"],
    sustainedOperationValidationEvidence: ["--sustained-operation-validation-evidence", "Validação da operação sustentada da Fase 21"],
    continuousOperationReviewEvidence: ["--continuous-operation-review-evidence", "Revisão da operação contínua da Fase 22"],
    nextCyclePlanningEvidence: ["--next-cycle-planning-evidence", "Plano controlado do próximo ciclo da Fase 23"],
    nextCycleExecutionReadinessEvidence: ["--next-cycle-execution-readiness-evidence", "Prontidão de execução da Fase 24"],
    nextCycleExecutionEvidence: ["--next-cycle-execution-evidence", "Execução manual do próximo ciclo da Fase 25"],
    nextCycleValidationEvidence: ["--next-cycle-validation-evidence", "Validação do próximo ciclo da Fase 26"],
    nextCycleClosureEvidence: ["--next-cycle-closure-evidence", "Encerramento formal do próximo ciclo da Fase 27"],
  };
  const evidence = {};
  for (const [key, [flag, label]] of Object.entries(evidenceArguments)) evidence[key] = optionalEvidence(argv, flag, label);

  console.log(JSON.stringify(verifyNextCycleClosure({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    ...contractArgs,
    handoff: contract(argv, "--handoff", defaults.handoff, "Handoff da Fase 12"),
    ...evidence,
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 27 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

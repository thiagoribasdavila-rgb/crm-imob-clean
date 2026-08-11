import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalEvidenceSha256,
  verifyNextCyclePlanning,
} from "./check-v3000-phase-23-next-cycle-planning.mjs";

export { canonicalEvidenceSha256 };

const defaults = {
  phase24Contract: "config/v3000-phase-24-next-cycle-execution-readiness.json",
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

function sameMembers(actual, expected) {
  return actual.length === expected.length && actual.every((value) => expected.includes(value));
}

function pendingResult(status, planningResult) {
  return {
    phase: 24,
    ok: true,
    nextCycleExecutionReviewStatus: status,
    nextCycleExecutionReviewApproved: false,
    manualNextCycleExecutionAuthorized: false,
    nextCycleExecutionEvidenceRequired: false,
    nextCycleExecutionPerformed: false,
    automaticProductionActionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    artifactVerified: planningResult.artifactVerified,
    sha256: planningResult.sha256,
    sourceFingerprint: planningResult.sourceFingerprint,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function evaluateNextCycleExecutionReadiness({
  planningResult,
  nextCyclePlanningEvidence = null,
  nextCycleExecutionReadinessEvidence = null,
  contract,
  phase11Contract,
}) {
  assertEqual(contract.phase, 24, "Fase do contrato");
  assertEqual(contract.deploymentPerformedByGate, false, "Publicação automática");
  assertEqual(contract.databaseMutationAllowedByGate, false, "Mutação automática de banco");
  assertEqual(contract.automaticUserProvisioningAllowed, false, "Provisionamento automático");
  assertEqual(contract.automaticNextCycleExecutionAllowed, false, "Execução automática do ciclo");
  assertEqual(contract.automaticExpansionAllowed, false, "Expansão automática");
  assertEqual(contract.automaticRollbackAllowed, false, "Rollback automático");
  assertEqual(planningResult.ok, true, "Gate da Fase 23");
  assertEqual(planningResult.artifactVerified, true, "Identidade do artefato");
  assertEqual(planningResult.sha256, phase11Contract.candidate.sha256, "SHA-256 da release");
  assertEqual(
    planningResult.sourceFingerprint,
    phase11Contract.candidate.sourceFingerprint,
    "Fingerprint da release",
  );

  if (!planningResult.nextCyclePlanApproved || !planningResult.nextCycleExecutionReviewEligible) {
    return pendingResult("awaiting-next-cycle-plan", planningResult);
  }
  if (!nextCycleExecutionReadinessEvidence) {
    return pendingResult("awaiting-next-cycle-execution-review", planningResult);
  }
  if (!nextCyclePlanningEvidence) {
    throw new Error("A evidência da Fase 23 é obrigatória para revisar a execução do próximo ciclo.");
  }

  const evidence = nextCycleExecutionReadinessEvidence;
  assertEqual(evidence.phase, 24, "Fase da evidência");
  assertEqual(evidence.status, contract.requiredStatus, "Status da revisão de prontidão");
  assertEqual(evidence.decision, contract.requiredDecision, "Decisão da revisão de prontidão");
  assertEqual(evidence.candidateSha256, planningResult.sha256, "SHA-256 da revisão");
  assertEqual(evidence.sourceFingerprint, planningResult.sourceFingerprint, "Fingerprint da revisão");
  assertEqual(evidence.origin, contract.origin, "Origem da revisão");
  assertEqual(evidence.releaseIdentifier, planningResult.releaseIdentifier, "Identificador da release");
  assertEqual(
    evidence.nextCyclePlanningEvidenceSha256,
    canonicalEvidenceSha256(nextCyclePlanningEvidence),
    "Hash canônico da evidência da Fase 23",
  );
  assertEqual(evidence.cycleIdentifier, planningResult.cycleIdentifier, "Identificador do ciclo");

  for (const check of contract.requiredChecks) assertEqual(evidence[check], true, check);
  for (const field of contract.requiredStringFields) assertNonEmptyString(evidence[field], field);

  assertNonNegativeInteger(evidence.authorizedUserCount, "Quantidade de usuários autorizados");
  if (evidence.authorizedUserCount < contract.minimumAuthorizedUserCount) {
    throw new Error("A autorização deve incluir pelo menos um usuário da coorte aprovada.");
  }
  if (evidence.authorizedUserCount > planningResult.plannedUserCeiling) {
    throw new Error("A autorização não pode superar a coorte aprovada na Fase 23.");
  }

  const roles = normalizedUniqueList(evidence.rolesAuthorized, "rolesAuthorized");
  const plannedRoles = normalizedUniqueList(planningResult.rolesPlanned, "rolesPlanned");
  if (!sameMembers(roles, contract.requiredRoles) || !sameMembers(roles, plannedRoles)) {
    throw new Error("Os papéis autorizados devem ser exatamente os aprovados na Fase 23.");
  }

  assertNonNegativeInteger(
    evidence.minimumSuccessfulRequiredJourneys,
    "Meta de jornadas obrigatórias",
  );
  assertEqual(
    evidence.minimumSuccessfulRequiredJourneys,
    planningResult.minimumSuccessfulRequiredJourneys,
    "Meta de jornadas obrigatórias",
  );
  assertNonNegativeInteger(
    evidence.maximumRequiredJourneyFailures,
    "Tolerância de falhas em jornadas obrigatórias",
  );
  assertEqual(
    evidence.maximumRequiredJourneyFailures,
    planningResult.maximumRequiredJourneyFailures,
    "Tolerância de falhas em jornadas obrigatórias",
  );
  assertEqual(
    evidence.maximumRequiredJourneyFailures,
    contract.maximumRequiredJourneyFailures,
    "Tolerância máxima de falhas",
  );

  for (const [field, label] of [
    ["minimumAvailabilityPercent", "Meta de disponibilidade"],
    ["minimumMonitoringCoveragePercent", "Meta de monitoramento"],
  ]) {
    assertFiniteNumber(evidence[field], label);
    assertEqual(evidence[field], planningResult[field], label);
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
    assertEqual(evidence[field], planningResult[field], label);
  }

  assertNonNegativeInteger(evidence.authorizedCostCeilingCents, "Teto de custo autorizado");
  if (evidence.authorizedCostCeilingCents > planningResult.estimatedCostCeilingCents) {
    throw new Error("O teto de custo autorizado não pode superar o plano aprovado.");
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

  assertEqual(evidence.planApprovedAt, planningResult.approvedAt, "Aprovação do plano");
  if (
    evidence.executionReadinessOwner === planningResult.planningOwner ||
    evidence.executionReadinessOwner === planningResult.approvedBy
  ) {
    throw new Error("O revisor de prontidão deve ser independente do planejamento e da aprovação da Fase 23.");
  }
  if (evidence.authorizedBy === evidence.executionReadinessOwner) {
    throw new Error("O autorizador deve ser independente do revisor de prontidão.");
  }

  const planApprovedAt = timestamp(evidence.planApprovedAt, "planApprovedAt");
  const reviewedAt = timestamp(evidence.reviewedAt, "reviewedAt");
  const authorizedAt = timestamp(evidence.authorizedAt, "authorizedAt");
  const plannedWindowStart = timestamp(planningResult.plannedWindowStart, "plannedWindowStart");
  const plannedWindowEnd = timestamp(planningResult.plannedWindowEnd, "plannedWindowEnd");
  const authorizedWindowStart = timestamp(evidence.authorizedWindowStart, "authorizedWindowStart");
  const authorizedWindowEnd = timestamp(evidence.authorizedWindowEnd, "authorizedWindowEnd");
  if (reviewedAt < planApprovedAt) {
    throw new Error("A revisão de prontidão não pode anteceder a aprovação do plano.");
  }
  if (authorizedAt < reviewedAt) {
    throw new Error("A autorização não pode anteceder a revisão de prontidão.");
  }
  if (authorizedWindowStart < authorizedAt) {
    throw new Error("A janela autorizada não pode começar antes da autorização humana.");
  }
  if (authorizedWindowEnd <= authorizedWindowStart) {
    throw new Error("O fim da janela autorizada deve ser posterior ao início.");
  }
  if (authorizedWindowStart < plannedWindowStart || authorizedWindowEnd > plannedWindowEnd) {
    throw new Error("A janela autorizada deve permanecer dentro da janela aprovada na Fase 23.");
  }

  return {
    phase: 24,
    ok: true,
    nextCycleExecutionReviewStatus: "next-cycle-execution-authorized",
    nextCycleExecutionReviewApproved: true,
    readinessDecision: evidence.decision,
    manualNextCycleExecutionAuthorized: true,
    nextCycleExecutionEvidenceRequired: true,
    nextCycleExecutionPerformed: false,
    automaticProductionActionAllowed: false,
    automaticExpansionAllowed: false,
    automaticRollbackAllowed: false,
    authorizedUserCount: evidence.authorizedUserCount,
    rolesAuthorized: roles,
    minimumSuccessfulRequiredJourneys: evidence.minimumSuccessfulRequiredJourneys,
    maximumRequiredJourneyFailures: evidence.maximumRequiredJourneyFailures,
    minimumAvailabilityPercent: evidence.minimumAvailabilityPercent,
    minimumMonitoringCoveragePercent: evidence.minimumMonitoringCoveragePercent,
    maximumCriticalIncidents: evidence.maximumCriticalIncidents,
    maximumUnresolvedHighSeverityIncidents:
      evidence.maximumUnresolvedHighSeverityIncidents,
    authorizedCostCeilingCents: evidence.authorizedCostCeilingCents,
    artifactVerified: true,
    sha256: planningResult.sha256,
    sourceFingerprint: planningResult.sourceFingerprint,
    releaseIdentifier: planningResult.releaseIdentifier,
    nextCyclePlanningEvidenceSha256: evidence.nextCyclePlanningEvidenceSha256,
    cycleIdentifier: evidence.cycleIdentifier,
    executionReadinessOwner: evidence.executionReadinessOwner,
    authorizedBy: evidence.authorizedBy,
    sanitizedReadinessReference: evidence.sanitizedReadinessReference,
    planApprovedAt: evidence.planApprovedAt,
    authorizedWindowStart: evidence.authorizedWindowStart,
    authorizedWindowEnd: evidence.authorizedWindowEnd,
    reviewedAt: evidence.reviewedAt,
    authorizedAt: evidence.authorizedAt,
    deploymentPerformedByGate: false,
    usersProvisionedByGate: 0,
    databaseMutationsByGate: 0,
    secretValuesRecordedByGate: false,
  };
}

export function verifyNextCycleExecutionReadiness(input) {
  const planningResult = verifyNextCyclePlanning(input);
  return evaluateNextCycleExecutionReadiness({
    planningResult,
    nextCyclePlanningEvidence: input.nextCyclePlanningEvidence,
    nextCycleExecutionReadinessEvidence: input.nextCycleExecutionReadinessEvidence,
    contract: input.phase24Contract,
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

  const contractArgs = {};
  for (let phase = 11; phase <= 24; phase += 1) {
    const key = `phase${phase}Contract`;
    contractArgs[key] = contract(
      argv,
      `--phase-${phase}-contract`,
      defaults[key],
      `Contrato da Fase ${phase}`,
    );
  }

  console.log(JSON.stringify(verifyNextCycleExecutionReadiness({
    zipPath: resolve(zipPath),
    checksumPath: resolve(checksumPath),
    proofPath: resolve(proofPath),
    ...contractArgs,
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
    nextCycleExecutionReadinessEvidence: optionalEvidence(argv, "--next-cycle-execution-readiness-evidence", "Revisão de prontidão para execução da Fase 24"),
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`Fase 24 reprovada: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

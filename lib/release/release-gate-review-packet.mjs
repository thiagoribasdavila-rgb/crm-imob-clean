import { createHash } from "node:crypto";
import {
  inspectAdmittedEvidenceMatrixEvaluationPolicy,
  inspectAdmittedEvidenceMatrixEvaluationResult,
} from "./admitted-evidence-matrix-evaluation.mjs";
import { extractAdmittedEvidenceRecords } from "./release-evidence-admission.mjs";
import { evaluateReleaseGateEvidenceMatrix } from "./release-gate-evidence-matrix.mjs";

export const RELEASE_GATE_REVIEW_PACKET_POLICY_SCHEMA = "atlas.release-gate-review-packet-policy.v1";
export const RELEASE_GATE_REVIEW_PACKET_SCHEMA = "atlas.release-gate-review-packet.v1";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function assertIsoDate(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`);
}

function assertContext({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy }) {
  const inspection = inspectAdmittedEvidenceMatrixEvaluationPolicy(evaluationPolicy, {
    decision,
    plan,
    intakePolicy,
    provenancePolicy,
    admissionPolicy,
  });
  if (!inspection.ok) throw new Error(`evaluation_policy_invalid:${inspection.reason}`);
}

export function createReleaseGateReviewPacketPolicy({
  decision,
  plan,
  intakePolicy,
  provenancePolicy,
  admissionPolicy,
  evaluationPolicy,
  maxPacketDelaySeconds = 300,
}) {
  assertContext({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy });
  if (!Number.isInteger(maxPacketDelaySeconds) || maxPacketDelaySeconds < 1 || maxPacketDelaySeconds > 86400) {
    throw new Error("max_packet_delay_invalid");
  }
  const payload = {
    schema: RELEASE_GATE_REVIEW_PACKET_POLICY_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    admissionPolicyHash: admissionPolicy.policyHash,
    evaluationPolicyHash: evaluationPolicy.policyHash,
    maxPacketDelaySeconds,
    requireRevalidatedEvaluation: true,
    requireFreshEvidenceAtPreparation: true,
    humanReviewRequired: true,
    approvalMayNotBeInferred: true,
    automaticGateExecution: false,
    automaticApproval: false,
    automaticReleaseMemoryUpdate: false,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectReleaseGateReviewPacketPolicy(policy, context) {
  try {
    const recreated = createReleaseGateReviewPacketPolicy({
      ...context,
      maxPacketDelaySeconds: policy?.maxPacketDelaySeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "review_packet_policy_invalid" };
  }
}

function reviewerRoles(matrix) {
  return [...new Set(matrix.modules.flatMap((module) => module.gates.map((gate) => gate.ownerRole)))].sort();
}

function reviewModules(matrix) {
  return matrix.modules.map((module) => ({
    moduleId: module.moduleId,
    revision: module.revision,
    entryHash: module.entryHash,
    gates: module.gates.map((gate) => ({
      gate: gate.gate,
      reviewerRole: gate.ownerRole,
      requiredEvidence: gate.requiredEvidence,
      acceptedEvidence: gate.acceptedEvidence,
      missingEvidence: gate.missingEvidence,
      evidenceSatisfied: gate.satisfied,
      reviewStatus: gate.satisfied ? "awaiting_human_review" : "blocked_missing_evidence",
      humanDecisionRecorded: false,
    })),
  }));
}

function rejectedPayload({ decision, plan, admissionPolicy, evaluationPolicy, packetPolicy, evaluationResult, preparedAt, reasons }) {
  return {
    schema: RELEASE_GATE_REVIEW_PACKET_SCHEMA,
    compositionId: decision?.compositionId ?? null,
    compositionDecisionHash: decision?.decisionHash ?? null,
    evidencePlanHash: plan?.planHash ?? null,
    admissionPolicyHash: admissionPolicy?.policyHash ?? null,
    evaluationPolicyHash: evaluationPolicy?.policyHash ?? null,
    reviewPacketPolicyHash: packetPolicy?.policyHash ?? null,
    evaluationResultHash: evaluationResult?.resultHash ?? null,
    admissionResultHashes: [],
    evaluatedAt: evaluationResult?.evaluatedAt ?? null,
    preparedAt,
    status: "rejected",
    rejectionReasons: [...new Set(reasons)].sort(),
    sourceMatrixHash: null,
    reviewMatrixHash: null,
    matrixSummary: null,
    invalidEvidence: [],
    modules: [],
    reviewerRoles: [],
    evidenceRevalidatedAtPreparation: false,
    humanReviewRequired: true,
    approvalRecorded: false,
    gatesExecuted: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
    releasePromoted: false,
  };
}

export function prepareReleaseGateReviewPacket({
  decision,
  plan,
  intakePolicy,
  provenancePolicy,
  admissionPolicy,
  evaluationPolicy,
  packetPolicy,
  admissions = [],
  evaluationResult,
  preparedAt,
}) {
  assertIsoDate(preparedAt, "prepared_at");
  const reasons = [];
  const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy };
  try {
    assertContext(context);
  } catch (error) {
    reasons.push(`context_invalid:${error instanceof Error ? error.message : "unknown"}`);
  }
  const policyInspection = reasons.length === 0
    ? inspectReleaseGateReviewPacketPolicy(packetPolicy, context)
    : { ok: false, reason: "context_invalid" };
  if (!policyInspection.ok) reasons.push(`review_packet_policy_invalid:${policyInspection.reason}`);

  const evaluationContext = { ...context, admissions };
  const evaluationInspection = reasons.length === 0
    ? inspectAdmittedEvidenceMatrixEvaluationResult(evaluationResult, evaluationContext)
    : { ok: false, reason: "context_invalid" };
  if (!evaluationInspection.ok) reasons.push(`evaluation_result_invalid:${evaluationInspection.reason}`);
  else if (!evaluationInspection.evaluated) reasons.push("evaluation_result_not_evaluated");

  if (evaluationInspection.ok) {
    if (Date.parse(preparedAt) < Date.parse(evaluationResult.evaluatedAt)) reasons.push("packet_prepared_before_evaluation");
    if (Date.parse(preparedAt) - Date.parse(evaluationResult.evaluatedAt) > packetPolicy.maxPacketDelaySeconds * 1000) {
      reasons.push("packet_preparation_window_expired");
    }
  }

  let sourceMatrix = null;
  let reviewMatrix = null;
  if (reasons.length === 0) {
    try {
      const records = admissions.flatMap((batch) => extractAdmittedEvidenceRecords(batch.admissionResult, batch.intake));
      sourceMatrix = evaluateReleaseGateEvidenceMatrix({
        decision,
        plan,
        records,
        evaluatedAt: evaluationResult.evaluatedAt,
      });
      if (sourceMatrix.matrixHash !== evaluationResult.matrixHash) reasons.push("source_matrix_hash_mismatch");
      reviewMatrix = evaluateReleaseGateEvidenceMatrix({ decision, plan, records, evaluatedAt: preparedAt });
    } catch (error) {
      reasons.push(`matrix_revalidation_failed:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  let payload;
  if (reasons.length > 0 || !sourceMatrix || !reviewMatrix) {
    payload = rejectedPayload({ decision, plan, admissionPolicy, evaluationPolicy, packetPolicy, evaluationResult, preparedAt, reasons });
  } else {
    const complete = evaluationResult.evidenceCoverageComplete === true
      && sourceMatrix.summary.allEvidenceSatisfied === true
      && reviewMatrix.summary.allEvidenceSatisfied === true;
    payload = {
      schema: RELEASE_GATE_REVIEW_PACKET_SCHEMA,
      compositionId: decision.compositionId,
      compositionDecisionHash: decision.decisionHash,
      evidencePlanHash: plan.planHash,
      admissionPolicyHash: admissionPolicy.policyHash,
      evaluationPolicyHash: evaluationPolicy.policyHash,
      reviewPacketPolicyHash: packetPolicy.policyHash,
      evaluationResultHash: evaluationResult.resultHash,
      admissionResultHashes: [...evaluationResult.admissionResultHashes],
      evaluatedAt: evaluationResult.evaluatedAt,
      preparedAt,
      status: complete ? "ready_for_human_review" : "blocked_incomplete_evidence",
      rejectionReasons: [],
      sourceMatrixHash: sourceMatrix.matrixHash,
      reviewMatrixHash: reviewMatrix.matrixHash,
      matrixSummary: reviewMatrix.summary,
      invalidEvidence: reviewMatrix.invalidEvidence,
      modules: reviewModules(reviewMatrix),
      reviewerRoles: reviewerRoles(reviewMatrix),
      evidenceRevalidatedAtPreparation: true,
      humanReviewRequired: true,
      approvalRecorded: false,
      gatesExecuted: false,
      releaseMemoryUpdated: false,
      packageGenerated: false,
      deployExecuted: false,
      releasePromoted: false,
    };
  }
  return { ...payload, packetHash: digest(payload) };
}

export function inspectReleaseGateReviewPacket(packet, context) {
  try {
    if (packet?.schema !== RELEASE_GATE_REVIEW_PACKET_SCHEMA) throw new Error("review_packet_schema_invalid");
    assertIsoDate(packet.preparedAt, "prepared_at");
    const recreated = prepareReleaseGateReviewPacket({ ...context, preparedAt: packet.preparedAt });
    if (recreated.packetHash !== packet.packetHash) return { ok: false, reason: "review_packet_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(packet)) return { ok: false, reason: "review_packet_contract_mismatch" };
    return {
      ok: true,
      packetHash: packet.packetHash,
      readyForHumanReview: packet.status === "ready_for_human_review",
      blocked: packet.status === "blocked_incomplete_evidence",
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "review_packet_invalid" };
  }
}

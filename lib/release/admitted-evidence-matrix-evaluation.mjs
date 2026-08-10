import { createHash } from "node:crypto";
import {
  evaluateReleaseGateEvidenceMatrix,
  inspectReleaseGateEvidencePlan,
} from "./release-gate-evidence-matrix.mjs";
import {
  extractAdmittedEvidenceRecords,
  inspectReleaseEvidenceAdmissionPolicy,
  inspectReleaseEvidenceAdmissionResult,
} from "./release-evidence-admission.mjs";

export const ADMITTED_EVIDENCE_MATRIX_EVALUATION_POLICY_SCHEMA = "atlas.admitted-evidence-matrix-evaluation-policy.v1";
export const ADMITTED_EVIDENCE_MATRIX_EVALUATION_RESULT_SCHEMA = "atlas.admitted-evidence-matrix-evaluation-result.v1";

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

function assertContext({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy }) {
  const planInspection = inspectReleaseGateEvidencePlan(plan);
  if (!planInspection.ok) throw new Error(`evidence_plan_invalid:${planInspection.reason}`);
  if (plan.compositionId !== decision?.compositionId || plan.compositionDecisionHash !== decision?.decisionHash) throw new Error("composition_binding_invalid");
  const admissionInspection = inspectReleaseEvidenceAdmissionPolicy(admissionPolicy, {
    decision,
    plan,
    intakePolicy,
    provenancePolicy,
  });
  if (!admissionInspection.ok) throw new Error(`admission_policy_invalid:${admissionInspection.reason}`);
}

export function createAdmittedEvidenceMatrixEvaluationPolicy({
  decision,
  plan,
  intakePolicy,
  provenancePolicy,
  admissionPolicy,
  maxEvaluationDelaySeconds = 600,
  maxAdmissionsPerEvaluation = 50,
}) {
  assertContext({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
  if (!Number.isInteger(maxEvaluationDelaySeconds) || maxEvaluationDelaySeconds < 1 || maxEvaluationDelaySeconds > 86400) throw new Error("max_evaluation_delay_invalid");
  if (!Number.isInteger(maxAdmissionsPerEvaluation) || maxAdmissionsPerEvaluation < 1 || maxAdmissionsPerEvaluation > 500) throw new Error("max_admissions_per_evaluation_invalid");
  const payload = {
    schema: ADMITTED_EVIDENCE_MATRIX_EVALUATION_POLICY_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    admissionPolicyHash: admissionPolicy.policyHash,
    maxEvaluationDelaySeconds,
    maxAdmissionsPerEvaluation,
    requireRevalidatedAdmission: true,
    evaluateAdmittedRecordsOnly: true,
    allowIncompleteCoverage: true,
    automaticGateExecution: false,
    automaticReleaseMemoryUpdate: false,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectAdmittedEvidenceMatrixEvaluationPolicy(policy, context) {
  try {
    const recreated = createAdmittedEvidenceMatrixEvaluationPolicy({
      ...context,
      maxEvaluationDelaySeconds: policy?.maxEvaluationDelaySeconds,
      maxAdmissionsPerEvaluation: policy?.maxAdmissionsPerEvaluation,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "evaluation_policy_invalid" };
  }
}

export function evaluateAdmittedEvidenceMatrix({
  decision,
  plan,
  intakePolicy,
  provenancePolicy,
  admissionPolicy,
  evaluationPolicy,
  admissions = [],
  evaluatedAt,
}) {
  assertIsoDate(evaluatedAt, "evaluated_at");
  const rejectionReasons = [];
  try {
    assertContext({ decision, plan, intakePolicy, provenancePolicy, admissionPolicy });
  } catch (error) {
    rejectionReasons.push(`context_invalid:${error instanceof Error ? error.message : "unknown"}`);
  }

  const policyInspection = rejectionReasons.length === 0
    ? inspectAdmittedEvidenceMatrixEvaluationPolicy(evaluationPolicy, {
      decision,
      plan,
      intakePolicy,
      provenancePolicy,
      admissionPolicy,
    })
    : { ok: false, reason: "context_invalid" };
  if (!policyInspection.ok) rejectionReasons.push(`evaluation_policy_invalid:${policyInspection.reason}`);

  if (!Array.isArray(admissions) || admissions.length === 0 || (policyInspection.ok && admissions.length > evaluationPolicy.maxAdmissionsPerEvaluation)) {
    rejectionReasons.push("admission_batch_count_invalid");
  }
  const records = [];
  const admissionResultHashes = [];
  for (const [index, batch] of admissions.entries()) {
    if (rejectionReasons.some((reason) => reason.startsWith("context_invalid:") || reason.startsWith("evaluation_policy_invalid:"))) break;
    const admissionContext = {
      decision,
      plan,
      intakePolicy,
      provenancePolicy,
      admissionPolicy,
      intake: batch?.intake,
      intakeResult: batch?.intakeResult,
      envelope: batch?.envelope,
      provenanceResult: batch?.provenanceResult,
    };
    const admissionInspection = inspectReleaseEvidenceAdmissionResult(batch?.admissionResult, admissionContext);
    if (!admissionInspection.ok || !admissionInspection.admitted) {
      rejectionReasons.push(`admission_invalid:${index}:${admissionInspection.reason ?? "not_admitted"}`);
      continue;
    }
    admissionResultHashes.push(batch.admissionResult.resultHash);
    if (Date.parse(evaluatedAt) < Date.parse(batch.admissionResult.admittedAt)) rejectionReasons.push(`evaluation_before_admission:${index}`);
    if (Date.parse(evaluatedAt) - Date.parse(batch.admissionResult.admittedAt) > evaluationPolicy.maxEvaluationDelaySeconds * 1000) rejectionReasons.push(`evaluation_window_expired:${index}`);
    const extracted = extractAdmittedEvidenceRecords(batch.admissionResult, batch.intake);
    if (extracted.length !== batch.admissionResult.recordsAdmitted) rejectionReasons.push(`admitted_record_manifest_mismatch:${index}`);
    records.push(...extracted);
  }
  const evidenceIds = records.map((record) => record.evidenceId);
  const recordHashes = records.map((record) => record.recordHash);
  if (new Set(evidenceIds).size !== evidenceIds.length) rejectionReasons.push("duplicate_evidence_id_across_admissions");
  if (new Set(recordHashes).size !== recordHashes.length) rejectionReasons.push("duplicate_record_hash_across_admissions");
  if (new Set(admissionResultHashes).size !== admissionResultHashes.length) rejectionReasons.push("duplicate_admission_result");

  let matrix = null;
  if (rejectionReasons.length === 0) {
    try {
      matrix = evaluateReleaseGateEvidenceMatrix({ decision, plan, records, evaluatedAt });
    } catch (error) {
      rejectionReasons.push(`matrix_evaluation_failed:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  const reasons = [...new Set(rejectionReasons)].sort();
  const evaluated = reasons.length === 0 && matrix !== null;
  const complete = evaluated && matrix.summary.allEvidenceSatisfied === true;
  const payload = {
    schema: ADMITTED_EVIDENCE_MATRIX_EVALUATION_RESULT_SCHEMA,
    compositionId: decision?.compositionId ?? null,
    compositionDecisionHash: decision?.decisionHash ?? null,
    evidencePlanHash: plan?.planHash ?? null,
    admissionPolicyHash: admissionPolicy?.policyHash ?? null,
    evaluationPolicyHash: policyInspection.ok ? evaluationPolicy.policyHash : null,
    admissionResultHashes: reasons.length === 0 ? [...admissionResultHashes].sort() : [],
    evaluatedAt,
    status: evaluated ? (complete ? "matrix_evaluated_complete" : "matrix_evaluated_incomplete") : "rejected",
    rejectionReasons: reasons,
    recordsEvaluated: evaluated ? records.length : 0,
    evidenceMatrixEvaluated: evaluated,
    evidenceCoverageComplete: complete,
    matrixHash: evaluated ? matrix.matrixHash : null,
    matrixSummary: evaluated ? matrix.summary : null,
    gatesExecuted: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  return { ...payload, resultHash: digest(payload) };
}

export function inspectAdmittedEvidenceMatrixEvaluationResult(result, context) {
  try {
    if (result?.schema !== ADMITTED_EVIDENCE_MATRIX_EVALUATION_RESULT_SCHEMA) throw new Error("evaluation_result_schema_invalid");
    assertIsoDate(result.evaluatedAt, "evaluated_at");
    const recreated = evaluateAdmittedEvidenceMatrix({ ...context, evaluatedAt: result.evaluatedAt });
    if (recreated.resultHash !== result.resultHash) return { ok: false, reason: "evaluation_result_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(result)) return { ok: false, reason: "evaluation_result_contract_mismatch" };
    return {
      ok: true,
      resultHash: result.resultHash,
      evaluated: result.evidenceMatrixEvaluated,
      complete: result.evidenceCoverageComplete,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "evaluation_result_invalid" };
  }
}

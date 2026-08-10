import { createHash } from "node:crypto";
import { inspectReleaseGateEvidencePlan, inspectReleaseGateEvidenceRecord } from "./release-gate-evidence-matrix.mjs";
import { inspectReleaseEvidenceIntake, inspectReleaseEvidenceIntakePolicy } from "./release-evidence-intake.mjs";
import {
  inspectReleaseEvidenceProvenancePolicy,
  RELEASE_EVIDENCE_PROVENANCE_RESULT_SCHEMA,
  verifyReleaseEvidenceProvenance,
} from "./release-evidence-provenance.mjs";

export const RELEASE_EVIDENCE_ADMISSION_POLICY_SCHEMA = "atlas.release-evidence-admission-policy.v1";
export const RELEASE_EVIDENCE_ADMISSION_RESULT_SCHEMA = "atlas.release-evidence-admission-result.v1";

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

function assertContext({ decision, plan, intakePolicy, provenancePolicy }) {
  const planInspection = inspectReleaseGateEvidencePlan(plan);
  if (!planInspection.ok) throw new Error(`evidence_plan_invalid:${planInspection.reason}`);
  if (plan.compositionId !== decision?.compositionId || plan.compositionDecisionHash !== decision?.decisionHash) throw new Error("composition_binding_invalid");
  const intakePolicyInspection = inspectReleaseEvidenceIntakePolicy(intakePolicy, { decision, plan });
  if (!intakePolicyInspection.ok) throw new Error(`intake_policy_invalid:${intakePolicyInspection.reason}`);
  const provenancePolicyInspection = inspectReleaseEvidenceProvenancePolicy(provenancePolicy, { decision, plan, intakePolicy });
  if (!provenancePolicyInspection.ok) throw new Error(`provenance_policy_invalid:${provenancePolicyInspection.reason}`);
}

export function createReleaseEvidenceAdmissionPolicy({
  decision,
  plan,
  intakePolicy,
  provenancePolicy,
  maxRecordsPerAdmission = 50,
  maxAdmissionDelaySeconds = 600,
}) {
  assertContext({ decision, plan, intakePolicy, provenancePolicy });
  if (!Number.isInteger(maxRecordsPerAdmission) || maxRecordsPerAdmission < 1 || maxRecordsPerAdmission > intakePolicy.maxRecords) throw new Error("max_records_per_admission_invalid");
  if (!Number.isInteger(maxAdmissionDelaySeconds) || maxAdmissionDelaySeconds < 1 || maxAdmissionDelaySeconds > 86400) throw new Error("max_admission_delay_invalid");
  const payload = {
    schema: RELEASE_EVIDENCE_ADMISSION_POLICY_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    intakePolicyHash: intakePolicy.policyHash,
    provenancePolicyHash: provenancePolicy.policyHash,
    maxRecordsPerAdmission,
    maxAdmissionDelaySeconds,
    atomicAdmission: true,
    rejectExpiredEvidence: true,
    rejectDuplicateEvidence: true,
    requireExactProvenanceResult: true,
    automaticEvidenceMatrixEvaluation: false,
    automaticGateExecution: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectReleaseEvidenceAdmissionPolicy(policy, context) {
  try {
    const recreated = createReleaseEvidenceAdmissionPolicy({
      ...context,
      maxRecordsPerAdmission: policy?.maxRecordsPerAdmission,
      maxAdmissionDelaySeconds: policy?.maxAdmissionDelaySeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "admission_policy_invalid" };
  }
}

function provenanceResultMatches(provenanceResult, expectedResult) {
  return provenanceResult?.schema === RELEASE_EVIDENCE_PROVENANCE_RESULT_SCHEMA
    && JSON.stringify(provenanceResult) === JSON.stringify(expectedResult);
}

export function admitReleaseEvidenceToMatrix({
  decision,
  plan,
  intakePolicy,
  provenancePolicy,
  admissionPolicy,
  intake,
  intakeResult,
  envelope,
  provenanceResult,
  admittedAt,
  seenIntakeHashes = [],
  seenEvidenceIds = [],
  seenRecordHashes = [],
}) {
  assertIsoDate(admittedAt, "admitted_at");
  const rejectionReasons = [];
  try {
    assertContext({ decision, plan, intakePolicy, provenancePolicy });
  } catch (error) {
    rejectionReasons.push(`context_invalid:${error instanceof Error ? error.message : "unknown"}`);
  }
  const policyInspection = rejectionReasons.length === 0
    ? inspectReleaseEvidenceAdmissionPolicy(admissionPolicy, { decision, plan, intakePolicy, provenancePolicy })
    : { ok: false, reason: "context_invalid" };
  if (!policyInspection.ok) rejectionReasons.push(`admission_policy_invalid:${policyInspection.reason}`);
  const intakeInspection = rejectionReasons.length === 0
    ? inspectReleaseEvidenceIntake(intake, { decision, plan, policy: intakePolicy })
    : { ok: false, reason: "context_invalid" };
  if (!intakeInspection.ok) rejectionReasons.push(`intake_invalid:${intakeInspection.reason}`);

  let expectedProvenanceResult = null;
  if (rejectionReasons.length === 0 && provenanceResult?.schema === RELEASE_EVIDENCE_PROVENANCE_RESULT_SCHEMA) {
    try {
      expectedProvenanceResult = verifyReleaseEvidenceProvenance({
        decision,
        plan,
        intakePolicy,
        provenancePolicy,
        intake,
        intakeResult,
        envelope,
        verifiedAt: provenanceResult.verifiedAt,
      });
    } catch {
      rejectionReasons.push("provenance_result_reverification_failed");
    }
  }
  if (!expectedProvenanceResult || !provenanceResultMatches(provenanceResult, expectedProvenanceResult)) rejectionReasons.push("provenance_result_invalid_or_tampered");
  if (expectedProvenanceResult && (!expectedProvenanceResult.provenanceVerified || expectedProvenanceResult.status !== "provenance_verified")) rejectionReasons.push("provenance_not_verified");

  const records = intakeInspection.ok ? intake.records : [];
  if (policyInspection.ok && (records.length === 0 || records.length > admissionPolicy.maxRecordsPerAdmission)) rejectionReasons.push("admission_record_count_invalid");
  if (expectedProvenanceResult) {
    if (Date.parse(admittedAt) < Date.parse(expectedProvenanceResult.verifiedAt)) rejectionReasons.push("admission_before_provenance_verification");
    if (Date.parse(admittedAt) - Date.parse(expectedProvenanceResult.verifiedAt) > admissionPolicy.maxAdmissionDelaySeconds * 1000) rejectionReasons.push("admission_window_expired");
  }
  if (intakeInspection.ok && seenIntakeHashes.includes(intake.intakeHash)) rejectionReasons.push("intake_already_admitted");

  const evidenceIds = records.map((record) => record.evidenceId);
  const recordHashes = records.map((record) => record.recordHash);
  if (new Set(evidenceIds).size !== evidenceIds.length) rejectionReasons.push("duplicate_evidence_id_in_admission");
  if (new Set(recordHashes).size !== recordHashes.length) rejectionReasons.push("duplicate_record_hash_in_admission");
  if (evidenceIds.some((value) => seenEvidenceIds.includes(value))) rejectionReasons.push("evidence_id_already_admitted");
  if (recordHashes.some((value) => seenRecordHashes.includes(value))) rejectionReasons.push("record_hash_already_admitted");
  for (const record of records) {
    const inspection = inspectReleaseGateEvidenceRecord(record);
    if (!inspection.ok) rejectionReasons.push(`record_invalid:${record?.evidenceId ?? "unknown"}:${inspection.reason}`);
    else if (Date.parse(record.validUntil) < Date.parse(admittedAt)) rejectionReasons.push(`record_expired:${record.evidenceId}`);
  }

  const reasons = [...new Set(rejectionReasons)].sort();
  const admitted = policyInspection.ok && intakeInspection.ok && expectedProvenanceResult?.provenanceVerified === true && reasons.length === 0;
  const admittedRecordManifest = admitted
    ? records.map(({ evidenceId, recordHash }) => ({ evidenceId, recordHash }))
    : [];
  const payload = {
    schema: RELEASE_EVIDENCE_ADMISSION_RESULT_SCHEMA,
    compositionId: decision?.compositionId ?? null,
    compositionDecisionHash: decision?.decisionHash ?? null,
    evidencePlanHash: plan?.planHash ?? null,
    admissionPolicyHash: policyInspection.ok ? admissionPolicy.policyHash : null,
    intakeId: intakeInspection.ok ? intake.intakeId : null,
    intakeHash: intakeInspection.ok ? intake.intakeHash : null,
    provenanceResultHash: expectedProvenanceResult ? expectedProvenanceResult.resultHash : null,
    admittedAt,
    status: admitted ? "admitted_to_evidence_matrix" : "quarantined",
    rejectionReasons: reasons,
    recordsReceived: records.length,
    recordsAdmitted: admitted ? records.length : 0,
    admittedRecordManifest,
    provenanceVerified: admitted,
    eligibleForEvidenceMatrix: admitted,
    evidenceMatrixEvaluated: false,
    gatesExecuted: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
  };
  return { ...payload, resultHash: digest(payload) };
}

export function inspectReleaseEvidenceAdmissionResult(result, context) {
  try {
    if (result?.schema !== RELEASE_EVIDENCE_ADMISSION_RESULT_SCHEMA) throw new Error("admission_result_schema_invalid");
    assertIsoDate(result.admittedAt, "admitted_at");
    const recreated = admitReleaseEvidenceToMatrix({ ...context, admittedAt: result.admittedAt });
    if (recreated.resultHash !== result.resultHash) return { ok: false, reason: "admission_result_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(result)) return { ok: false, reason: "admission_result_contract_mismatch" };
    return { ok: true, resultHash: result.resultHash, admitted: result.status === "admitted_to_evidence_matrix" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "admission_result_invalid" };
  }
}

export function extractAdmittedEvidenceRecords(admissionResult, intake) {
  if (admissionResult?.schema !== RELEASE_EVIDENCE_ADMISSION_RESULT_SCHEMA
    || admissionResult.status !== "admitted_to_evidence_matrix"
    || admissionResult.eligibleForEvidenceMatrix !== true
    || admissionResult.evidenceMatrixEvaluated !== false
    || admissionResult.gatesExecuted !== false
    || admissionResult.releaseMemoryUpdated !== false
    || admissionResult.packageGenerated !== false
    || admissionResult.deployExecuted !== false) return [];
  const { resultHash, ...payload } = admissionResult;
  if (digest(payload) !== resultHash) return [];
  const manifest = new Map(admissionResult.admittedRecordManifest.map((item) => [item.evidenceId, item.recordHash]));
  return intake.records.filter((record) => manifest.get(record.evidenceId) === record.recordHash);
}

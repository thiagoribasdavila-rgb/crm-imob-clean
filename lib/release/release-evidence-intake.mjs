import { createHash } from "node:crypto";
import {
  inspectReleaseGateEvidencePlan,
  inspectReleaseGateEvidenceRecord,
  RELEASE_GATE_EVIDENCE_PLAN_SCHEMA,
} from "./release-gate-evidence-matrix.mjs";
import { RELEASE_COMPOSITION_DECISION_SCHEMA } from "./release-composition-eligibility.mjs";

export const RELEASE_EVIDENCE_INTAKE_POLICY_SCHEMA = "atlas.release-evidence-intake-policy.v1";
export const RELEASE_EVIDENCE_INTAKE_SCHEMA = "atlas.release-evidence-intake.v1";
export const RELEASE_EVIDENCE_INTAKE_RESULT_SCHEMA = "atlas.release-evidence-intake-result.v1";

export const RELEASE_EVIDENCE_INTAKE_CHANNELS = Object.freeze([
  "ci_artifact",
  "governance_portal",
  "isolated_handoff",
]);

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

function assertHash(value, field) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`);
}

function assertSlug(value, field) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`);
}

function assertRole(value, field) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`);
}

function assertIsoDate(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`);
}

function assertDecisionAndPlan(decision, plan) {
  if (!decision || decision.schema !== RELEASE_COMPOSITION_DECISION_SCHEMA) throw new Error("composition_decision_invalid");
  assertHash(decision.decisionHash, "composition_decision_hash");
  if (!plan || plan.schema !== RELEASE_GATE_EVIDENCE_PLAN_SCHEMA) throw new Error("evidence_plan_invalid");
  const inspection = inspectReleaseGateEvidencePlan(plan);
  if (!inspection.ok) throw new Error(`evidence_plan_invalid:${inspection.reason}`);
  if (plan.compositionId !== decision.compositionId) throw new Error("composition_id_mismatch");
  if (plan.compositionDecisionHash !== decision.decisionHash) throw new Error("composition_decision_hash_mismatch");
}

function safeArtifactReference(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 240
    && !value.startsWith("/")
    && !value.includes("\\")
    && !value.split("/").includes("..")
    && !/^[a-z][a-z0-9+.-]*:/i.test(value)
    && !value.includes("\0");
}

export function createReleaseEvidenceIntakePolicy({ decision, plan, maxRecords = 50, maxClockSkewSeconds = 300 }) {
  assertDecisionAndPlan(decision, plan);
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 500) throw new Error("max_records_invalid");
  if (!Number.isInteger(maxClockSkewSeconds) || maxClockSkewSeconds < 0 || maxClockSkewSeconds > 3600) throw new Error("max_clock_skew_invalid");
  const payload = {
    schema: RELEASE_EVIDENCE_INTAKE_POLICY_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    acceptedChannels: [...RELEASE_EVIDENCE_INTAKE_CHANNELS],
    maxRecords,
    maxClockSkewSeconds,
    atomicIntake: true,
    provenanceRequiredBeforeMatrix: true,
    automaticGateExecution: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectReleaseEvidenceIntakePolicy(policy, { decision, plan }) {
  try {
    const recreated = createReleaseEvidenceIntakePolicy({
      decision,
      plan,
      maxRecords: policy?.maxRecords,
      maxClockSkewSeconds: policy?.maxClockSkewSeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "intake_policy_invalid" };
  }
}

export function createReleaseEvidenceIntake({ decision, plan, policy, intakeId, submitter, channel, submittedAt, records }) {
  assertDecisionAndPlan(decision, plan);
  const policyInspection = inspectReleaseEvidenceIntakePolicy(policy, { decision, plan });
  if (!policyInspection.ok) throw new Error(`intake_policy_invalid:${policyInspection.reason}`);
  assertSlug(intakeId, "intake_id");
  assertSlug(submitter?.actorId, "submitter_actor_id");
  assertRole(submitter?.role, "submitter_role");
  if (!policy.acceptedChannels.includes(channel)) throw new Error("intake_channel_invalid");
  assertIsoDate(submittedAt, "submitted_at");
  if (!Array.isArray(records) || records.length === 0 || records.length > policy.maxRecords) throw new Error("intake_records_invalid");
  const normalizedRecords = [...records].sort((a, b) => `${a?.evidenceId}`.localeCompare(`${b?.evidenceId}`));
  const payload = {
    schema: RELEASE_EVIDENCE_INTAKE_SCHEMA,
    intakeId,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    policyHash: policy.policyHash,
    submitter: { actorId: submitter.actorId, role: submitter.role },
    channel,
    submittedAt,
    records: normalizedRecords,
    recordManifest: normalizedRecords.map((record) => ({ evidenceId: record?.evidenceId ?? null, recordHash: record?.recordHash ?? null })),
  };
  return { ...payload, intakeHash: digest(payload) };
}

export function inspectReleaseEvidenceIntake(intake, context) {
  try {
    const recreated = createReleaseEvidenceIntake({
      ...context,
      intakeId: intake?.intakeId,
      submitter: intake?.submitter,
      channel: intake?.channel,
      submittedAt: intake?.submittedAt,
      records: intake?.records,
    });
    if (recreated.intakeHash !== intake?.intakeHash) return { ok: false, reason: "intake_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(intake)) return { ok: false, reason: "intake_contract_mismatch" };
    return { ok: true, intakeHash: recreated.intakeHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "intake_invalid" };
  }
}

export function processReleaseEvidenceIntake({
  decision,
  plan,
  policy,
  intake,
  receivedAt,
  seenIntakeHashes = [],
  seenEvidenceIds = [],
  seenRecordHashes = [],
}) {
  assertDecisionAndPlan(decision, plan);
  assertIsoDate(receivedAt, "received_at");
  const rejectionReasons = [];
  const inspection = inspectReleaseEvidenceIntake(intake, { decision, plan, policy });
  if (!inspection.ok) rejectionReasons.push(`intake_invalid:${inspection.reason}`);
  if (inspection.ok && seenIntakeHashes.includes(intake.intakeHash)) rejectionReasons.push("intake_replay_detected");

  const records = inspection.ok ? intake.records : [];
  const evidenceIds = records.map((record) => record.evidenceId);
  const recordHashes = records.map((record) => record.recordHash);
  if (new Set(evidenceIds).size !== evidenceIds.length) rejectionReasons.push("duplicate_evidence_id_in_intake");
  if (new Set(recordHashes).size !== recordHashes.length) rejectionReasons.push("duplicate_record_hash_in_intake");
  if (evidenceIds.some((id) => seenEvidenceIds.includes(id))) rejectionReasons.push("evidence_id_replay_detected");
  if (recordHashes.some((hash) => seenRecordHashes.includes(hash))) rejectionReasons.push("record_hash_replay_detected");

  if (inspection.ok) {
    const latestSubmission = Date.parse(receivedAt) + policy.maxClockSkewSeconds * 1000;
    if (Date.parse(intake.submittedAt) > latestSubmission) rejectionReasons.push("submitted_at_exceeds_clock_skew");
    const requirements = new Set(plan.modules.flatMap((module) => module.gates.flatMap((gate) => gate.requiredEvidence.map((evidenceType) => (
      `${module.moduleId}@${module.revision}:${module.entryHash}:${gate.gate}:${gate.ownerRole}:${evidenceType}`
    )))));
    for (const record of records) {
      const recordInspection = inspectReleaseGateEvidenceRecord(record);
      if (!recordInspection.ok) {
        rejectionReasons.push(`record_invalid:${record.evidenceId ?? "unknown"}:${recordInspection.reason}`);
        continue;
      }
      if (record.compositionDecisionHash !== decision.decisionHash) rejectionReasons.push(`record_wrong_decision:${record.evidenceId}`);
      const requirementKey = `${record.moduleId}@${record.revision}:${record.entryHash}:${record.gate}:${record.ownerRole}:${record.evidenceType}`;
      if (!requirements.has(requirementKey)) rejectionReasons.push(`record_out_of_scope:${record.evidenceId}`);
      if (record.ownerRole !== intake.submitter.role) rejectionReasons.push(`submitter_role_mismatch:${record.evidenceId}`);
      if (Date.parse(record.observedAt) > Date.parse(intake.submittedAt)) rejectionReasons.push(`record_observed_after_submission:${record.evidenceId}`);
      if (Date.parse(record.validUntil) < Date.parse(receivedAt)) rejectionReasons.push(`record_expired:${record.evidenceId}`);
      if (record.artifacts.some((artifact) => !safeArtifactReference(artifact))) rejectionReasons.push(`unsafe_artifact_reference:${record.evidenceId}`);
    }
  }

  const uniqueReasons = [...new Set(rejectionReasons)].sort();
  const acceptedForReview = inspection.ok && uniqueReasons.length === 0;
  const payload = {
    schema: RELEASE_EVIDENCE_INTAKE_RESULT_SCHEMA,
    intakeId: intake?.intakeId ?? null,
    intakeHash: inspection.ok ? intake.intakeHash : null,
    receivedAt,
    status: acceptedForReview ? "accepted_for_provenance_review" : "quarantined",
    rejectionReasons: uniqueReasons,
    recordsReceived: records.length,
    recordsAcceptedForReview: acceptedForReview ? records.length : 0,
    provenanceVerified: false,
    eligibleForEvidenceMatrix: false,
    evidenceMatrixEvaluated: false,
    gatesExecuted: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
  };
  return { ...payload, resultHash: digest(payload) };
}

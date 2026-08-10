import { createHash } from "node:crypto";
import { RELEASE_COMPOSITION_DECISION_SCHEMA } from "./release-composition-eligibility.mjs";

export const RELEASE_GATE_EVIDENCE_PLAN_SCHEMA = "atlas.release-gate-evidence-plan.v1";
export const RELEASE_GATE_EVIDENCE_RECORD_SCHEMA = "atlas.release-gate-evidence-record.v1";
export const RELEASE_GATE_EVIDENCE_MATRIX_SCHEMA = "atlas.release-gate-evidence-matrix.v1";

export const RELEASE_GATE_REQUIREMENTS = Object.freeze({
  runtimeHomologated: Object.freeze({
    ownerRole: "quality_assurance",
    evidenceTypes: Object.freeze(["authenticated_role_flow_receipt", "tenant_isolation_receipt"]),
  }),
  cleanBuildVerified: Object.freeze({
    ownerRole: "engineering",
    evidenceTypes: Object.freeze(["clean_install_receipt", "production_build_receipt"]),
  }),
  rollbackReady: Object.freeze({
    ownerRole: "operations",
    evidenceTypes: Object.freeze(["backup_integrity_receipt", "restore_rehearsal_receipt"]),
  }),
  directorApproved: Object.freeze({
    ownerRole: "director",
    evidenceTypes: Object.freeze(["director_approval_receipt"]),
  }),
});

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

function assertIsoDate(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`);
}

function assertDecision(decision) {
  if (!decision || decision.schema !== RELEASE_COMPOSITION_DECISION_SCHEMA) throw new Error("composition_decision_invalid");
  assertHash(decision.decisionHash, "composition_decision_hash");
  if (!Array.isArray(decision.closure) || decision.closure.length === 0) throw new Error("composition_closure_empty");
}

export function createReleaseGateEvidencePlan({ decision }) {
  assertDecision(decision);
  const modules = decision.closure.map((module) => ({
    moduleId: module.moduleId,
    revision: module.revision,
    entryHash: module.entryHash,
    gates: Object.entries(RELEASE_GATE_REQUIREMENTS).map(([gate, requirement]) => ({
      gate,
      ownerRole: requirement.ownerRole,
      requiredEvidence: [...requirement.evidenceTypes],
    })),
  })).sort((a, b) => `${a.moduleId}@${a.revision}`.localeCompare(`${b.moduleId}@${b.revision}`));
  const payload = {
    schema: RELEASE_GATE_EVIDENCE_PLAN_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    modules,
  };
  return { ...payload, planHash: digest(payload) };
}

export function inspectReleaseGateEvidencePlan(plan) {
  try {
    const modules = plan?.modules ?? [];
    const fakeDecision = {
      schema: RELEASE_COMPOSITION_DECISION_SCHEMA,
      compositionId: plan?.compositionId,
      decisionHash: plan?.compositionDecisionHash,
      closure: modules.map(({ moduleId, revision, entryHash }) => ({ moduleId, revision, entryHash })),
    };
    const recreated = createReleaseGateEvidencePlan({ decision: fakeDecision });
    if (recreated.planHash !== plan?.planHash) return { ok: false, reason: "plan_hash_mismatch" };
    if (JSON.stringify(recreated.modules) !== JSON.stringify(modules)) return { ok: false, reason: "plan_contract_mismatch" };
    return { ok: true, planHash: recreated.planHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "evidence_plan_invalid" };
  }
}

export function createReleaseGateEvidenceRecord(input) {
  if (!input || typeof input !== "object") throw new Error("evidence_record_invalid");
  if (typeof input.evidenceId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.evidenceId)) throw new Error("evidence_id_invalid");
  if (typeof input.moduleId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.moduleId)) throw new Error("module_id_invalid");
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error("revision_invalid");
  assertHash(input.entryHash, "entry_hash");
  assertHash(input.compositionDecisionHash, "composition_decision_hash");
  if (!RELEASE_GATE_REQUIREMENTS[input.gate]) throw new Error("gate_invalid");
  if (!RELEASE_GATE_REQUIREMENTS[input.gate].evidenceTypes.includes(input.evidenceType)) throw new Error("evidence_type_invalid");
  if (typeof input.ownerRole !== "string" || input.ownerRole !== RELEASE_GATE_REQUIREMENTS[input.gate].ownerRole) throw new Error("owner_role_invalid");
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0 || input.artifacts.some((item) => typeof item !== "string" || item.length === 0)) throw new Error("artifacts_invalid");
  assertHash(input.artifactHash, "artifact_hash");
  assertIsoDate(input.observedAt, "observed_at");
  assertIsoDate(input.validUntil, "valid_until");
  if (Date.parse(input.validUntil) <= Date.parse(input.observedAt)) throw new Error("validity_window_invalid");
  if (!["isolated", "staging", "production", "governance"].includes(input.environment)) throw new Error("environment_invalid");
  if (input.result !== "passed") throw new Error("result_not_passed");
  const payload = {
    schema: RELEASE_GATE_EVIDENCE_RECORD_SCHEMA,
    evidenceId: input.evidenceId,
    moduleId: input.moduleId,
    revision: input.revision,
    entryHash: input.entryHash,
    compositionDecisionHash: input.compositionDecisionHash,
    gate: input.gate,
    evidenceType: input.evidenceType,
    ownerRole: input.ownerRole,
    environment: input.environment,
    result: input.result,
    observedAt: input.observedAt,
    validUntil: input.validUntil,
    artifacts: [...input.artifacts].sort(),
    artifactHash: input.artifactHash,
  };
  return { ...payload, recordHash: digest(payload) };
}

export function inspectReleaseGateEvidenceRecord(record) {
  try {
    const recreated = createReleaseGateEvidenceRecord(record);
    if (recreated.recordHash !== record?.recordHash) return { ok: false, reason: "record_hash_mismatch" };
    return { ok: true, recordHash: recreated.recordHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "evidence_record_invalid" };
  }
}

export function evaluateReleaseGateEvidenceMatrix({ decision, plan, records = [], evaluatedAt }) {
  assertDecision(decision);
  const planInspection = inspectReleaseGateEvidencePlan(plan);
  if (!planInspection.ok) throw new Error(`evidence_plan_invalid:${planInspection.reason}`);
  if (plan.compositionDecisionHash !== decision.decisionHash) throw new Error("composition_decision_hash_mismatch");
  assertIsoDate(evaluatedAt, "evaluated_at");

  const validRecords = [];
  const invalidEvidence = [];
  for (const record of records) {
    const inspection = inspectReleaseGateEvidenceRecord(record);
    if (!inspection.ok) {
      invalidEvidence.push({ evidenceId: record?.evidenceId ?? null, reason: inspection.reason });
      continue;
    }
    if (record.compositionDecisionHash !== decision.decisionHash) {
      invalidEvidence.push({ evidenceId: record.evidenceId, reason: "composition_decision_hash_mismatch" });
      continue;
    }
    if (Date.parse(record.validUntil) < Date.parse(evaluatedAt)) {
      invalidEvidence.push({ evidenceId: record.evidenceId, reason: "evidence_expired" });
      continue;
    }
    validRecords.push(record);
  }

  const modules = plan.modules.map((module) => ({
    moduleId: module.moduleId,
    revision: module.revision,
    entryHash: module.entryHash,
    gates: module.gates.map((gate) => {
      const acceptedEvidence = [];
      const missingEvidence = [];
      for (const evidenceType of gate.requiredEvidence) {
        const matches = validRecords.filter((record) => record.moduleId === module.moduleId
          && record.revision === module.revision
          && record.entryHash === module.entryHash
          && record.gate === gate.gate
          && record.evidenceType === evidenceType
          && record.ownerRole === gate.ownerRole);
        if (matches.length === 1) acceptedEvidence.push(matches[0].evidenceId);
        else {
          missingEvidence.push(evidenceType);
          if (matches.length > 1) invalidEvidence.push({ evidenceId: null, reason: `ambiguous_evidence:${module.moduleId}@${module.revision}:${gate.gate}:${evidenceType}` });
        }
      }
      return {
        gate: gate.gate,
        ownerRole: gate.ownerRole,
        requiredEvidence: gate.requiredEvidence,
        acceptedEvidence,
        missingEvidence,
        satisfied: missingEvidence.length === 0,
      };
    }),
  }));
  const gates = modules.flatMap((module) => module.gates);
  const requiredEvidenceItems = gates.reduce((total, gate) => total + gate.requiredEvidence.length, 0);
  const missingEvidenceItems = gates.reduce((total, gate) => total + gate.missingEvidence.length, 0);
  const payload = {
    schema: RELEASE_GATE_EVIDENCE_MATRIX_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    planHash: plan.planHash,
    evaluatedAt,
    modules,
    invalidEvidence: [...invalidEvidence].sort((a, b) => `${a.reason}:${a.evidenceId}`.localeCompare(`${b.reason}:${b.evidenceId}`)),
    summary: {
      modules: modules.length,
      gates: gates.length,
      satisfiedGates: gates.filter((gate) => gate.satisfied).length,
      requiredEvidenceItems,
      missingEvidenceItems,
      invalidEvidenceItems: invalidEvidence.length,
      allEvidenceSatisfied: gates.length > 0 && gates.every((gate) => gate.satisfied) && invalidEvidence.length === 0,
      releaseMemoryUpdated: false,
      packageGenerated: false,
    },
  };
  return { ...payload, matrixHash: digest(payload) };
}

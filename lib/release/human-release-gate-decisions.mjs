import { createHash, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import { inspectReleaseGateReviewPacket, inspectReleaseGateReviewPacketPolicy } from "./release-gate-review-packet.mjs";

export const HUMAN_RELEASE_GATE_DECISION_POLICY_SCHEMA = "atlas.human-release-gate-decision-policy.v1";
export const HUMAN_RELEASE_GATE_DECISION_SCHEMA = "atlas.human-release-gate-decision.v1";
export const HUMAN_RELEASE_GATE_DECISION_REGISTER_SCHEMA = "atlas.human-release-gate-decision-register.v1";
export const HUMAN_RELEASE_GATE_DECISION_SIGNATURE_ALGORITHM = "ed25519";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function baseContext(context) {
  const inspection = inspectReleaseGateReviewPacketPolicy(context.packetPolicy, context);
  if (!inspection.ok) throw new Error(`review_packet_policy_invalid:${inspection.reason}`);
}

export function createHumanReleaseGateDecisionPolicy({
  decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy,
  maxDecisionDelaySeconds = 1800, maxRecordingDelaySeconds = 300, minReasonLength = 12,
}) {
  const context = { decision, plan, intakePolicy, provenancePolicy, admissionPolicy, evaluationPolicy, packetPolicy };
  baseContext(context);
  if (!Number.isInteger(maxDecisionDelaySeconds) || maxDecisionDelaySeconds < 1 || maxDecisionDelaySeconds > 86400) throw new Error("max_decision_delay_invalid");
  if (!Number.isInteger(maxRecordingDelaySeconds) || maxRecordingDelaySeconds < 1 || maxRecordingDelaySeconds > 86400) throw new Error("max_recording_delay_invalid");
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 200) throw new Error("min_reason_length_invalid");
  const payload = {
    schema: HUMAN_RELEASE_GATE_DECISION_POLICY_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    provenancePolicyHash: provenancePolicy.policyHash,
    reviewPacketPolicyHash: packetPolicy.policyHash,
    signatureAlgorithm: HUMAN_RELEASE_GATE_DECISION_SIGNATURE_ALGORITHM,
    allowedOutcomes: ["approved", "rejected"],
    maxDecisionDelaySeconds,
    maxRecordingDelaySeconds,
    minReasonLength,
    exactPacketBindingRequired: true,
    exactModuleGateBindingRequired: true,
    exactReviewerRoleRequired: true,
    uniqueDecisionPerModuleGateRequired: true,
    completeReviewRequiresEveryEligibleGate: true,
    reasonRequired: true,
    signatureRequired: true,
    humanReviewRequired: true,
    automaticGateExecution: false,
    automaticReleaseApproval: false,
    automaticReleaseMemoryUpdate: false,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectHumanReleaseGateDecisionPolicy(policy, context) {
  try {
    const recreated = createHumanReleaseGateDecisionPolicy({
      ...context,
      maxDecisionDelaySeconds: policy?.maxDecisionDelaySeconds,
      maxRecordingDelaySeconds: policy?.maxRecordingDelaySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "human_decision_policy_invalid" };
  }
}

function findGate(packet, moduleId, gateName) {
  const releaseModule = packet.modules.find((item) => item.moduleId === moduleId);
  const gate = releaseModule?.gates.find((item) => item.gate === gateName);
  if (!releaseModule || !gate) throw new Error("module_gate_not_found");
  return { releaseModule, gate };
}

function signingPayload({ packet, decisionPolicy, releaseModule, gate, decisionId, signer, outcome, reason, decidedAt, nonce }) {
  return {
    signingSchema: "atlas.human-release-gate-decision-signing-payload.v1",
    compositionId: packet.compositionId,
    compositionDecisionHash: packet.compositionDecisionHash,
    packetHash: packet.packetHash,
    decisionPolicyHash: decisionPolicy.policyHash,
    decisionId,
    moduleId: releaseModule.moduleId,
    revision: releaseModule.revision,
    entryHash: releaseModule.entryHash,
    gate: gate.gate,
    reviewerRole: gate.reviewerRole,
    evidenceSnapshotHash: digest({ requiredEvidence: gate.requiredEvidence, acceptedEvidence: gate.acceptedEvidence }),
    keyId: signer.keyId,
    actorId: signer.actorId,
    role: signer.role,
    outcome,
    reason,
    decidedAt,
    nonce,
  };
}

function validateDecisionWindow({ packet, policy, decidedAt }) {
  if (Date.parse(decidedAt) < Date.parse(packet.preparedAt)) throw new Error("decision_before_packet_preparation");
  if (Date.parse(decidedAt) - Date.parse(packet.preparedAt) > policy.maxDecisionDelaySeconds * 1000) throw new Error("decision_window_expired");
}

function validateSigner(signer, gate, decidedAt) {
  if (!signer) throw new Error("reviewer_untrusted");
  if (signer.status !== "active") throw new Error("reviewer_inactive");
  if (signer.role !== gate.reviewerRole) throw new Error("reviewer_role_mismatch");
  if (Date.parse(decidedAt) < Date.parse(signer.validFrom) || Date.parse(decidedAt) > Date.parse(signer.validUntil)) throw new Error("reviewer_key_outside_validity");
}

export function createHumanReleaseGateDecision({
  packet, packetContext, decisionPolicy, decisionId, moduleId, gate: gateName,
  keyId, outcome, reason, decidedAt, nonce, privateKey,
}) {
  const packetInspection = inspectReleaseGateReviewPacket(packet, packetContext);
  if (!packetInspection.ok) throw new Error(`review_packet_invalid:${packetInspection.reason}`);
  if (!packetInspection.readyForHumanReview) throw new Error("review_packet_not_ready");
  const policyInspection = inspectHumanReleaseGateDecisionPolicy(decisionPolicy, packetContext);
  if (!policyInspection.ok) throw new Error(`human_decision_policy_invalid:${policyInspection.reason}`);
  assertSlug(decisionId, "decision_id");
  assertSlug(keyId, "key_id");
  assertSlug(nonce, "nonce");
  assertIso(decidedAt, "decided_at");
  if (!decisionPolicy.allowedOutcomes.includes(outcome)) throw new Error("outcome_invalid");
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < decisionPolicy.minReasonLength || normalizedReason.length > 2000) throw new Error("reason_invalid");
  const { releaseModule, gate } = findGate(packet, moduleId, gateName);
  if (!gate.evidenceSatisfied || gate.reviewStatus !== "awaiting_human_review") throw new Error("gate_not_eligible_for_review");
  validateDecisionWindow({ packet, policy: decisionPolicy, decidedAt });
  const signer = packetContext.provenancePolicy.trustedSigners.find((item) => item.keyId === keyId);
  validateSigner(signer, gate, decidedAt);
  const payload = signingPayload({ packet, decisionPolicy, releaseModule, gate, decisionId, signer, outcome, reason: normalizedReason, decidedAt, nonce });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), signer.publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_reviewer");
  const value = { schema: HUMAN_RELEASE_GATE_DECISION_SCHEMA, ...payload, signatureAlgorithm: HUMAN_RELEASE_GATE_DECISION_SIGNATURE_ALGORITHM, signature };
  return { ...value, decisionHash: digest(value) };
}

export function inspectHumanReleaseGateDecision(value, { packet, packetContext, decisionPolicy }) {
  try {
    if (value?.schema !== HUMAN_RELEASE_GATE_DECISION_SCHEMA) throw new Error("decision_schema_invalid");
    const packetInspection = inspectReleaseGateReviewPacket(packet, packetContext);
    if (!packetInspection.ok || !packetInspection.readyForHumanReview) throw new Error("review_packet_not_ready");
    const policyInspection = inspectHumanReleaseGateDecisionPolicy(decisionPolicy, packetContext);
    if (!policyInspection.ok) throw new Error(`human_decision_policy_invalid:${policyInspection.reason}`);
    assertSlug(value.decisionId, "decision_id"); assertSlug(value.keyId, "key_id"); assertSlug(value.nonce, "nonce"); assertIso(value.decidedAt, "decided_at");
    if (!decisionPolicy.allowedOutcomes.includes(value.outcome)) throw new Error("outcome_invalid");
    if (typeof value.reason !== "string" || value.reason !== value.reason.trim() || value.reason.length < decisionPolicy.minReasonLength || value.reason.length > 2000) throw new Error("reason_invalid");
    if (value.packetHash !== packet.packetHash || value.decisionPolicyHash !== decisionPolicy.policyHash) throw new Error("decision_context_binding_invalid");
    const { releaseModule, gate } = findGate(packet, value.moduleId, value.gate);
    if (!gate.evidenceSatisfied || gate.reviewStatus !== "awaiting_human_review") throw new Error("gate_not_eligible_for_review");
    validateDecisionWindow({ packet, policy: decisionPolicy, decidedAt: value.decidedAt });
    const signer = packetContext.provenancePolicy.trustedSigners.find((item) => item.keyId === value.keyId);
    validateSigner(signer, gate, value.decidedAt);
    const payload = signingPayload({ packet, decisionPolicy, releaseModule, gate, decisionId: value.decisionId, signer, outcome: value.outcome, reason: value.reason, decidedAt: value.decidedAt, nonce: value.nonce });
    for (const [key, expected] of Object.entries(payload)) if (value[key] !== expected) throw new Error(`decision_${key}_mismatch`);
    if (value.signatureAlgorithm !== HUMAN_RELEASE_GATE_DECISION_SIGNATURE_ALGORITHM || typeof value.signature !== "string") throw new Error("signature_invalid");
    if (!cryptoVerify(null, bytes(payload), signer.publicKeyPem, Buffer.from(value.signature, "base64url"))) throw new Error("signature_verification_failed");
    const hashPayload = { schema: HUMAN_RELEASE_GATE_DECISION_SCHEMA, ...payload, signatureAlgorithm: value.signatureAlgorithm, signature: value.signature };
    if (digest(hashPayload) !== value.decisionHash) throw new Error("decision_hash_mismatch");
    return { ok: true, decisionHash: value.decisionHash, target: `${releaseModule.moduleId}:${gate.gate}`, outcome: value.outcome };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "human_decision_invalid" };
  }
}

function target(moduleId, gate) { return `${moduleId}:${gate}`; }

export function recordHumanReleaseGateDecisions({ packet, packetContext, decisionPolicy, decisions = [], recordedAt }) {
  assertIso(recordedAt, "recorded_at");
  const rejectionReasons = [];
  const packetInspection = inspectReleaseGateReviewPacket(packet, packetContext);
  if (!packetInspection.ok) rejectionReasons.push(`review_packet_invalid:${packetInspection.reason}`);
  else if (!packetInspection.readyForHumanReview) rejectionReasons.push("review_packet_not_ready");
  const policyInspection = inspectHumanReleaseGateDecisionPolicy(decisionPolicy, packetContext);
  if (!policyInspection.ok) rejectionReasons.push(`human_decision_policy_invalid:${policyInspection.reason}`);
  if (!Array.isArray(decisions)) rejectionReasons.push("decisions_invalid");
  const list = Array.isArray(decisions) ? decisions : [];
  const inspections = list.map((item) => inspectHumanReleaseGateDecision(item, { packet, packetContext, decisionPolicy }));
  inspections.forEach((item, index) => { if (!item.ok) rejectionReasons.push(`decision_${index + 1}_invalid:${item.reason}`); });
  const validTargets = inspections.filter((item) => item.ok).map((item) => item.target);
  if (new Set(validTargets).size !== validTargets.length) rejectionReasons.push("duplicate_module_gate_decision");
  for (const item of list) {
    if (typeof item?.decidedAt !== "string" || Number.isNaN(Date.parse(item.decidedAt))) continue;
    if (Date.parse(recordedAt) < Date.parse(item.decidedAt)) rejectionReasons.push("recorded_before_decision");
    else if (Date.parse(recordedAt) - Date.parse(item.decidedAt) > decisionPolicy.maxRecordingDelaySeconds * 1000) rejectionReasons.push("decision_recording_window_expired");
  }
  const eligible = packet?.modules?.flatMap((module) => module.gates.filter((gate) => gate.reviewStatus === "awaiting_human_review" && gate.evidenceSatisfied).map((gate) => ({ module, gate }))) ?? [];
  const byTarget = new Map(list.map((item) => [target(item.moduleId, item.gate), item]));
  const modules = (packet?.modules ?? []).map((module) => ({
    moduleId: module.moduleId, revision: module.revision, entryHash: module.entryHash,
    gates: module.gates.map((gate) => {
      const item = byTarget.get(target(module.moduleId, gate.gate));
      return {
        gate: gate.gate,
        reviewerRole: gate.reviewerRole,
        evidenceSatisfied: gate.evidenceSatisfied,
        decisionStatus: item ? item.outcome : (gate.reviewStatus === "awaiting_human_review" ? "awaiting_decision" : "ineligible"),
        decisionHash: item?.decisionHash ?? null,
        decisionId: item?.decisionId ?? null,
      };
    }),
  }));
  const approved = eligible.filter(({ module, gate }) => byTarget.get(target(module.moduleId, gate.gate))?.outcome === "approved").length;
  const rejected = eligible.filter(({ module, gate }) => byTarget.get(target(module.moduleId, gate.gate))?.outcome === "rejected").length;
  const missing = eligible.length - approved - rejected;
  const status = rejectionReasons.length > 0 ? "rejected"
    : missing > 0 ? "awaiting_human_decisions"
      : rejected > 0 ? "human_review_complete_rejected" : "human_review_complete_approved";
  const payload = {
    schema: HUMAN_RELEASE_GATE_DECISION_REGISTER_SCHEMA,
    compositionId: packet?.compositionId ?? null,
    compositionDecisionHash: packet?.compositionDecisionHash ?? null,
    packetHash: packet?.packetHash ?? null,
    decisionPolicyHash: decisionPolicy?.policyHash ?? null,
    recordedAt,
    status,
    rejectionReasons: [...new Set(rejectionReasons)].sort(),
    decisionHashes: list.map((item) => item?.decisionHash ?? null).sort(),
    summary: { eligibleGates: eligible.length, approvedGates: approved, rejectedGates: rejected, missingDecisions: missing },
    modules,
    humanDecisionsRecorded: list.length > 0 && rejectionReasons.length === 0,
    explicitReviewComplete: rejectionReasons.length === 0 && missing === 0,
    unanimousExplicitApproval: rejectionReasons.length === 0 && eligible.length > 0 && missing === 0 && rejected === 0,
    gatesExecuted: false,
    releaseApproved: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  return { ...payload, registerHash: digest(payload) };
}

export function inspectHumanReleaseGateDecisionRegister(register, context) {
  try {
    if (register?.schema !== HUMAN_RELEASE_GATE_DECISION_REGISTER_SCHEMA) throw new Error("register_schema_invalid");
    const recreated = recordHumanReleaseGateDecisions({ ...context, recordedAt: register.recordedAt });
    if (recreated.registerHash !== register.registerHash) return { ok: false, reason: "register_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(register)) return { ok: false, reason: "register_contract_mismatch" };
    return { ok: true, status: register.status, registerHash: register.registerHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "human_decision_register_invalid" };
  }
}

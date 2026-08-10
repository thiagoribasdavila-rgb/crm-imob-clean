import { createHash } from "node:crypto";
import {
  inspectFinalReleaseApprovalDecision,
  inspectFinalReleaseApprovalPolicy,
} from "./final-release-approval-decision.mjs";

export const APPROVED_RELEASE_MEMORY_POLICY_SCHEMA = "atlas.approved-release-memory-policy.v1";
export const APPROVED_RELEASE_MEMORY_SCHEMA = "atlas.approved-release-memory.v1";
export const APPROVED_RELEASE_MEMORY_ENTRY_SCHEMA = "atlas.approved-release-memory-entry.v1";

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

function assertIso(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`);
}

function assertHash(value, field) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`);
}

function assertSlug(value, field) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`);
}

export function createApprovedReleaseMemoryPolicy({
  approvalPolicy,
  maxCommitDelaySeconds = 1800,
  ...approvalContext
}) {
  const approvalPolicyInspection = inspectFinalReleaseApprovalPolicy(approvalPolicy, approvalContext);
  if (!approvalPolicyInspection.ok) {
    throw new Error(`final_release_approval_policy_invalid:${approvalPolicyInspection.reason}`);
  }
  if (!Number.isInteger(maxCommitDelaySeconds) || maxCommitDelaySeconds < 1 || maxCommitDelaySeconds > 86400) {
    throw new Error("max_release_memory_commit_delay_invalid");
  }
  const payload = {
    schema: APPROVED_RELEASE_MEMORY_POLICY_SCHEMA,
    compositionId: approvalPolicy.compositionId,
    compositionDecisionHash: approvalPolicy.compositionDecisionHash,
    finalApprovalPolicyHash: approvalPolicy.policyHash,
    finalApprovalDecisionSchema: "atlas.final-release-approval-decision.v1",
    maxCommitDelaySeconds,
    exactFinalApprovalDecisionBindingRequired: true,
    approvedOutcomeRequired: true,
    acceptedGateResultsRequired: true,
    appendOnly: true,
    hashChainRequired: true,
    duplicateApprovalDecisionRejected: true,
    duplicateApprovalIdRejected: true,
    duplicateApprovalNonceRejected: true,
    automaticPackageGeneration: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectApprovedReleaseMemoryPolicy(policy, { approvalPolicy, ...approvalContext }) {
  try {
    const recreated = createApprovedReleaseMemoryPolicy({
      approvalPolicy,
      ...approvalContext,
      maxCommitDelaySeconds: policy?.maxCommitDelaySeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "approved_release_memory_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "approved_release_memory_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "approved_release_memory_policy_invalid" };
  }
}

function entryPayload(entry) {
  return {
    schema: APPROVED_RELEASE_MEMORY_ENTRY_SCHEMA,
    sequence: entry.sequence,
    compositionId: entry.compositionId,
    compositionDecisionHash: entry.compositionDecisionHash,
    finalApprovalPolicyHash: entry.finalApprovalPolicyHash,
    approvalId: entry.approvalId,
    approvalNonce: entry.approvalNonce,
    approverKeyId: entry.approverKeyId,
    approverActorId: entry.approverActorId,
    approvalDecidedAt: entry.approvalDecidedAt,
    committedAt: entry.committedAt,
    finalApprovalDecisionHash: entry.finalApprovalDecisionHash,
    finalApprovalSignatureHash: entry.finalApprovalSignatureHash,
    adjudicationRegisterHash: entry.adjudicationRegisterHash,
    outcome: entry.outcome,
    gateResultsAccepted: entry.gateResultsAccepted,
    releaseApproved: entry.releaseApproved,
    releaseMemoryCommitted: entry.releaseMemoryCommitted,
    packageGenerated: entry.packageGenerated,
    deployExecuted: entry.deployExecuted,
    releasePromoted: entry.releasePromoted,
    previousEntryHash: entry.previousEntryHash,
  };
}

function inspectEntryShape(entry, { policy, sequence, previousEntryHash }) {
  if (entry?.schema !== APPROVED_RELEASE_MEMORY_ENTRY_SCHEMA) throw new Error("approved_release_memory_entry_schema_invalid");
  if (entry.sequence !== sequence) throw new Error("approved_release_memory_sequence_invalid");
  if (entry.previousEntryHash !== previousEntryHash) throw new Error("approved_release_memory_hash_chain_invalid");
  if (entry.compositionId !== policy.compositionId || entry.compositionDecisionHash !== policy.compositionDecisionHash) {
    throw new Error("approved_release_memory_composition_mismatch");
  }
  if (entry.finalApprovalPolicyHash !== policy.finalApprovalPolicyHash) throw new Error("approved_release_memory_approval_policy_mismatch");
  assertSlug(entry.approvalId, "approved_release_memory_approval_id");
  assertSlug(entry.approvalNonce, "approved_release_memory_approval_nonce");
  assertSlug(entry.approverKeyId, "approved_release_memory_approver_key_id");
  assertSlug(entry.approverActorId, "approved_release_memory_approver_actor_id");
  assertIso(entry.approvalDecidedAt, "approved_release_memory_approval_decided_at");
  assertIso(entry.committedAt, "approved_release_memory_committed_at");
  assertHash(entry.finalApprovalDecisionHash, "approved_release_memory_final_approval_decision_hash");
  assertHash(entry.finalApprovalSignatureHash, "approved_release_memory_final_approval_signature_hash");
  assertHash(entry.adjudicationRegisterHash, "approved_release_memory_adjudication_register_hash");
  if (entry.outcome !== "approved" || entry.gateResultsAccepted !== true || entry.releaseApproved !== true || entry.releaseMemoryCommitted !== true) {
    throw new Error("approved_release_memory_entry_not_approved");
  }
  for (const key of ["packageGenerated", "deployExecuted", "releasePromoted"]) {
    if (entry[key] !== false) throw new Error(`approved_release_memory_${key}_must_be_false`);
  }
  assertHash(entry.entryHash, "approved_release_memory_entry_hash");
  if (digest(entryPayload(entry)) !== entry.entryHash) throw new Error("approved_release_memory_entry_hash_mismatch");
}

export function createApprovedReleaseMemory({ policy, entries = [] }) {
  if (!policy || policy.schema !== APPROVED_RELEASE_MEMORY_POLICY_SCHEMA) throw new Error("approved_release_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("approved_release_memory_entries_invalid");
  let previousEntryHash = null;
  const decisionHashes = new Set();
  const approvalIds = new Set();
  const approvalNonces = new Set();
  for (const [index, entry] of entries.entries()) {
    inspectEntryShape(entry, { policy, sequence: index + 1, previousEntryHash });
    if (decisionHashes.has(entry.finalApprovalDecisionHash)) throw new Error("approved_release_memory_decision_duplicate");
    if (approvalIds.has(entry.approvalId)) throw new Error("approved_release_memory_approval_id_duplicate");
    if (approvalNonces.has(entry.approvalNonce)) throw new Error("approved_release_memory_approval_nonce_duplicate");
    decisionHashes.add(entry.finalApprovalDecisionHash);
    approvalIds.add(entry.approvalId);
    approvalNonces.add(entry.approvalNonce);
    previousEntryHash = entry.entryHash;
  }
  const payload = {
    schema: APPROVED_RELEASE_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      committedApprovals: entries.length,
      latestEntryHash: previousEntryHash,
      packageGenerated: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectApprovedReleaseMemory(memory, { policy }) {
  try {
    if (memory?.schema !== APPROVED_RELEASE_MEMORY_SCHEMA || memory.policyHash !== policy?.policyHash) {
      throw new Error("approved_release_memory_schema_or_policy_invalid");
    }
    const recreated = createApprovedReleaseMemory({ policy, entries: memory.entries });
    if (recreated.memoryHash !== memory.memoryHash) throw new Error("approved_release_memory_hash_mismatch");
    if (JSON.stringify(recreated.summary) !== JSON.stringify(memory.summary)) throw new Error("approved_release_memory_summary_mismatch");
    return { ok: true, memoryHash: memory.memoryHash, committedApprovals: memory.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "approved_release_memory_invalid" };
  }
}

export function appendApprovedReleaseMemory({
  memory,
  policy,
  approvalDecision,
  committedAt,
  approvalPolicy,
  ...approvalContext
}) {
  const policyInspection = inspectApprovedReleaseMemoryPolicy(policy, { approvalPolicy, ...approvalContext });
  if (!policyInspection.ok) throw new Error(`approved_release_memory_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectApprovedReleaseMemory(memory, { policy });
  if (!memoryInspection.ok) throw new Error(`approved_release_memory_invalid:${memoryInspection.reason}`);
  const approvalInspection = inspectFinalReleaseApprovalDecision(approvalDecision, {
    approvalPolicy,
    ...approvalContext,
  });
  if (!approvalInspection.ok) throw new Error(`final_release_approval_decision_invalid:${approvalInspection.reason}`);
  if (approvalDecision.outcome !== "approved" || approvalDecision.releaseApproved !== true || approvalDecision.gateResultsAccepted !== true) {
    throw new Error("only_approved_final_release_decision_can_be_committed");
  }
  assertIso(committedAt, "approved_release_memory_committed_at");
  const decided = Date.parse(approvalDecision.decidedAt);
  const committed = Date.parse(committedAt);
  if (committed < decided) throw new Error("release_memory_commit_before_final_approval");
  if (committed - decided > policy.maxCommitDelaySeconds * 1000) throw new Error("release_memory_commit_window_expired");
  if (memory.entries.some((entry) => entry.finalApprovalDecisionHash === approvalDecision.decisionHash)) throw new Error("approved_release_memory_decision_duplicate");
  if (memory.entries.some((entry) => entry.approvalId === approvalDecision.approvalId)) throw new Error("approved_release_memory_approval_id_duplicate");
  if (memory.entries.some((entry) => entry.approvalNonce === approvalDecision.nonce)) throw new Error("approved_release_memory_approval_nonce_duplicate");

  const payload = {
    schema: APPROVED_RELEASE_MEMORY_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    compositionId: approvalDecision.compositionId,
    compositionDecisionHash: approvalDecision.compositionDecisionHash,
    finalApprovalPolicyHash: approvalDecision.finalApprovalPolicyHash,
    approvalId: approvalDecision.approvalId,
    approvalNonce: approvalDecision.nonce,
    approverKeyId: approvalDecision.approverKeyId,
    approverActorId: approvalDecision.approverActorId,
    approvalDecidedAt: approvalDecision.decidedAt,
    committedAt,
    finalApprovalDecisionHash: approvalDecision.decisionHash,
    finalApprovalSignatureHash: digest(approvalDecision.signature),
    adjudicationRegisterHash: approvalDecision.adjudicationRegisterHash,
    outcome: approvalDecision.outcome,
    gateResultsAccepted: approvalDecision.gateResultsAccepted,
    releaseApproved: approvalDecision.releaseApproved,
    releaseMemoryCommitted: true,
    packageGenerated: false,
    deployExecuted: false,
    releasePromoted: false,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
  };
  const entry = { ...payload, entryHash: digest(payload) };
  return createApprovedReleaseMemory({ policy, entries: [...memory.entries, entry] });
}

import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectAuthorizedPackageEvidenceCommitment,
  inspectAuthorizedPackageEvidenceCommitmentPolicy,
  inspectAuthorizedPackageEvidenceMemory,
} from "./authorized-package-evidence-commitment.mjs";

export const AUTHORIZED_PACKAGE_PUBLICATION_DECISION_POLICY_SCHEMA = "atlas.authorized-package-publication-decision-policy.v1";
export const AUTHORIZED_PACKAGE_PUBLICATION_DECISION_SCHEMA = "atlas.authorized-package-publication-decision.v1";
export const AUTHORIZED_PACKAGE_PUBLICATION_DECISION_MEMORY_SCHEMA = "atlas.authorized-package-publication-decision-memory.v1";
export const AUTHORIZED_PACKAGE_PUBLICATION_DECISION_MEMORY_ENTRY_SCHEMA = "atlas.authorized-package-publication-decision-memory-entry.v1";
export const AUTHORIZED_PACKAGE_PUBLICATION_DECISION_SIGNATURE_ALGORITHM = "ed25519";
export const AUTHORIZED_PACKAGE_PUBLICATION_DIRECTOR_ROLE = "release-package-publication-director";
export const AUTHORIZED_PACKAGE_PUBLICATION_OUTCOMES = Object.freeze(["approved", "rejected"]);
export const AUTHORIZED_PACKAGE_PUBLICATION_REASON_CODES = Object.freeze([
  "approved-for-publication",
  "package-evidence-rejected",
  "publication-risk-not-accepted",
  "publication-evidence-inconclusive",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertIso(value, field) { if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`); }
function assertHash(value, field) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`); }
function assertSlug(value, field) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`); }

function normalizeDirector(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("package_publication_director_invalid");
  assertSlug(value.keyId, "package_publication_director_key_id");
  assertSlug(value.actorId, "package_publication_director_actor_id");
  if (value.role !== AUTHORIZED_PACKAGE_PUBLICATION_DIRECTOR_ROLE) throw new Error("package_publication_director_role_invalid");
  if (!["active", "inactive"].includes(value.status)) throw new Error("package_publication_director_status_invalid");
  assertIso(value.validFrom, "package_publication_director_valid_from");
  assertIso(value.validUntil, "package_publication_director_valid_until");
  if (Date.parse(value.validUntil) <= Date.parse(value.validFrom)) throw new Error("package_publication_director_validity_invalid");
  try {
    const key = createPublicKey(value.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("wrong_key_type");
  } catch {
    throw new Error("package_publication_director_public_key_invalid");
  }
  return {
    keyId: value.keyId,
    actorId: value.actorId,
    role: value.role,
    publicKeyPem: value.publicKeyPem,
    validFrom: value.validFrom,
    validUntil: value.validUntil,
    status: value.status,
  };
}

function priorIdentities({ packageAuthorizationPolicy, assemblyPolicy, evidencePolicy }) {
  return new Set([
    ...(packageAuthorizationPolicy.trustedPackageAuthorizers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(assemblyPolicy.trustedPackageAssemblers ?? []).flatMap((item) => [item.keyId, item.actorId]),
    ...(evidencePolicy.trustedEvidenceCustodians ?? []).flatMap((item) => [item.keyId, item.actorId]),
  ]);
}

export function createAuthorizedPackagePublicationDecisionPolicy({
  evidencePolicy,
  assemblyPolicy,
  packageAuthorizationPolicy,
  trustedPublicationDirectors = [],
  maxDecisionDelaySeconds = 900,
  minReasonLength = 12,
}) {
  const evidenceInspection = inspectAuthorizedPackageEvidenceCommitmentPolicy(evidencePolicy, { assemblyPolicy, packageAuthorizationPolicy });
  if (!evidenceInspection.ok) throw new Error(`package_publication_evidence_policy_invalid:${evidenceInspection.reason}`);
  if (!Array.isArray(trustedPublicationDirectors)) throw new Error("trusted_package_publication_directors_invalid");
  const directors = trustedPublicationDirectors.map(normalizeDirector).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(directors.map((item) => item.keyId)).size !== directors.length) throw new Error("duplicate_package_publication_director_key_id");
  if (new Set(directors.map((item) => item.actorId)).size !== directors.length) throw new Error("duplicate_package_publication_director_actor_id");
  const forbidden = priorIdentities({ packageAuthorizationPolicy, assemblyPolicy, evidencePolicy });
  if (directors.some((item) => forbidden.has(item.keyId) || forbidden.has(item.actorId))) {
    throw new Error("package_publication_director_must_be_independent");
  }
  if (!Number.isInteger(maxDecisionDelaySeconds) || maxDecisionDelaySeconds < 1 || maxDecisionDelaySeconds > 86_400) {
    throw new Error("max_package_publication_decision_delay_invalid");
  }
  if (!Number.isInteger(minReasonLength) || minReasonLength < 8 || minReasonLength > 200) {
    throw new Error("min_package_publication_reason_length_invalid");
  }
  const payload = {
    schema: AUTHORIZED_PACKAGE_PUBLICATION_DECISION_POLICY_SCHEMA,
    compositionId: evidencePolicy.compositionId,
    compositionDecisionHash: evidencePolicy.compositionDecisionHash,
    finalApprovalPolicyHash: evidencePolicy.finalApprovalPolicyHash,
    approvedReleaseMemoryPolicyHash: evidencePolicy.approvedReleaseMemoryPolicyHash,
    packageAuthorizationPolicyHash: evidencePolicy.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: evidencePolicy.packageAssemblyPolicyHash,
    packageEvidencePolicyHash: evidencePolicy.policyHash,
    requiredEvidenceSchema: "atlas.authorized-package-evidence-commitment.v1",
    requiredMemoryEntrySchema: AUTHORIZED_PACKAGE_PUBLICATION_DECISION_MEMORY_ENTRY_SCHEMA,
    directorRole: AUTHORIZED_PACKAGE_PUBLICATION_DIRECTOR_ROLE,
    signatureAlgorithm: AUTHORIZED_PACKAGE_PUBLICATION_DECISION_SIGNATURE_ALGORITHM,
    trustedPublicationDirectors: directors,
    maxDecisionDelaySeconds,
    minReasonLength,
    allowedOutcomes: [...AUTHORIZED_PACKAGE_PUBLICATION_OUTCOMES],
    allowedReasonCodes: [...AUTHORIZED_PACKAGE_PUBLICATION_REASON_CODES],
    exactEvidenceCommitmentBindingRequired: true,
    exactEvidenceMemoryBindingRequired: true,
    exactPackageDigestBindingRequired: true,
    exactInventoryBindingRequired: true,
    independentPublicationDirectorRequired: true,
    signatureRequired: true,
    appendOnlyDecisionMemoryRequired: true,
    duplicateEvidenceDecisionRejected: true,
    duplicatePackageDecisionRejected: true,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticPublication: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectAuthorizedPackagePublicationDecisionPolicy(policy, context) {
  try {
    const recreated = createAuthorizedPackagePublicationDecisionPolicy({
      ...context,
      trustedPublicationDirectors: policy?.trustedPublicationDirectors,
      maxDecisionDelaySeconds: policy?.maxDecisionDelaySeconds,
      minReasonLength: policy?.minReasonLength,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "package_publication_decision_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "package_publication_decision_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash, trustedPublicationDirectors: recreated.trustedPublicationDirectors.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_publication_decision_policy_invalid" };
  }
}

function memoryPayload({ policy, entries }) {
  return {
    schema: AUTHORIZED_PACKAGE_PUBLICATION_DECISION_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: {
      recordedDecisions: entries.length,
      approvedDecisions: entries.filter((entry) => entry.outcome === "approved").length,
      rejectedDecisions: entries.filter((entry) => entry.outcome === "rejected").length,
      authorizedPackages: entries.filter((entry) => entry.publicationAuthorized === true).length,
      latestEntryHash: entries.at(-1)?.entryHash ?? null,
      publicationExecuted: false,
      buildExecuted: false,
      deployExecuted: false,
      releasePromoted: false,
    },
  };
}

export function createAuthorizedPackagePublicationDecisionMemory({ policy, entries = [] }) {
  if (policy?.schema !== AUTHORIZED_PACKAGE_PUBLICATION_DECISION_POLICY_SCHEMA) throw new Error("package_publication_decision_memory_policy_invalid");
  if (!Array.isArray(entries)) throw new Error("package_publication_decision_memory_entries_invalid");
  let previousEntryHash = null;
  const commitmentHashes = new Set();
  const packageHashes = new Set();
  const decisionIds = new Set();
  const nonces = new Set();
  const normalized = entries.map((entry, index) => {
    if (entry?.schema !== AUTHORIZED_PACKAGE_PUBLICATION_DECISION_MEMORY_ENTRY_SCHEMA) throw new Error("package_publication_decision_memory_entry_schema_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("package_publication_decision_memory_chain_invalid");
    assertHash(entry.decisionHash, "package_publication_decision_memory_decision_hash");
    assertHash(entry.commitmentHash, "package_publication_decision_memory_commitment_hash");
    assertHash(entry.packageSha256, "package_publication_decision_memory_package_sha256");
    assertSlug(entry.decisionId, "package_publication_decision_memory_decision_id");
    assertSlug(entry.nonce, "package_publication_decision_memory_nonce");
    if (commitmentHashes.has(entry.commitmentHash)) throw new Error("package_publication_duplicate_evidence_decision");
    if (packageHashes.has(entry.packageSha256)) throw new Error("package_publication_duplicate_package_decision");
    if (decisionIds.has(entry.decisionId) || nonces.has(entry.nonce)) throw new Error("package_publication_duplicate_decision_identity");
    if (!AUTHORIZED_PACKAGE_PUBLICATION_OUTCOMES.includes(entry.outcome)) throw new Error("package_publication_decision_memory_outcome_invalid");
    if (entry.decisionRecorded !== true || entry.packageEvidenceVerified !== true) throw new Error("package_publication_decision_memory_safety_contract_invalid");
    if (entry.publicationAuthorized !== (entry.outcome === "approved")) throw new Error("package_publication_decision_memory_authorization_mismatch");
    for (const key of ["publicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`package_publication_decision_memory_${key}_must_be_false`);
    }
    const hashPayload = { ...entry };
    delete hashPayload.entryHash;
    if (digest(hashPayload) !== entry.entryHash) throw new Error("package_publication_decision_memory_entry_hash_mismatch");
    commitmentHashes.add(entry.commitmentHash);
    packageHashes.add(entry.packageSha256);
    decisionIds.add(entry.decisionId);
    nonces.add(entry.nonce);
    previousEntryHash = entry.entryHash;
    return { ...entry };
  });
  const payload = memoryPayload({ policy, entries: normalized });
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectAuthorizedPackagePublicationDecisionMemory(memory, { policy }) {
  try {
    const recreated = createAuthorizedPackagePublicationDecisionMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "package_publication_decision_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "package_publication_decision_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, recordedDecisions: recreated.entries.length };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_publication_decision_memory_invalid" };
  }
}

function validateDecisionWindow({ commitment, policy, director, decidedAt }) {
  assertIso(decidedAt, "package_publication_decided_at");
  const decided = Date.parse(decidedAt);
  const committed = Date.parse(commitment.committedAt);
  if (decided < committed) throw new Error("package_publication_decision_before_evidence_commitment");
  if (decided - committed > policy.maxDecisionDelaySeconds * 1000) throw new Error("package_publication_decision_window_expired");
  if (director.status !== "active") throw new Error("package_publication_director_inactive");
  if (director.role !== policy.directorRole) throw new Error("package_publication_director_role_mismatch");
  if (decided < Date.parse(director.validFrom) || decided > Date.parse(director.validUntil)) throw new Error("package_publication_director_key_outside_validity");
  if ([commitment.custodianActorId].includes(director.actorId)) throw new Error("package_publication_director_must_be_independent");
}

function normalizeDecision({ outcome, reasonCode, reason, policy }) {
  if (!policy.allowedOutcomes.includes(outcome)) throw new Error("package_publication_outcome_invalid");
  if (!policy.allowedReasonCodes.includes(reasonCode)) throw new Error("package_publication_reason_code_invalid");
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (normalizedReason.length < policy.minReasonLength || normalizedReason.length > 2000) throw new Error("package_publication_reason_invalid");
  if (outcome === "approved" && reasonCode !== "approved-for-publication") throw new Error("approved_package_publication_reason_code_invalid");
  if (outcome === "rejected" && reasonCode === "approved-for-publication") throw new Error("rejected_package_publication_reason_code_invalid");
  return { outcome, reasonCode, reason: normalizedReason };
}

function verifyContext({
  publicationPolicy,
  publicationMemory,
  evidencePolicy,
  evidenceMemory,
  assemblyPolicy,
  packageAuthorizationPolicy,
}) {
  const policyInspection = inspectAuthorizedPackagePublicationDecisionPolicy(publicationPolicy, {
    evidencePolicy,
    assemblyPolicy,
    packageAuthorizationPolicy,
  });
  if (!policyInspection.ok) throw new Error(`package_publication_decision_policy_invalid:${policyInspection.reason}`);
  const memoryInspection = inspectAuthorizedPackagePublicationDecisionMemory(publicationMemory, { policy: publicationPolicy });
  if (!memoryInspection.ok) throw new Error(`package_publication_decision_memory_invalid:${memoryInspection.reason}`);
  const evidenceMemoryInspection = inspectAuthorizedPackageEvidenceMemory(evidenceMemory, { policy: evidencePolicy });
  if (!evidenceMemoryInspection.ok) throw new Error(`package_publication_evidence_memory_invalid:${evidenceMemoryInspection.reason}`);
}

function verifyCommitment(commitment, context) {
  const inspection = inspectAuthorizedPackageEvidenceCommitment(commitment, context);
  if (!inspection.ok) throw new Error(`package_publication_evidence_invalid:${inspection.reason}`);
}

function signingPayload({ commitment, evidenceMemory, publicationPolicy, decisionId, director, decision, decidedAt, nonce }) {
  const evidenceEntry = evidenceMemory.entries.find((entry) => entry.commitmentHash === commitment.commitmentHash);
  if (!evidenceEntry) throw new Error("package_publication_evidence_entry_not_found");
  return {
    signingSchema: "atlas.authorized-package-publication-decision-signing-payload.v1",
    compositionId: commitment.compositionId,
    compositionDecisionHash: commitment.compositionDecisionHash,
    finalApprovalPolicyHash: commitment.finalApprovalPolicyHash,
    approvedReleaseMemoryHash: commitment.approvedReleaseMemoryHash,
    packageAuthorizationPolicyHash: commitment.packageAuthorizationPolicyHash,
    packageAssemblyPolicyHash: commitment.packageAssemblyPolicyHash,
    packageAssemblyMemoryHash: commitment.packageAssemblyMemoryHash,
    receiptHash: commitment.receiptHash,
    authorizationHash: commitment.authorizationHash,
    packageName: commitment.packageName,
    packageSha256: commitment.packageSha256,
    packageSizeBytes: commitment.packageSizeBytes,
    inventoryHash: commitment.inventoryHash,
    inventoryFileCount: commitment.inventoryFileCount,
    inventoryTotalBytes: commitment.inventoryTotalBytes,
    evidencePolicyHash: commitment.evidencePolicyHash,
    evidenceMemoryHash: evidenceMemory.memoryHash,
    evidenceMemoryEntryHash: evidenceEntry.entryHash,
    commitmentHash: commitment.commitmentHash,
    publicationDecisionPolicyHash: publicationPolicy.policyHash,
    decisionId,
    directorKeyId: director.keyId,
    directorActorId: director.actorId,
    directorRole: director.role,
    outcome: decision.outcome,
    reasonCode: decision.reasonCode,
    reason: decision.reason,
    decidedAt,
    nonce,
  };
}

export function decideAuthorizedPackagePublication({
  commitment,
  publicationPolicy,
  publicationMemory,
  evidencePolicy,
  evidenceMemory,
  assemblyPolicy,
  packageAuthorizationPolicy,
  decisionId,
  keyId,
  outcome,
  reasonCode,
  reason,
  decidedAt,
  nonce,
  privateKey,
  ...commitmentContext
}) {
  verifyContext({ publicationPolicy, publicationMemory, evidencePolicy, evidenceMemory, assemblyPolicy, packageAuthorizationPolicy });
  verifyCommitment(commitment, { evidencePolicy, evidenceMemory, assemblyPolicy, packageAuthorizationPolicy, ...commitmentContext });
  assertSlug(decisionId, "package_publication_decision_id");
  assertSlug(keyId, "package_publication_director_key_id");
  assertSlug(nonce, "package_publication_decision_nonce");
  const director = publicationPolicy.trustedPublicationDirectors.find((item) => item.keyId === keyId);
  if (!director) throw new Error("package_publication_director_untrusted");
  const forbidden = priorIdentities({ packageAuthorizationPolicy, assemblyPolicy, evidencePolicy });
  if (forbidden.has(director.keyId) || forbidden.has(director.actorId)) throw new Error("package_publication_director_must_be_independent");
  validateDecisionWindow({ commitment, policy: publicationPolicy, director, decidedAt });
  if (publicationMemory.entries.some((entry) => entry.commitmentHash === commitment.commitmentHash)) throw new Error("package_publication_duplicate_evidence_decision");
  if (publicationMemory.entries.some((entry) => entry.packageSha256 === commitment.packageSha256)) throw new Error("package_publication_duplicate_package_decision");
  const decision = normalizeDecision({ outcome, reasonCode, reason, policy: publicationPolicy });
  const payload = signingPayload({ commitment, evidenceMemory, publicationPolicy, decisionId, director, decision, decidedAt, nonce });
  let signature;
  try { signature = cryptoSign(null, bytes(payload), privateKey).toString("base64url"); }
  catch { throw new Error("package_publication_decision_signature_creation_failed"); }
  if (!cryptoVerify(null, bytes(payload), director.publicKeyPem, Buffer.from(signature, "base64url"))) {
    throw new Error("private_key_does_not_match_package_publication_director");
  }
  const value = {
    schema: AUTHORIZED_PACKAGE_PUBLICATION_DECISION_SCHEMA,
    ...payload,
    signatureAlgorithm: AUTHORIZED_PACKAGE_PUBLICATION_DECISION_SIGNATURE_ALGORITHM,
    decisionRecorded: true,
    packageEvidenceVerified: true,
    publicationAuthorized: outcome === "approved",
    publicationExecuted: false,
    packageGenerated: true,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
    signature,
  };
  const publicationDecision = { ...value, decisionHash: digest(value) };
  const entryPayload = {
    schema: AUTHORIZED_PACKAGE_PUBLICATION_DECISION_MEMORY_ENTRY_SCHEMA,
    sequence: publicationMemory.entries.length + 1,
    previousEntryHash: publicationMemory.entries.at(-1)?.entryHash ?? null,
    decisionHash: publicationDecision.decisionHash,
    decisionId: publicationDecision.decisionId,
    nonce: publicationDecision.nonce,
    commitmentHash: publicationDecision.commitmentHash,
    packageSha256: publicationDecision.packageSha256,
    evidenceMemoryHash: publicationDecision.evidenceMemoryHash,
    directorActorId: publicationDecision.directorActorId,
    outcome: publicationDecision.outcome,
    decidedAt: publicationDecision.decidedAt,
    decisionRecorded: true,
    packageEvidenceVerified: true,
    publicationAuthorized: publicationDecision.publicationAuthorized,
    publicationExecuted: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const entry = { ...entryPayload, entryHash: digest(entryPayload) };
  return {
    decision: publicationDecision,
    publicationMemory: createAuthorizedPackagePublicationDecisionMemory({
      policy: publicationPolicy,
      entries: [...publicationMemory.entries, entry],
    }),
  };
}

export function inspectAuthorizedPackagePublicationDecision(decision, {
  publicationPolicy,
  publicationMemory,
  evidencePolicy,
  evidenceMemory,
  assemblyPolicy,
  packageAuthorizationPolicy,
  commitment,
  ...commitmentContext
}) {
  try {
    if (decision?.schema !== AUTHORIZED_PACKAGE_PUBLICATION_DECISION_SCHEMA) throw new Error("package_publication_decision_schema_invalid");
    verifyContext({ publicationPolicy, publicationMemory, evidencePolicy, evidenceMemory, assemblyPolicy, packageAuthorizationPolicy });
    verifyCommitment(commitment, { evidencePolicy, evidenceMemory, assemblyPolicy, packageAuthorizationPolicy, ...commitmentContext });
    if (decision.commitmentHash !== commitment.commitmentHash) throw new Error("package_publication_evidence_commitment_mismatch");
    assertSlug(decision.decisionId, "package_publication_decision_id");
    assertSlug(decision.nonce, "package_publication_decision_nonce");
    const director = publicationPolicy.trustedPublicationDirectors.find((item) => item.keyId === decision.directorKeyId);
    if (!director) throw new Error("package_publication_director_untrusted");
    const forbidden = priorIdentities({ packageAuthorizationPolicy, assemblyPolicy, evidencePolicy });
    if (forbidden.has(director.keyId) || forbidden.has(director.actorId)) throw new Error("package_publication_director_must_be_independent");
    validateDecisionWindow({ commitment, policy: publicationPolicy, director, decidedAt: decision.decidedAt });
    const normalized = normalizeDecision({ outcome: decision.outcome, reasonCode: decision.reasonCode, reason: decision.reason, policy: publicationPolicy });
    const payload = signingPayload({
      commitment,
      evidenceMemory,
      publicationPolicy,
      decisionId: decision.decisionId,
      director,
      decision: normalized,
      decidedAt: decision.decidedAt,
      nonce: decision.nonce,
    });
    for (const [key, expected] of Object.entries(payload)) {
      if (JSON.stringify(decision[key]) !== JSON.stringify(expected)) throw new Error(`package_publication_${key}_mismatch`);
    }
    if (decision.signatureAlgorithm !== AUTHORIZED_PACKAGE_PUBLICATION_DECISION_SIGNATURE_ALGORITHM || typeof decision.signature !== "string") {
      throw new Error("package_publication_decision_signature_invalid");
    }
    if (!cryptoVerify(null, bytes(payload), director.publicKeyPem, Buffer.from(decision.signature, "base64url"))) {
      throw new Error("package_publication_decision_signature_verification_failed");
    }
    if (decision.decisionRecorded !== true || decision.packageEvidenceVerified !== true || decision.publicationAuthorized !== (decision.outcome === "approved")) {
      throw new Error("package_publication_decision_contract_invalid");
    }
    if (decision.packageGenerated !== true) throw new Error("package_publication_package_generated_required");
    for (const key of ["publicationExecuted", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (decision[key] !== false) throw new Error(`package_publication_${key}_must_be_false`);
    }
    const hashPayload = { ...decision };
    delete hashPayload.decisionHash;
    if (digest(hashPayload) !== decision.decisionHash) throw new Error("package_publication_decision_hash_mismatch");
    if (!publicationMemory.entries.some((entry) => entry.decisionHash === decision.decisionHash && entry.commitmentHash === decision.commitmentHash)) {
      throw new Error("package_publication_decision_not_recorded");
    }
    return {
      ok: true,
      decisionHash: decision.decisionHash,
      outcome: decision.outcome,
      publicationAuthorized: decision.publicationAuthorized,
      publicationExecuted: false,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "package_publication_decision_invalid" };
  }
}

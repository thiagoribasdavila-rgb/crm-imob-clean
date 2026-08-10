import {
  createHash,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

export const CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_POLICY_SCHEMA =
  "atlas.controlled-proof-execution-recurring-cycle-policy.v1";
export const CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_MEMORY_SCHEMA =
  "atlas.controlled-proof-execution-recurring-cycle-memory.v1";
export const CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_ENTRY_SCHEMA =
  "atlas.controlled-proof-execution-recurring-cycle-entry.v1";
export const CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_SIGNATURE_ALGORITHM = "ed25519";
export const CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES = Object.freeze([
  "authorization-consumption",
  "continuation",
  "observation",
  "review",
  "authorization",
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function bytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }
function digest(value) { return createHash("sha256").update(bytes(value)).digest("hex"); }
function assertHash(value, field) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field}_invalid`);
}
function assertIso(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`${field}_invalid`);
}
function assertSlug(value, field) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(`${field}_invalid`);
}

function normalizeActor(actor) {
  if (!actor || typeof actor !== "object" || Array.isArray(actor)) throw new Error("recurring_cycle_actor_invalid");
  if (!CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.includes(actor.stage)) throw new Error("recurring_cycle_actor_stage_invalid");
  assertSlug(actor.keyId, "recurring_cycle_actor_key_id");
  assertSlug(actor.actorId, "recurring_cycle_actor_id");
  if (!['active', 'inactive'].includes(actor.status)) throw new Error("recurring_cycle_actor_status_invalid");
  assertIso(actor.validFrom, "recurring_cycle_actor_valid_from");
  assertIso(actor.validUntil, "recurring_cycle_actor_valid_until");
  if (Date.parse(actor.validUntil) <= Date.parse(actor.validFrom)) throw new Error("recurring_cycle_actor_validity_invalid");
  let key;
  try {
    key = createPublicKey(actor.publicKeyPem);
  } catch {
    throw new Error("recurring_cycle_actor_public_key_invalid");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new Error("recurring_cycle_actor_public_key_invalid");
  return {
    stage: actor.stage,
    keyId: actor.keyId,
    actorId: actor.actorId,
    publicKeyPem: actor.publicKeyPem,
    status: actor.status,
    validFrom: actor.validFrom,
    validUntil: actor.validUntil,
  };
}

export function createControlledProofExecutionRecurringCyclePolicy({
  compositionId,
  upstreamAuthorizationPolicyHash,
  upstreamAuthorizationMemoryHash,
  trustedActors = [],
}) {
  assertSlug(compositionId, "recurring_cycle_composition_id");
  assertHash(upstreamAuthorizationPolicyHash, "recurring_cycle_upstream_authorization_policy_hash");
  assertHash(upstreamAuthorizationMemoryHash, "recurring_cycle_upstream_authorization_memory_hash");
  if (!Array.isArray(trustedActors)) throw new Error("recurring_cycle_trusted_actors_invalid");
  const actors = trustedActors.map(normalizeActor).sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(actors.map((actor) => actor.keyId)).size !== actors.length) throw new Error("recurring_cycle_actor_key_duplicate");
  if (new Set(actors.map((actor) => actor.actorId)).size !== actors.length) throw new Error("recurring_cycle_actor_id_duplicate");
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_POLICY_SCHEMA,
    compositionId,
    upstreamAuthorizationPolicyHash,
    upstreamAuthorizationMemoryHash,
    stageSequence: [...CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES],
    signatureAlgorithm: CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_SIGNATURE_ALGORITHM,
    trustedActors: actors,
    maximumEntriesPerCycle: CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length,
    exactStageOrderRequired: true,
    exactUpstreamAuthorizationBindingRequired: true,
    actorIndependenceRequired: true,
    actorValidityAtRecordRequired: true,
    signedRecordsRequired: true,
    appendOnlyMemoryRequired: true,
    atomicMemoryHeadBindingRequired: true,
    duplicateEvidenceRejected: true,
    internalStageRecordingAllowed: true,
    networkAccessAllowed: false,
    databaseMutationAllowed: false,
    externalPublicationAllowed: false,
    automaticPackageGeneration: false,
    automaticBuild: false,
    automaticDeploy: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectControlledProofExecutionRecurringCyclePolicy(policy, context) {
  try {
    const recreated = createControlledProofExecutionRecurringCyclePolicy(context);
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "recurring_cycle_policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "recurring_cycle_policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "recurring_cycle_policy_invalid" };
  }
}

function summary(entries) {
  const counts = Object.fromEntries(CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.map((stage) => [stage, 0]));
  for (const entry of entries) counts[entry.stage] += 1;
  return {
    recordedEntries: entries.length,
    completedCycles: Math.floor(entries.length / CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length),
    stageCounts: counts,
    nextStage: CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES[entries.length % CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length],
    latestEntryHash: entries.at(-1)?.entryHash ?? null,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
}

function memoryPayload(policy, entries) {
  return {
    schema: CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_MEMORY_SCHEMA,
    policyHash: policy.policyHash,
    entries,
    summary: summary(entries),
  };
}

export function createControlledProofExecutionRecurringCycleMemory({ policy, entries = [] }) {
  if (policy?.schema !== CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_POLICY_SCHEMA) throw new Error("recurring_cycle_memory_policy_invalid");
  assertHash(policy.policyHash, "recurring_cycle_memory_policy_hash");
  if (!Array.isArray(entries)) throw new Error("recurring_cycle_memory_entries_invalid");
  const normalized = [];
  const evidenceHashes = new Set();
  let previousEntryHash = null;
  for (const [index, entry] of entries.entries()) {
    if (entry?.schema !== CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_ENTRY_SCHEMA) throw new Error("recurring_cycle_entry_schema_invalid");
    const expectedStage = CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES[index % CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length];
    if (entry.stage !== expectedStage) throw new Error("recurring_cycle_stage_order_invalid");
    if (entry.sequence !== index + 1 || entry.previousEntryHash !== previousEntryHash) throw new Error("recurring_cycle_memory_chain_invalid");
    if (entry.policyHash !== policy.policyHash) throw new Error("recurring_cycle_entry_policy_binding_mismatch");
    assertHash(entry.inputEvidenceHash, "recurring_cycle_input_evidence_hash");
    assertSlug(entry.actorId, "recurring_cycle_entry_actor_id");
    assertSlug(entry.actorKeyId, "recurring_cycle_entry_actor_key_id");
    assertIso(entry.recordedAt, "recurring_cycle_entry_recorded_at");
    if (evidenceHashes.has(entry.inputEvidenceHash)) throw new Error("recurring_cycle_duplicate_evidence");
    const actor = policy.trustedActors.find((candidate) => candidate.keyId === entry.actorKeyId && candidate.stage === entry.stage);
    if (!actor || actor.actorId !== entry.actorId) throw new Error("recurring_cycle_actor_untrusted");
    if (actor.status !== "active") throw new Error("recurring_cycle_actor_inactive");
    if (Date.parse(entry.recordedAt) < Date.parse(actor.validFrom) || Date.parse(entry.recordedAt) > Date.parse(actor.validUntil)) {
      throw new Error("recurring_cycle_actor_outside_validity");
    }
    const cycleStart = Math.floor(index / CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length) * CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length;
    if (normalized.slice(cycleStart).some((candidate) => candidate.actorId === entry.actorId)) throw new Error("recurring_cycle_actor_not_independent");
    const signedPayload = { ...entry };
    delete signedPayload.signature;
    delete signedPayload.entryHash;
    if (!cryptoVerify(null, bytes(signedPayload), actor.publicKeyPem, Buffer.from(entry.signature, "base64"))) {
      throw new Error("recurring_cycle_signature_invalid");
    }
    if (digest({ ...signedPayload, signature: entry.signature }) !== entry.entryHash) throw new Error("recurring_cycle_entry_hash_mismatch");
    for (const key of ["publicationExecuted", "externalPublicationExecuted", "packageGenerated", "buildExecuted", "deployExecuted", "releasePromoted"]) {
      if (entry[key] !== false) throw new Error(`recurring_cycle_${key}_must_be_false`);
    }
    normalized.push({ ...entry });
    evidenceHashes.add(entry.inputEvidenceHash);
    previousEntryHash = entry.entryHash;
  }
  const payload = memoryPayload(policy, normalized);
  return { ...payload, memoryHash: digest(payload) };
}

export function inspectControlledProofExecutionRecurringCycleMemory(memory, { policy }) {
  try {
    const recreated = createControlledProofExecutionRecurringCycleMemory({ policy, entries: memory?.entries });
    if (recreated.memoryHash !== memory?.memoryHash) return { ok: false, reason: "recurring_cycle_memory_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(memory)) return { ok: false, reason: "recurring_cycle_memory_contract_mismatch" };
    return { ok: true, memoryHash: recreated.memoryHash, nextStage: recreated.summary.nextStage };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "recurring_cycle_memory_invalid" };
  }
}

export function recordControlledProofExecutionRecurringCycleStage({
  policy,
  memory,
  stage,
  inputEvidenceHash,
  actorKeyId,
  actorPrivateKey,
  recordedAt,
}) {
  const memoryInspection = inspectControlledProofExecutionRecurringCycleMemory(memory, { policy });
  if (!memoryInspection.ok) throw new Error(`recurring_cycle_memory_invalid:${memoryInspection.reason}`);
  if (stage !== memory.summary.nextStage) throw new Error("recurring_cycle_stage_order_invalid");
  assertHash(inputEvidenceHash, "recurring_cycle_input_evidence_hash");
  assertIso(recordedAt, "recurring_cycle_recorded_at");
  const actor = policy.trustedActors.find((candidate) => candidate.keyId === actorKeyId && candidate.stage === stage);
  if (!actor) throw new Error("recurring_cycle_actor_untrusted");
  const privatePublic = createPublicKey(actorPrivateKey).export({ type: "spki", format: "pem" });
  if (privatePublic !== actor.publicKeyPem) throw new Error("recurring_cycle_private_key_does_not_match");
  const payload = {
    schema: CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_ENTRY_SCHEMA,
    sequence: memory.entries.length + 1,
    stage,
    policyHash: policy.policyHash,
    inputEvidenceHash,
    actorId: actor.actorId,
    actorKeyId: actor.keyId,
    recordedAt,
    previousEntryHash: memory.entries.at(-1)?.entryHash ?? null,
    publicationExecuted: false,
    externalPublicationExecuted: false,
    packageGenerated: false,
    buildExecuted: false,
    deployExecuted: false,
    releasePromoted: false,
  };
  const signature = cryptoSign(null, bytes(payload), actorPrivateKey).toString("base64");
  const entry = { ...payload, signature, entryHash: digest({ ...payload, signature }) };
  const nextMemory = createControlledProofExecutionRecurringCycleMemory({ policy, entries: [...memory.entries, entry] });
  return { entry, memory: nextMemory };
}

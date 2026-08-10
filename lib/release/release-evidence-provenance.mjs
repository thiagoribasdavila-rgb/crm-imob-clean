import { createHash, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from "node:crypto";
import {
  inspectReleaseEvidenceIntake,
  inspectReleaseEvidenceIntakePolicy,
  RELEASE_EVIDENCE_INTAKE_RESULT_SCHEMA,
} from "./release-evidence-intake.mjs";

export const RELEASE_EVIDENCE_PROVENANCE_POLICY_SCHEMA = "atlas.release-evidence-provenance-policy.v1";
export const RELEASE_EVIDENCE_PROVENANCE_ENVELOPE_SCHEMA = "atlas.release-evidence-provenance-envelope.v1";
export const RELEASE_EVIDENCE_PROVENANCE_RESULT_SCHEMA = "atlas.release-evidence-provenance-result.v1";
export const RELEASE_EVIDENCE_SIGNATURE_ALGORITHM = "ed25519";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(JSON.stringify(canonical(value)));
}

function digest(value) {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
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

function normalizedPublicKey(value) {
  if (typeof value !== "string" || value.length > 4096) throw new Error("public_key_invalid");
  try {
    const key = createPublicKey(value);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("public_key_algorithm_invalid");
    const der = key.export({ type: "spki", format: "der" });
    return { pem: key.export({ type: "spki", format: "pem" }).toString(), fingerprint: createHash("sha256").update(der).digest("hex") };
  } catch (error) {
    if (error instanceof Error && error.message === "public_key_algorithm_invalid") throw error;
    throw new Error("public_key_invalid");
  }
}

function assertBaseContext({ decision, plan, intakePolicy }) {
  const inspection = inspectReleaseEvidenceIntakePolicy(intakePolicy, { decision, plan });
  if (!inspection.ok) throw new Error(`intake_policy_invalid:${inspection.reason}`);
}

function normalizeSigner(signer, acceptedChannels) {
  assertSlug(signer?.keyId, "signer_key_id");
  assertSlug(signer?.actorId, "signer_actor_id");
  assertRole(signer?.role, "signer_role");
  assertIsoDate(signer?.validFrom, "signer_valid_from");
  assertIsoDate(signer?.validUntil, "signer_valid_until");
  if (Date.parse(signer.validFrom) >= Date.parse(signer.validUntil)) throw new Error("signer_validity_invalid");
  if (signer.status !== "active") throw new Error("signer_status_invalid");
  if (!Array.isArray(signer.channels) || signer.channels.length === 0) throw new Error("signer_channels_invalid");
  const channels = [...new Set(signer.channels)].sort();
  if (channels.some((channel) => !acceptedChannels.includes(channel))) throw new Error("signer_channel_invalid");
  const key = normalizedPublicKey(signer.publicKeyPem);
  if (signer.publicKeyFingerprint && signer.publicKeyFingerprint !== key.fingerprint) throw new Error("public_key_fingerprint_mismatch");
  return {
    keyId: signer.keyId,
    actorId: signer.actorId,
    role: signer.role,
    channels,
    publicKeyPem: key.pem,
    publicKeyFingerprint: key.fingerprint,
    validFrom: signer.validFrom,
    validUntil: signer.validUntil,
    status: "active",
  };
}

export function createReleaseEvidenceProvenancePolicy({ decision, plan, intakePolicy, trustedSigners = [], maxSignatureAgeSeconds = 900 }) {
  assertBaseContext({ decision, plan, intakePolicy });
  if (!Array.isArray(trustedSigners)) throw new Error("trusted_signers_invalid");
  if (!Number.isInteger(maxSignatureAgeSeconds) || maxSignatureAgeSeconds < 1 || maxSignatureAgeSeconds > 86400) throw new Error("max_signature_age_invalid");
  const normalizedSigners = trustedSigners.map((signer) => normalizeSigner(signer, intakePolicy.acceptedChannels))
    .sort((a, b) => a.keyId.localeCompare(b.keyId));
  if (new Set(normalizedSigners.map((signer) => signer.keyId)).size !== normalizedSigners.length) throw new Error("duplicate_signer_key_id");
  if (new Set(normalizedSigners.map((signer) => signer.publicKeyFingerprint)).size !== normalizedSigners.length) throw new Error("duplicate_signer_public_key");
  const payload = {
    schema: RELEASE_EVIDENCE_PROVENANCE_POLICY_SCHEMA,
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    intakePolicyHash: intakePolicy.policyHash,
    signatureAlgorithm: RELEASE_EVIDENCE_SIGNATURE_ALGORITHM,
    trustedSigners: normalizedSigners,
    maxSignatureAgeSeconds,
    requireExactActorRoleAndChannel: true,
    requireSignedRecordManifest: true,
    automaticEvidenceMatrixAdmission: false,
    automaticGateExecution: false,
    automaticReleasePromotion: false,
  };
  return { ...payload, policyHash: digest(payload) };
}

export function inspectReleaseEvidenceProvenancePolicy(policy, context) {
  try {
    const recreated = createReleaseEvidenceProvenancePolicy({
      ...context,
      trustedSigners: policy?.trustedSigners,
      maxSignatureAgeSeconds: policy?.maxSignatureAgeSeconds,
    });
    if (recreated.policyHash !== policy?.policyHash) return { ok: false, reason: "policy_hash_mismatch" };
    if (JSON.stringify(recreated) !== JSON.stringify(policy)) return { ok: false, reason: "policy_contract_mismatch" };
    return { ok: true, policyHash: recreated.policyHash };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "provenance_policy_invalid" };
  }
}

function assertAcceptedIntakeResult(intakeResult, intake) {
  if (!intakeResult || intakeResult.schema !== RELEASE_EVIDENCE_INTAKE_RESULT_SCHEMA) throw new Error("intake_result_invalid");
  assertHash(intakeResult.resultHash, "intake_result_hash");
  if (intakeResult.intakeHash !== intake.intakeHash) throw new Error("intake_result_hash_binding_invalid");
  if (intakeResult.status !== "accepted_for_provenance_review") throw new Error("intake_not_accepted_for_provenance");
  for (const key of ["provenanceVerified", "eligibleForEvidenceMatrix", "evidenceMatrixEvaluated", "gatesExecuted", "releaseMemoryUpdated", "packageGenerated", "deployExecuted"]) {
    if (intakeResult[key] !== false) throw new Error(`intake_result_${key}_invalid`);
  }
}

function signingPayload({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId, signedAt, nonce }) {
  return {
    signingSchema: "atlas.release-evidence-provenance-signing-payload.v1",
    compositionId: decision.compositionId,
    compositionDecisionHash: decision.decisionHash,
    evidencePlanHash: plan.planHash,
    intakePolicyHash: intakePolicy.policyHash,
    provenancePolicyHash: provenancePolicy.policyHash,
    intakeId: intake.intakeId,
    intakeHash: intake.intakeHash,
    intakeResultHash: intakeResult.resultHash,
    keyId,
    actorId: intake.submitter.actorId,
    role: intake.submitter.role,
    channel: intake.channel,
    signedAt,
    nonce,
    recordManifest: intake.recordManifest,
  };
}

export function createReleaseEvidenceProvenanceEnvelope({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId, signedAt, nonce, privateKey }) {
  assertBaseContext({ decision, plan, intakePolicy });
  const policyInspection = inspectReleaseEvidenceProvenancePolicy(provenancePolicy, { decision, plan, intakePolicy });
  if (!policyInspection.ok) throw new Error(`provenance_policy_invalid:${policyInspection.reason}`);
  const intakeInspection = inspectReleaseEvidenceIntake(intake, { decision, plan, policy: intakePolicy });
  if (!intakeInspection.ok) throw new Error(`intake_invalid:${intakeInspection.reason}`);
  assertAcceptedIntakeResult(intakeResult, intake);
  assertSlug(keyId, "key_id");
  assertIsoDate(signedAt, "signed_at");
  assertSlug(nonce, "nonce");
  const signer = provenancePolicy.trustedSigners.find((item) => item.keyId === keyId);
  if (!signer) throw new Error("signer_untrusted");
  const payload = signingPayload({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId, signedAt, nonce });
  let signature;
  try {
    signature = cryptoSign(null, canonicalBytes(payload), privateKey).toString("base64url");
  } catch {
    throw new Error("signature_creation_failed");
  }
  if (!cryptoVerify(null, canonicalBytes(payload), signer.publicKeyPem, Buffer.from(signature, "base64url"))) throw new Error("private_key_does_not_match_trusted_signer");
  const envelopePayload = { schema: RELEASE_EVIDENCE_PROVENANCE_ENVELOPE_SCHEMA, ...payload, signatureAlgorithm: RELEASE_EVIDENCE_SIGNATURE_ALGORITHM, signature };
  return { ...envelopePayload, envelopeHash: digest(envelopePayload) };
}

export function inspectReleaseEvidenceProvenanceEnvelope(envelope, context) {
  try {
    const { decision, plan, intakePolicy, provenancePolicy, intake, intakeResult } = context;
    assertBaseContext({ decision, plan, intakePolicy });
    const policyInspection = inspectReleaseEvidenceProvenancePolicy(provenancePolicy, { decision, plan, intakePolicy });
    if (!policyInspection.ok) throw new Error(`provenance_policy_invalid:${policyInspection.reason}`);
    const intakeInspection = inspectReleaseEvidenceIntake(intake, { decision, plan, policy: intakePolicy });
    if (!intakeInspection.ok) throw new Error(`intake_invalid:${intakeInspection.reason}`);
    assertAcceptedIntakeResult(intakeResult, intake);
    if (envelope?.schema !== RELEASE_EVIDENCE_PROVENANCE_ENVELOPE_SCHEMA) throw new Error("envelope_schema_invalid");
    if (envelope.signatureAlgorithm !== RELEASE_EVIDENCE_SIGNATURE_ALGORITHM) throw new Error("signature_algorithm_invalid");
    assertSlug(envelope.keyId, "key_id");
    assertIsoDate(envelope.signedAt, "signed_at");
    assertSlug(envelope.nonce, "nonce");
    if (typeof envelope.signature !== "string" || !/^[A-Za-z0-9_-]+$/.test(envelope.signature)) throw new Error("signature_invalid");
    const expectedPayload = signingPayload({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, keyId: envelope.keyId, signedAt: envelope.signedAt, nonce: envelope.nonce });
    for (const [key, value] of Object.entries(expectedPayload)) {
      if (JSON.stringify(envelope[key]) !== JSON.stringify(value)) throw new Error(`envelope_binding_invalid:${key}`);
    }
    const envelopePayload = { schema: RELEASE_EVIDENCE_PROVENANCE_ENVELOPE_SCHEMA, ...expectedPayload, signatureAlgorithm: envelope.signatureAlgorithm, signature: envelope.signature };
    if (digest(envelopePayload) !== envelope.envelopeHash) throw new Error("envelope_hash_mismatch");
    const signer = provenancePolicy.trustedSigners.find((item) => item.keyId === envelope.keyId);
    if (!signer) throw new Error("signer_untrusted");
    const signatureValid = cryptoVerify(null, canonicalBytes(expectedPayload), signer.publicKeyPem, Buffer.from(envelope.signature, "base64url"));
    if (!signatureValid) throw new Error("signature_verification_failed");
    return { ok: true, envelopeHash: envelope.envelopeHash, signer };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "provenance_envelope_invalid" };
  }
}

export function verifyReleaseEvidenceProvenance({ decision, plan, intakePolicy, provenancePolicy, intake, intakeResult, envelope, verifiedAt, seenEnvelopeHashes = [], seenNonces = [] }) {
  assertIsoDate(verifiedAt, "verified_at");
  const rejectionReasons = [];
  const inspection = inspectReleaseEvidenceProvenanceEnvelope(envelope, { decision, plan, intakePolicy, provenancePolicy, intake, intakeResult });
  if (!inspection.ok) rejectionReasons.push(`envelope_invalid:${inspection.reason}`);
  if (inspection.ok && seenEnvelopeHashes.includes(envelope.envelopeHash)) rejectionReasons.push("envelope_replay_detected");
  if (inspection.ok && seenNonces.includes(envelope.nonce)) rejectionReasons.push("nonce_replay_detected");
  if (inspection.ok) {
    const signer = inspection.signer;
    if (signer.actorId !== intake.submitter.actorId) rejectionReasons.push("signer_actor_mismatch");
    if (signer.role !== intake.submitter.role) rejectionReasons.push("signer_role_mismatch");
    if (!signer.channels.includes(intake.channel)) rejectionReasons.push("signer_channel_mismatch");
    if (Date.parse(envelope.signedAt) < Date.parse(signer.validFrom) || Date.parse(envelope.signedAt) > Date.parse(signer.validUntil)) rejectionReasons.push("signer_key_outside_validity");
    if (Date.parse(envelope.signedAt) < Date.parse(intake.submittedAt)) rejectionReasons.push("signature_before_submission");
    if (Date.parse(envelope.signedAt) > Date.parse(verifiedAt) + intakePolicy.maxClockSkewSeconds * 1000) rejectionReasons.push("signature_exceeds_clock_skew");
    if (Date.parse(verifiedAt) - Date.parse(envelope.signedAt) > provenancePolicy.maxSignatureAgeSeconds * 1000) rejectionReasons.push("signature_expired");
  }
  const reasons = [...new Set(rejectionReasons)].sort();
  const verified = inspection.ok && reasons.length === 0;
  const payload = {
    schema: RELEASE_EVIDENCE_PROVENANCE_RESULT_SCHEMA,
    compositionId: decision.compositionId,
    intakeId: intake?.intakeId ?? null,
    intakeHash: intake?.intakeHash ?? null,
    envelopeHash: inspection.ok ? envelope.envelopeHash : null,
    verifiedAt,
    status: verified ? "provenance_verified" : "quarantined",
    rejectionReasons: reasons,
    signerKeyId: inspection.ok ? envelope.keyId : null,
    signerFingerprint: inspection.ok ? inspection.signer.publicKeyFingerprint : null,
    recordsBoundToSignature: verified ? intake.records.length : 0,
    provenanceVerified: verified,
    eligibleForEvidenceMatrix: false,
    evidenceMatrixEvaluated: false,
    gatesExecuted: false,
    releaseMemoryUpdated: false,
    packageGenerated: false,
    deployExecuted: false,
  };
  return { ...payload, resultHash: digest(payload) };
}

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RPC_NAME = "atlas_prepare_meta_permit_reservation_v1";

export class MetaPermitLedgerAdapterError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.name = "MetaPermitLedgerAdapterError";
    this.code = code;
  }
}

function assertHash(value, field) {
  if (!HASH.test(value ?? "")) throw new MetaPermitLedgerAdapterError(`invalid_${field}`);
}

function assertUuid(value, field) {
  if (!UUID.test(value ?? "")) throw new MetaPermitLedgerAdapterError(`invalid_${field}`);
}

function assertDistinct(values) {
  if (new Set(values).size !== values.length) throw new MetaPermitLedgerAdapterError("ledger_identity_collision");
}

export function buildMetaPermitReservationRpcArgs(input, now = Date.now()) {
  if (!input || typeof input !== "object") throw new MetaPermitLedgerAdapterError("invalid_reservation_input");
  assertUuid(input.organizationId, "organization_id");
  assertUuid(input.actorId, "actor_id");
  if (input.slotId !== "repeatability_02" || input.sampleOrdinal !== 2) throw new MetaPermitLedgerAdapterError("invalid_target_slot");
  if (input.expectedRevision !== 0 || input.proposedRevision !== 1) throw new MetaPermitLedgerAdapterError("invalid_revision_contract");
  const fingerprints = [
    input.phase27Fingerprint,
    input.phase26Fingerprint,
    input.ledgerKeyFingerprint,
    input.contractReferenceFingerprint,
    input.permitNonceFingerprint,
    input.idempotencyFingerprint,
    input.eventIdFingerprint,
    input.syntheticRecordFingerprint,
    input.evidenceFingerprint,
  ];
  const fields = [
    "phase27_fingerprint",
    "phase26_fingerprint",
    "ledger_key_fingerprint",
    "contract_reference_fingerprint",
    "permit_nonce_fingerprint",
    "idempotency_fingerprint",
    "event_id_fingerprint",
    "synthetic_record_fingerprint",
    "evidence_fingerprint",
  ];
  fingerprints.forEach((value, index) => assertHash(value, fields[index]));
  assertDistinct(fingerprints);
  const expiresAt = Date.parse(input.expiresAt ?? "");
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 5 * 60_000) throw new MetaPermitLedgerAdapterError("invalid_reservation_expiry");
  return Object.freeze({
    p_organization_id: input.organizationId,
    p_actor_id: input.actorId,
    p_slot_id: input.slotId,
    p_sample_ordinal: input.sampleOrdinal,
    p_expected_revision: input.expectedRevision,
    p_proposed_revision: input.proposedRevision,
    p_expires_at: new Date(expiresAt).toISOString(),
    p_phase27_fingerprint: input.phase27Fingerprint,
    p_phase26_fingerprint: input.phase26Fingerprint,
    p_ledger_key_fingerprint: input.ledgerKeyFingerprint,
    p_contract_reference_fingerprint: input.contractReferenceFingerprint,
    p_permit_nonce_fingerprint: input.permitNonceFingerprint,
    p_idempotency_fingerprint: input.idempotencyFingerprint,
    p_event_id_fingerprint: input.eventIdFingerprint,
    p_synthetic_record_fingerprint: input.syntheticRecordFingerprint,
    p_evidence_fingerprint: input.evidenceFingerprint,
  });
}

function normalizeReservationResult(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new MetaPermitLedgerAdapterError("ledger_rpc_empty_result");
  if (!UUID.test(row.reservation_id ?? "")) throw new MetaPermitLedgerAdapterError("ledger_rpc_invalid_reservation_id");
  if (!['reserved', 'duplicate'].includes(row.disposition)) throw new MetaPermitLedgerAdapterError("ledger_rpc_invalid_disposition");
  if (row.state !== "reserved_unissued" || row.revision !== 1) throw new MetaPermitLedgerAdapterError("ledger_rpc_invalid_state");
  assertHash(row.evidence_fingerprint, "rpc_evidence_fingerprint");
  if (!Number.isFinite(Date.parse(row.expires_at ?? ""))) throw new MetaPermitLedgerAdapterError("ledger_rpc_invalid_expiry");
  return Object.freeze({
    reservationId: row.reservation_id,
    disposition: row.disposition,
    state: row.state,
    revision: row.revision,
    evidenceFingerprint: row.evidence_fingerprint,
    expiresAt: row.expires_at,
  });
}

export async function prepareMetaPermitReservation({ rpc, input, now = Date.now() }) {
  if (typeof rpc !== "function") throw new MetaPermitLedgerAdapterError("ledger_rpc_not_injected");
  const args = buildMetaPermitReservationRpcArgs(input, now);
  let response;
  try {
    response = await rpc(RPC_NAME, args);
  } catch (error) {
    throw new MetaPermitLedgerAdapterError("ledger_rpc_transport_failed", error);
  }
  if (response?.error) throw new MetaPermitLedgerAdapterError("ledger_rpc_rejected", response.error);
  return normalizeReservationResult(response?.data);
}

export const META_PERMIT_LEDGER_RPC = RPC_NAME;

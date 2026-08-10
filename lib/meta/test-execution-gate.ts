import { createHash } from "node:crypto";

export const META_TEST_EXECUTION_GATE_SCHEMA = "atlas.meta.execution-gate.v1";
export const META_TEST_EXECUTION_CONFIRMATION = "AUTORIZAR_TESTE_META_UNICO";
export const META_TEST_EXECUTION_SCOPE = "meta.test-lead.single-delivery";
export const META_TEST_EXECUTION_GATE_TTL_MS = 10 * 60 * 1000;

export const META_TEST_DRY_RUN_CHECKS = [
  "approval_active",
  "payload_schema_valid",
  "payload_fingerprint_matches",
  "tenant_isolated",
  "delivery_count_zero",
] as const;

export type MetaTestExecutionGate = {
  approvalId: string;
  authorizationScope: typeof META_TEST_EXECUTION_SCOPE;
  deliveryAuthorized: true;
  dryRunApproved: true;
  dryRunChecks: typeof META_TEST_DRY_RUN_CHECKS;
  executionStatus: "authorized";
  expiresAt: string;
  externalEventSent: false;
  frozenPayloadId: string;
  idempotencyKey: string;
  maxDeliveries: 1;
  payloadFingerprint: string;
  schemaVersion: typeof META_TEST_EXECUTION_GATE_SCHEMA;
};

export function buildMetaTestExecutionIdempotencyKey(input: {
  frozenPayloadId: string;
  organizationId: string;
  payloadFingerprint: string;
}) {
  return createHash("sha256")
    .update([
      META_TEST_EXECUTION_SCOPE,
      input.organizationId,
      input.frozenPayloadId,
      input.payloadFingerprint,
    ].join(":"))
    .digest("hex");
}

export function buildMetaTestExecutionGate(input: {
  approvalExpiresAt: string;
  approvalId: string;
  frozenPayloadId: string;
  now?: Date;
  organizationId: string;
  payloadFingerprint: string;
}): MetaTestExecutionGate {
  const now = input.now ?? new Date();
  const approvalExpiryMs = Date.parse(input.approvalExpiresAt);
  const expiresAtMs = Math.min(
    approvalExpiryMs,
    now.getTime() + META_TEST_EXECUTION_GATE_TTL_MS,
  );

  if (!Number.isFinite(approvalExpiryMs) || expiresAtMs <= now.getTime()) {
    throw new Error("A aprovação não possui uma janela válida para execução.");
  }

  return {
    approvalId: input.approvalId,
    authorizationScope: META_TEST_EXECUTION_SCOPE,
    deliveryAuthorized: true,
    dryRunApproved: true,
    dryRunChecks: META_TEST_DRY_RUN_CHECKS,
    executionStatus: "authorized",
    expiresAt: new Date(expiresAtMs).toISOString(),
    externalEventSent: false,
    frozenPayloadId: input.frozenPayloadId,
    idempotencyKey: buildMetaTestExecutionIdempotencyKey(input),
    maxDeliveries: 1,
    payloadFingerprint: input.payloadFingerprint,
    schemaVersion: META_TEST_EXECUTION_GATE_SCHEMA,
  };
}

export function fingerprintMetaTestExecutionGate(gate: MetaTestExecutionGate) {
  return createHash("sha256").update(JSON.stringify(gate)).digest("hex");
}

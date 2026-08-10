import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetaTestExecutionGate,
  fingerprintMetaTestExecutionGate,
  META_TEST_DRY_RUN_CHECKS,
} from "../../lib/meta/test-execution-gate.ts";

const base = {
  approvalExpiresAt: "2026-08-08T15:30:00.000Z",
  approvalId: "11111111-1111-4111-8111-111111111111",
  frozenPayloadId: "22222222-2222-4222-8222-222222222222",
  now: new Date("2026-08-08T15:00:00.000Z"),
  organizationId: "33333333-3333-4333-8333-333333333333",
  payloadFingerprint: "a".repeat(64),
};

test("gate Meta é determinístico, temporário e limitado a uma entrega", () => {
  const first = buildMetaTestExecutionGate(base);
  const second = buildMetaTestExecutionGate(base);

  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.expiresAt, "2026-08-08T15:10:00.000Z");
  assert.equal(first.maxDeliveries, 1);
  assert.equal(first.deliveryAuthorized, true);
  assert.equal(first.externalEventSent, false);
  assert.equal(first.dryRunApproved, true);
  assert.deepEqual(first.dryRunChecks, META_TEST_DRY_RUN_CHECKS);
  assert.match(fingerprintMetaTestExecutionGate(first), /^[0-9a-f]{64}$/);
});

test("gate nunca ultrapassa a aprovação original", () => {
  const gate = buildMetaTestExecutionGate({
    ...base,
    approvalExpiresAt: "2026-08-08T15:04:00.000Z",
  });

  assert.equal(gate.expiresAt, "2026-08-08T15:04:00.000Z");
});

test("gate rejeita aprovação expirada ou inválida", () => {
  assert.throws(
    () => buildMetaTestExecutionGate({
      ...base,
      approvalExpiresAt: "2026-08-08T14:59:59.000Z",
    }),
    /não possui uma janela válida/,
  );
  assert.throws(
    () => buildMetaTestExecutionGate({ ...base, approvalExpiresAt: "inválida" }),
    /não possui uma janela válida/,
  );
});

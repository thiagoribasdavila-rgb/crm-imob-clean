import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMetaTestEventId,
  fingerprintMetaTestDeliveryReceipt,
  META_TEST_DELIVERY_SCHEMA,
} from "../../lib/meta/test-delivery.ts";

const receipt = {
  attempts: 1,
  datasetIdMasked: "••••1234",
  deliveredAt: "2026-08-08T18:00:00.000Z",
  eventId: "atlas-test-abc123",
  eventName: "Lead",
  eventsReceived: 1,
  externalEventSent: true,
  gateFingerprint: "a".repeat(64),
  gateId: "11111111-1111-4111-8111-111111111111",
  mode: "test",
  productionEnabled: false,
  schemaVersion: META_TEST_DELIVERY_SCHEMA,
  status: "delivered",
  traceId: "trace-safe",
};

test("identidade Meta é determinística e reutilizável", () => {
  assert.equal(buildMetaTestEventId("abc123"), "atlas-test-abc123");
  assert.equal(buildMetaTestEventId("abc123"), buildMetaTestEventId("abc123"));
});

test("recibo técnico possui fingerprint estável", () => {
  const first = fingerprintMetaTestDeliveryReceipt(receipt);
  const second = fingerprintMetaTestDeliveryReceipt({ ...receipt });
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("contrato do recibo mantém teste e produção desligada", () => {
  assert.equal(receipt.mode, "test");
  assert.equal(receipt.productionEnabled, false);
  assert.equal(receipt.eventsReceived, 1);
  assert.equal(receipt.schemaVersion, "atlas.meta.delivery-receipt.v1");
  for (const forbidden of ["phone", "email", "cpf", "accessToken", "cronSecret"]) {
    assert.equal(Object.hasOwn(receipt, forbidden), false);
  }
});

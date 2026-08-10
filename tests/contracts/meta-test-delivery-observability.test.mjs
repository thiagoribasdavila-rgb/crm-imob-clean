import assert from "node:assert/strict";
import test from "node:test";
import {
  META_TEST_DELIVERY_OBSERVATION_SCHEMA,
  observeMetaTestDelivery,
} from "../../lib/meta/test-delivery-observability.ts";

const base = {
  attempts: 0,
  customData: { gate_id: "11111111-1111-4111-8111-111111111111" },
  deliveredAt: null,
  eventId: "atlas-test-safe-event",
  eventName: "Lead",
  hasFailure: false,
  hasReceipt: false,
  metaResponse: null,
  occurredAt: "2026-08-08T18:00:00.000Z",
  status: "pending",
};

test("confirma entrega somente com recibo, delivered_at e um evento recebido", () => {
  const observation = observeMetaTestDelivery({
    ...base,
    attempts: 1,
    deliveredAt: "2026-08-08T18:01:00.000Z",
    hasReceipt: true,
    metaResponse: { events_received: 1, trace_id: "not-returned" },
    status: "delivered",
  });
  assert.equal(observation.operationalStatus, "confirmed");
  assert.equal(observation.repeatBlocked, true);
  assert.equal(observation.eventsReceived, 1);
});

test("fila sem tentativa externa deve somente aguardar o worker", () => {
  const observation = observeMetaTestDelivery(base);
  assert.equal(observation.operationalStatus, "waiting_local_worker");
  assert.equal(observation.externalAttempted, false);
  assert.equal(observation.repeatBlocked, true);
});

test("falha anterior a tentativa externa é distinguida com segurança", () => {
  const observation = observeMetaTestDelivery({
    ...base,
    hasFailure: true,
    status: "failed",
  });
  assert.equal(observation.operationalStatus, "failed_before_external_attempt");
  assert.equal(observation.repeatBlocked, false);
});

test("qualquer tentativa sem recibo bloqueia reenvio e exige conciliação", () => {
  const observation = observeMetaTestDelivery({
    ...base,
    attempts: 1,
    hasFailure: true,
    status: "failed",
  });
  assert.equal(observation.operationalStatus, "external_result_inconclusive");
  assert.equal(observation.repeatBlocked, true);
  assert.match(observation.nextAction, /Não reenviar/);
});

test("status delivered sem recibo continua inconclusivo", () => {
  const observation = observeMetaTestDelivery({
    ...base,
    status: "delivered",
  });
  assert.equal(observation.operationalStatus, "external_result_inconclusive");
});

test("observação é sanitizada e versionada", () => {
  const observation = observeMetaTestDelivery(base);
  assert.equal(observation.schemaVersion, META_TEST_DELIVERY_OBSERVATION_SCHEMA);
  const serialized = JSON.stringify(observation);
  for (const forbidden of ["phone", "email", "cpf", "accessToken", "last_error", "trace_id"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

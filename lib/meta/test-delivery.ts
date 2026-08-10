import { createHash } from "node:crypto";

export const META_TEST_DELIVERY_SCHEMA = "atlas.meta.delivery-receipt.v1";
export const META_TEST_DELIVERY_CONFIRMATION = "ENVIAR_TESTE_META_AGORA";
export const META_TEST_DELIVERY_SCOPE = "meta.test-lead.delivery";

export type MetaTestDeliveryReceipt = {
  attempts: number;
  datasetIdMasked: string;
  deliveredAt: string;
  eventId: string;
  eventName: "Lead";
  eventsReceived: 1;
  externalEventSent: true;
  gateFingerprint: string;
  gateId: string;
  mode: "test";
  productionEnabled: false;
  schemaVersion: typeof META_TEST_DELIVERY_SCHEMA;
  status: "delivered";
  traceId: string | null;
};

export function buildMetaTestEventId(idempotencyKey: string) {
  return `atlas-test-${idempotencyKey}`;
}

export function fingerprintMetaTestDeliveryReceipt(receipt: MetaTestDeliveryReceipt) {
  return createHash("sha256").update(JSON.stringify(receipt)).digest("hex");
}

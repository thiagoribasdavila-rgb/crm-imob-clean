export const META_TEST_DELIVERY_OBSERVATION_SCHEMA = "atlas.meta.delivery-observation.v1";

export type MetaTestDeliveryOperationalStatus =
  | "confirmed"
  | "waiting_local_worker"
  | "failed_before_external_attempt"
  | "external_result_inconclusive"
  | "dead_letter";

export type MetaTestDeliveryObservation = {
  attempts: number;
  deliveredAt: string | null;
  eventId: string;
  eventName: string;
  eventsReceived: number | null;
  externalAttempted: boolean;
  gateId: string | null;
  hasReceipt: boolean;
  nextAction: string;
  occurredAt: string;
  operationalStatus: MetaTestDeliveryOperationalStatus;
  repeatBlocked: boolean;
  schemaVersion: typeof META_TEST_DELIVERY_OBSERVATION_SCHEMA;
};

type MetaTestConversionObservationInput = {
  attempts: number | null;
  customData: Record<string, unknown> | null;
  deliveredAt: string | null;
  eventId: string;
  eventName: string;
  hasFailure: boolean;
  hasReceipt: boolean;
  metaResponse: Record<string, unknown> | null;
  occurredAt: string;
  status: string;
};

function receivedEvents(response: Record<string, unknown> | null) {
  const value = response?.events_received;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function observeMetaTestDelivery(
  input: MetaTestConversionObservationInput,
): MetaTestDeliveryObservation {
  const attempts = Math.max(0, Number(input.attempts ?? 0));
  const eventsReceived = receivedEvents(input.metaResponse);
  const confirmed = input.hasReceipt
    && input.status === "delivered"
    && Boolean(input.deliveredAt)
    && eventsReceived === 1;
  const externalAttempted = attempts > 0;
  const gateId = typeof input.customData?.gate_id === "string"
    ? input.customData.gate_id.slice(0, 64)
    : null;

  let operationalStatus: MetaTestDeliveryOperationalStatus;
  let nextAction: string;
  if (confirmed) {
    operationalStatus = "confirmed";
    nextAction = "Preservar o recibo e não repetir o evento.";
  } else if (input.status === "dead_letter" || input.status === "blocked") {
    operationalStatus = "dead_letter";
    nextAction = "Revisar a configuração e a trilha segura antes de autorizar um novo teste.";
  } else if (externalAttempted || input.status === "delivered") {
    operationalStatus = "external_result_inconclusive";
    nextAction = "Não reenviar. Conferir o Events Manager e reconciliar a confirmação pelo mesmo event_id.";
  } else if (input.status === "failed" || input.hasFailure) {
    operationalStatus = "failed_before_external_attempt";
    nextAction = "Corrigir a falha local e repetir somente a ação controlada com o mesmo event_id.";
  } else {
    operationalStatus = "waiting_local_worker";
    nextAction = "Aguardar o worker Hostinger; não criar outra autorização enquanto este evento estiver pendente.";
  }

  return {
    attempts,
    deliveredAt: input.deliveredAt,
    eventId: input.eventId,
    eventName: input.eventName,
    eventsReceived,
    externalAttempted,
    gateId,
    hasReceipt: input.hasReceipt,
    nextAction,
    occurredAt: input.occurredAt,
    operationalStatus,
    repeatBlocked: operationalStatus !== "failed_before_external_attempt",
    schemaVersion: META_TEST_DELIVERY_OBSERVATION_SCHEMA,
  };
}

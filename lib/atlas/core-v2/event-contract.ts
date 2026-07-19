export type AtlasActor =
  | { kind: "human"; id: string }
  | { kind: "system"; id: string }
  | {
      kind: "agent";
      id: string;
      autonomyLevel: 0 | 1 | 2 | 3 | 4;
      humanApproval?: { approvedBy: string; approvedAt: string; reason: string };
    };

export type AtlasCommercialEvent<TPayload extends Record<string, unknown>> = {
  id: string;
  eventType: string;
  schemaVersion: number;
  organizationId: string;
  entity: { type: string; id: string };
  actor: AtlasActor;
  source: string;
  occurredAt: string;
  recordedAt: string;
  idempotencyKey: string;
  piiClassification: "none" | "internal" | "personal" | "sensitive";
  payload: Readonly<TPayload>;
  immutable: true;
};

function isIsoDate(value: string) {
  return Boolean(value) && !Number.isNaN(Date.parse(value));
}

export function validateAtlasCommercialEvent<TPayload extends Record<string, unknown>>(
  event: AtlasCommercialEvent<TPayload>,
) {
  const errors: string[] = [];
  if (!event.id.trim()) errors.push("event-id-is-required");
  if (!event.eventType.trim()) errors.push("event-type-is-required");
  if (!Number.isInteger(event.schemaVersion) || event.schemaVersion < 1) errors.push("schema-version-is-invalid");
  if (!event.organizationId.trim()) errors.push("organization-id-is-required");
  if (!event.entity.type.trim() || !event.entity.id.trim()) errors.push("entity-reference-is-required");
  if (!event.source.trim()) errors.push("event-source-is-required");
  if (!isIsoDate(event.occurredAt) || !isIsoDate(event.recordedAt)) errors.push("event-dates-must-be-iso");
  if (!event.idempotencyKey.trim()) errors.push("idempotency-key-is-required");
  if (event.immutable !== true) errors.push("event-must-be-immutable");

  if (event.actor.kind === "agent" && event.actor.autonomyLevel >= 3) {
    const approval = event.actor.humanApproval;
    if (!approval?.approvedBy || !isIsoDate(approval.approvedAt) || !approval.reason.trim()) {
      errors.push("agent-execution-requires-human-approval");
    }
  }

  return { valid: errors.length === 0, errors } as const;
}

export function defineAtlasCommercialEvent<const TPayload extends Record<string, unknown>>(
  event: AtlasCommercialEvent<TPayload>,
) {
  const validation = validateAtlasCommercialEvent(event);
  if (!validation.valid) {
    throw new Error(`Invalid ATLAS commercial event: ${validation.errors.join(", ")}`);
  }
  return Object.freeze(event);
}

import { validateCommercialEventEnvelope } from "./preflight-meta-commercial-event-envelope.mjs";

const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "commercial_outbox_blocked", issues: [...issues], dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateCommercialOutbox(outbox) {
  const issues = new Set();
  if (!outbox || outbox.schema !== "atlas.meta-commercial-outbox.v1") issues.add("schema_invalid");
  if (outbox?.status !== (outbox?.events?.length ? "validated_dispatch_disabled" : "empty_dispatch_disabled")) issues.add("outbox_status_invalid");
  if (!Array.isArray(outbox?.events)) issues.add("events_invalid");
  if (outbox?.dispatch?.enabled !== false || outbox?.dispatch?.automaticRetry !== false || outbox?.dispatch?.provider !== null) issues.add("external_dispatch_must_remain_disabled");
  if (!outbox?.forbidden || Object.values(outbox.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(outbox ?? {}).some((key) => !["schema", "status", "events", "dispatch", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  const seen = new Set();
  for (const [index, item] of (outbox?.events ?? []).entries()) {
    if (!safeReference.test(item?.queueId ?? "")) issues.add(`queue_id_invalid:${index + 1}`);
    if (item?.status !== "validated_not_dispatchable") issues.add(`queue_item_status_invalid:${index + 1}`);
    if (seen.has(item?.event?.idempotencyKey)) issues.add("idempotency_key_reused");
    seen.add(item?.event?.idempotencyKey);
    if (!validateCommercialEventEnvelope(item?.event).approved) issues.add(`event_invalid:${index + 1}`);
  }
  return issues.size ? blocked(issues) : { approved: true, status: "commercial_outbox_valid_dispatch_still_disabled", dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestCommercialOutbox() {
  const event = { schema: "atlas.meta-commercial-event-envelope.v1", status: "validated_not_dispatchable", eventId: "event-20260719-0001", signal: "lead_qualified", occurredAt: "2026-07-19T12:00:00.000Z", organizationReference: "organization-demo-001", leadReference: "lead-safe-001", consent: true, humanConfirmed: true, idempotencyKey: "idem-qualified-001", value: null, currency: null, dispatch: { enabled: false, provider: null }, forbidden: { rawPhone: true, rawEmail: true, rawName: true, tokens: true, cookies: true, customerNotes: true } };
  const base = { schema: "atlas.meta-commercial-outbox.v1", status: "validated_dispatch_disabled", events: [{ queueId: "outbox-20260719-0001", status: "validated_not_dispatchable", event }], dispatch: { enabled: false, automaticRetry: false, provider: null }, forbidden: { secrets: true, rawSessions: true, customerData: true, personalData: true, automaticProductionDispatch: true } };
  const cases = [["valid", (value) => value, true], ["dispatch-open", (value) => ({ ...value, dispatch: { ...value.dispatch, enabled: true } }), false], ["retry-open", (value) => ({ ...value, dispatch: { ...value.dispatch, automaticRetry: true } }), false], ["duplicate", (value) => ({ ...value, events: [...value.events, { ...value.events[0], queueId: "outbox-20260719-0002" }] }), false], ["invalid-event", (value) => ({ ...value, events: [{ ...value.events[0], event: { ...value.events[0].event, consent: false } }] }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateCommercialOutbox(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestCommercialOutbox(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }

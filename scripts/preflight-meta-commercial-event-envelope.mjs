const supported = new Set(["lead_received", "lead_qualified", "contact_completed", "visit_scheduled", "proposal_sent", "sale_confirmed"]);
const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "commercial_event_envelope_blocked", issues: [...issues], dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateCommercialEventEnvelope(event) {
  const issues = new Set();
  if (!event || event.schema !== "atlas.meta-commercial-event-envelope.v1") issues.add("schema_invalid");
  if (event?.status !== "validated_not_dispatchable") issues.add("event_status_invalid");
  if (!safeReference.test(event?.eventId ?? "")) issues.add("event_id_invalid");
  if (!supported.has(event?.signal)) issues.add("unsupported_signal");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event?.occurredAt ?? "")) issues.add("occurred_at_invalid");
  for (const field of ["organizationReference", "leadReference", "idempotencyKey"]) if (!safeReference.test(event?.[field] ?? "")) issues.add(`safe_reference_missing:${field}`);
  if (event?.consent !== true) issues.add("consent_required");
  if (["lead_qualified", "contact_completed", "visit_scheduled", "proposal_sent", "sale_confirmed"].includes(event?.signal) && event?.humanConfirmed !== true) issues.add("human_confirmation_required");
  if (["proposal_sent", "sale_confirmed"].includes(event?.signal) && (!(typeof event?.value === "number") || event.value < 0 || event?.currency !== "BRL")) issues.add("revenue_value_invalid");
  if (!["proposal_sent", "sale_confirmed"].includes(event?.signal) && (event?.value !== null || event?.currency !== null)) issues.add("non_revenue_value_not_allowed");
  if (event?.dispatch?.enabled !== false || event?.dispatch?.provider !== null) issues.add("external_dispatch_must_remain_disabled");
  if (!event?.forbidden || Object.values(event.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(event ?? {}).some((key) => !["schema", "status", "eventId", "signal", "occurredAt", "organizationReference", "leadReference", "consent", "humanConfirmed", "idempotencyKey", "value", "currency", "dispatch", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "commercial_event_valid_dispatch_still_disabled", dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestCommercialEventEnvelope() {
  const base = { schema: "atlas.meta-commercial-event-envelope.v1", status: "validated_not_dispatchable", eventId: "event-20260719-0001", signal: "sale_confirmed", occurredAt: "2026-07-19T12:00:00.000Z", organizationReference: "organization-demo-001", leadReference: "lead-safe-001", consent: true, humanConfirmed: true, idempotencyKey: "idem-sale-001", value: 540000, currency: "BRL", dispatch: { enabled: false, provider: null }, forbidden: { rawPhone: true, rawEmail: true, rawName: true, tokens: true, cookies: true, customerNotes: true } };
  const cases = [["valid", (value) => value, true], ["no-consent", (value) => ({ ...value, consent: false }), false], ["no-human-confirmation", (value) => ({ ...value, humanConfirmed: false }), false], ["dispatch-open", (value) => ({ ...value, dispatch: { enabled: true, provider: "meta" } }), false], ["raw-email", (value) => ({ ...value, email: "not-allowed" }), false], ["non-revenue-value", (value) => ({ ...value, signal: "lead_received", value: 1, currency: "BRL", humanConfirmed: false }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateCommercialEventEnvelope(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestCommercialEventEnvelope(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }

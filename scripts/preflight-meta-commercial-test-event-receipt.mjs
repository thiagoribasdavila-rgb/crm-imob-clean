const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const blocked = (issues) => ({ approved: false, status: "commercial_test_event_receipt_blocked", issues: [...issues], productionAllowed: false, retryAllowed: false, automaticPromotionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateCommercialTestEventReceipt(receipt) {
  const issues = new Set();
  if (!receipt || receipt.schema !== "atlas.meta-commercial-test-event-receipt.v1") issues.add("schema_invalid");
  if (receipt?.status !== "accepted_in_isolated_test") issues.add("test_event_not_accepted");
  for (const field of ["rehearsalReference", "outboxReference", "eventReference"]) if (!safeReference.test(receipt?.[field] ?? "")) issues.add(`safe_reference_missing:${field}`);
  if (receipt?.accepted !== true) issues.add("acceptance_missing");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receipt?.observedAt ?? "")) issues.add("observed_at_invalid");
  if (!["accepted", "accepted_with_warning"].includes(receipt?.providerResponseClass)) issues.add("response_class_invalid");
  if (receipt?.payloadStored !== false) issues.add("payload_storage_forbidden");
  for (const field of ["productionAllowed", "retryAllowed", "automaticPromotionAllowed"]) if (receipt?.dispatch?.[field] !== false) issues.add(`dispatch_guardrail_open:${field}`);
  if (!receipt?.forbidden || Object.values(receipt.forbidden).some((value) => value !== true)) issues.add("sensitive_data_protection_missing");
  if (Object.keys(receipt ?? {}).some((key) => !["schema", "status", "rehearsalReference", "outboxReference", "eventReference", "accepted", "observedAt", "providerResponseClass", "payloadStored", "dispatch", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "commercial_test_event_receipt_valid_promotion_still_blocked", productionAllowed: false, retryAllowed: false, automaticPromotionAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestCommercialTestEventReceipt() {
  const base = { schema: "atlas.meta-commercial-test-event-receipt.v1", status: "accepted_in_isolated_test", rehearsalReference: "rehearsal-20260719-001", outboxReference: "outbox-proof-20260719", eventReference: "event-safe-001", accepted: true, observedAt: "2026-07-19T12:00:00.000Z", providerResponseClass: "accepted", payloadStored: false, dispatch: { productionAllowed: false, retryAllowed: false, automaticPromotionAllowed: false }, forbidden: { payload: true, secrets: true, rawCustomerData: true, personalData: true, providerResponseBody: true } };
  const cases = [["valid", (value) => value, true], ["payload", (value) => ({ ...value, payloadStored: true }), false], ["promotion", (value) => ({ ...value, dispatch: { ...value.dispatch, automaticPromotionAllowed: true } }), false], ["unsafe-response", (value) => ({ ...value, providerResponseBody: "not-allowed" }), false], ["not-accepted", (value) => ({ ...value, accepted: false }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateCommercialTestEventReceipt(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestCommercialTestEventReceipt(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }

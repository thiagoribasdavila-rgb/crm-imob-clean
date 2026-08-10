const allowedSignals = new Set(["lead_received", "lead_qualified", "contact_completed", "visit_scheduled", "proposal_sent", "sale_confirmed"]);
const expectedStages = { lead_received: "new", lead_qualified: "qualified", contact_completed: "contact", visit_scheduled: "visit", proposal_sent: "proposal", sale_confirmed: "won" };
const blocked = (issues) => ({ approved: false, status: "commercial_signal_contract_blocked", issues: [...issues], dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateCommercialSignalContract(contract) {
  const issues = new Set();
  if (!contract || contract.schema !== "atlas.meta-commercial-signal-contract.v1") issues.add("schema_invalid");
  if (contract?.status !== "prepared_no_external_dispatch") issues.add("external_dispatch_state_invalid");
  const signals = contract?.signals ?? [];
  if (signals.length !== allowedSignals.size) issues.add("signal_coverage_invalid");
  const names = new Set();
  for (const signal of signals) {
    if (!allowedSignals.has(signal?.name)) issues.add(`unsupported_signal:${signal?.name ?? "unknown"}`);
    if (names.has(signal?.name)) issues.add("duplicate_signal");
    names.add(signal?.name);
    if (expectedStages[signal?.name] !== signal?.stage) issues.add(`stage_mapping_invalid:${signal?.name ?? "unknown"}`);
    if (["proposal_sent", "sale_confirmed"].includes(signal?.name) && (!signal?.valueRequired || !signal?.humanConfirmationRequired)) issues.add(`revenue_signal_governance_invalid:${signal?.name}`);
  }
  const guardrails = contract?.guardrails;
  for (const field of ["requiresConsent", "requiresServerSideHashing", "requiresIdempotencyKey", "requiresHumanConfirmationForRevenue"]) if (guardrails?.[field] !== true) issues.add(`guardrail_missing:${field}`);
  for (const field of ["dispatchEnabled", "allowsClientSecrets", "allowsCustomerDataInLogs", "allowsAutomaticOptimizationClaims"]) if (guardrails?.[field] !== false) issues.add(`guardrail_open:${field}`);
  return issues.size ? blocked(issues) : { approved: true, status: "commercial_signal_contract_valid_dispatch_still_blocked", dispatchAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestCommercialSignalContract() {
  const base = { schema: "atlas.meta-commercial-signal-contract.v1", status: "prepared_no_external_dispatch", signals: [...allowedSignals].map((name) => ({ name, stage: expectedStages[name], valueRequired: ["proposal_sent", "sale_confirmed"].includes(name), humanConfirmationRequired: name !== "lead_received" })), guardrails: { dispatchEnabled: false, requiresConsent: true, requiresServerSideHashing: true, requiresIdempotencyKey: true, requiresHumanConfirmationForRevenue: true, allowsClientSecrets: false, allowsCustomerDataInLogs: false, allowsAutomaticOptimizationClaims: false } };
  const cases = [["valid", (value) => value, true], ["dispatch", (value) => ({ ...value, guardrails: { ...value.guardrails, dispatchEnabled: true } }), false], ["revenue-without-human", (value) => ({ ...value, signals: value.signals.map((signal) => signal.name === "sale_confirmed" ? { ...signal, humanConfirmationRequired: false } : signal) }), false], ["duplicate", (value) => ({ ...value, signals: [...value.signals, value.signals[0]] }), false], ["client-secret", (value) => ({ ...value, guardrails: { ...value.guardrails, allowsClientSecrets: true } }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateCommercialSignalContract(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestCommercialSignalContract(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }

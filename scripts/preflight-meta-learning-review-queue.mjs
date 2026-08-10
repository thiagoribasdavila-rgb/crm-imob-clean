const safeReference = /^[a-z0-9][a-z0-9._:-]{5,120}$/i;
const priorities = new Set(["urgent", "high", "normal"]);
const reasons = new Set(["revoked_memory", "expired_memory", "expiring_memory", "blocked_memory"]);
const owners = new Set(["DIRETOR_DECISOR", "DIRETOR", "GERENTE"]);
const blocked = (issues) => ({ approved: false, status: "meta_learning_review_queue_blocked", issues: [...issues], queueDisplayAllowed: false, taskCreationAllowed: false, notificationAllowed: false, memoryChangeAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false });

export function validateMetaLearningReviewQueue(item) {
  const issues = new Set();
  if (!item || item.schema !== "atlas.meta-learning-review-queue.v1") issues.add("schema_invalid");
  if (item?.status !== "review_queue_item_ready") issues.add("queue_item_not_ready");
  if (!safeReference.test(item?.healthSummaryReference ?? "")) issues.add("health_summary_reference_missing");
  const queue = item?.queue;
  if (queue?.aggregateOnly !== true || !priorities.has(queue?.priorityClass) || !reasons.has(queue?.reasonClass) || !owners.has(queue?.humanOwnerRole) || queue?.reviewRequired !== true) issues.add("queue_fields_invalid");
  if (["revoked_memory", "expired_memory"].includes(queue?.reasonClass) && queue?.priorityClass !== "urgent") issues.add("critical_memory_requires_urgent_review");
  if (item?.execution?.taskCreated !== false || item?.execution?.notificationSent !== false || item?.execution?.memoryChanged !== false || item?.execution?.productionTouched !== false) issues.add("automatic_action_observed");
  if (!item?.forbidden || Object.values(item.forbidden).some((value) => value !== true)) issues.add("safety_protections_missing");
  if (Object.keys(item ?? {}).some((key) => !["schema", "status", "healthSummaryReference", "queue", "execution", "forbidden"].includes(key))) issues.add("sensitive_data_detected");
  return issues.size ? blocked(issues) : { approved: true, status: "meta_learning_review_queue_valid_human_action_required", queueDisplayAllowed: true, taskCreationAllowed: false, notificationAllowed: false, memoryChangeAllowed: false, databaseTouched: false, stagingTouched: false, productionTouched: false, metaTouched: false };
}

export function selfTestMetaLearningReviewQueue() {
  const base = { schema: "atlas.meta-learning-review-queue.v1", status: "review_queue_item_ready", healthSummaryReference: "health-20260719-001", queue: { aggregateOnly: true, priorityClass: "urgent", reasonClass: "expired_memory", humanOwnerRole: "DIRETOR", reviewRequired: true }, execution: { taskCreated: false, notificationSent: false, memoryChanged: false, productionTouched: false }, forbidden: { automaticTaskCreation: true, automaticNotification: true, automaticReinstatement: true, customerData: true, providerPayload: true, secrets: true } };
  const cases = [["valid", (value) => value, true], ["not-urgent", (value) => ({ ...value, queue: { ...value.queue, priorityClass: "normal" } }), false], ["owner", (value) => ({ ...value, queue: { ...value.queue, humanOwnerRole: "CORRETOR" } }), false], ["task", (value) => ({ ...value, execution: { ...value.execution, taskCreated: true } }), false], ["notify", (value) => ({ ...value, execution: { ...value.execution, notificationSent: true } }), false], ["payload", (value) => ({ ...value, providerPayload: "not-allowed" }), false]];
  const failures = cases.filter(([_, mutate, expected]) => validateMetaLearningReviewQueue(mutate(structuredClone(base))).approved !== expected).map(([name]) => name);
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) { const result = selfTestMetaLearningReviewQueue(); console.log(JSON.stringify(result, null, 2)); process.exit(result.passed ? 0 : 1); }

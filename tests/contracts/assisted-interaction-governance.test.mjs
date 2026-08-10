import assert from "node:assert/strict";
import test from "node:test";
import { assessAssistedInteractionGovernanceReview, buildAssistedInteractionGovernanceDecision, describeGovernedDecisionDeadline, filterGovernedDecisionCycle, getNextGovernedDecisionFocus, isGovernedDecisionDueSoon, prioritizeGovernedDecisionCycle, summarizeGovernedDecisionCycle } from "../../lib/ai/assisted-interaction-governance.ts";

const review = {
  status: "review",
  title: "Revisar clareza do rascunho",
  recommendation: "Revise o roteiro com a equipe.",
  evidence: "Confirmação humana de 50.0% em 20 rascunhos.",
  humanReviewRequired: true,
  automaticExternalAction: false,
  sample: { draftedMinimum: 15, feedbackMinimum: 8, hasDraftSample: true, hasFeedbackSample: true },
};

test("sinal agregado em revisão vira decisão supervisionada, sem execução automática", () => {
  const decision = buildAssistedInteractionGovernanceDecision({ learning: review, drafted: 20, confirmed: 10, feedbackReceived: 8, confirmationRate: 50, helpfulRate: 62.5, averageMinutesToNextAction: 40 });
  assert.ok(decision);
  assert.equal(decision.id, "assisted-interaction-learning-review");
  assert.equal(decision.type, "Governança de IA");
  assert.match(decision.action, /Livro Executivo/);
  assert.equal(decision.href, "/decision-center#livro-executivo");
});

test("amostra insuficiente e leitura estável não abrem decisão gerencial", () => {
  for (const status of ["insufficient_sample", "stable"]) {
    assert.equal(buildAssistedInteractionGovernanceDecision({ learning: { ...review, status }, drafted: 20, confirmed: 10, feedbackReceived: 8, confirmationRate: 50, helpfulRate: 62.5, averageMinutesToNextAction: 40 }), null);
  }
});

test("o estado da revisão é derivado do livro existente, sem tabela paralela", () => {
  assert.equal(assessAssistedInteractionGovernanceReview([]).state, "not_started");
  assert.equal(assessAssistedInteractionGovernanceReview([{ decision_key: "human:assisted-interaction-learning-review", human_decision: "accept", due_at: "2026-08-05T12:00:00.000Z", outcome_recorded_at: null }]).state, "pending_outcome");
  assert.equal(assessAssistedInteractionGovernanceReview([{ decision_key: "human:assisted-interaction-learning-review", human_decision: "accept", due_at: "2026-08-05T12:00:00.000Z", outcome_recorded_at: "2026-08-05T12:00:00.000Z" }]).state, "closed");
  assert.equal(assessAssistedInteractionGovernanceReview([{ decision_key: "human:assisted-interaction-learning-review", human_decision: "reject", due_at: "2026-08-05T12:00:00.000Z", outcome_recorded_at: null }]).state, "rejected");
});

test("revisão de IA não exibe data quebrada quando o prazo legado é inválido", () => {
  const reviewState = assessAssistedInteractionGovernanceReview([
    { decision_key: "human:assisted-interaction-learning-review", human_decision: "accept", due_at: "inválido", outcome_recorded_at: null },
  ]);
  assert.equal(reviewState.state, "pending_outcome");
  assert.match(reviewState.detail, /defina uma data de aferição/i);
  assert.doesNotMatch(reviewState.detail, /invalid date/i);
});

test("resume o ciclo já visível sem criar estado paralelo", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  const result = summarizeGovernedDecisionCycle([
    { decision_key: "human:one", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: "2026-08-03T11:00:00.000Z", outcome_recorded_at: null },
    { decision_key: "human:two", human_decision: "accept", created_at: "2026-08-01T10:00:00.000Z", due_at: "2026-08-05T11:00:00.000Z", outcome_recorded_at: "2026-08-04T12:00:00.000Z" },
    { decision_key: "human:three", human_decision: "reject", created_at: "2026-07-20T10:00:00.000Z", due_at: "2026-07-21T11:00:00.000Z", outcome_recorded_at: null },
  ], now);
  assert.deepEqual(result, { registeredThisWeek: 2, awaitingOutcome: 1, overdue: 1, dueSoon: 0, withoutDeadline: 0, outcomesRecordedThisWeek: 1 });
});

test("prioriza apenas a visualização: vencidos, pendentes e histórico", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  const ordered = prioritizeGovernedDecisionCycle([
    { decision_key: "closed", human_decision: "accept", created_at: "2026-08-04T10:00:00.000Z", due_at: "2026-08-01T10:00:00.000Z", outcome_recorded_at: "2026-08-04T12:00:00.000Z" },
    { decision_key: "pending", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: "2026-08-06T10:00:00.000Z", outcome_recorded_at: null },
    { decision_key: "overdue", human_decision: "accept", created_at: "2026-08-02T10:00:00.000Z", due_at: "2026-08-03T10:00:00.000Z", outcome_recorded_at: null },
  ], now);
  assert.deepEqual(ordered.map((item) => item.decision_key), ["overdue", "pending", "closed"]);
});

test("prioriza uma decisão com prazo real antes de uma pendência sem prazo", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  const records = [
    { decision_key: "without-date", human_decision: "accept", created_at: "2026-08-04T14:00:00.000Z", due_at: null, outcome_recorded_at: null },
    { decision_key: "dated", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: "2026-08-05T10:00:00.000Z", outcome_recorded_at: null },
  ];
  assert.deepEqual(prioritizeGovernedDecisionCycle(records, now).map((item) => item.decision_key), ["dated", "without-date"]);
  assert.equal(getNextGovernedDecisionFocus(records, now).state, "pending");
  assert.equal(getNextGovernedDecisionFocus([records[0]], now).state, "without_deadline");
});

test("filtra o livro sem ocultar ou alterar decisões já registradas", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  const records = [
    { decision_key: "overdue", human_decision: "accept", created_at: "2026-08-02T10:00:00.000Z", due_at: "2026-08-03T10:00:00.000Z", outcome_recorded_at: null },
    { decision_key: "pending", human_decision: "adapt", created_at: "2026-08-03T10:00:00.000Z", due_at: "2026-08-05T10:00:00.000Z", outcome_recorded_at: null },
    { decision_key: "closed", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: "2026-08-01T10:00:00.000Z", outcome_recorded_at: "2026-08-04T12:00:00.000Z" },
    { decision_key: "rejected", human_decision: "reject", created_at: "2026-08-03T10:00:00.000Z", due_at: null, outcome_recorded_at: null },
  ];
  assert.deepEqual(filterGovernedDecisionCycle(records, "attention", now).map((item) => item.decision_key), ["overdue", "pending"]);
  assert.deepEqual(filterGovernedDecisionCycle(records, "overdue", now).map((item) => item.decision_key), ["overdue"]);
  assert.deepEqual(filterGovernedDecisionCycle(records, "pending", now).map((item) => item.decision_key), ["pending"]);
  assert.deepEqual(filterGovernedDecisionCycle(records, "closed", now).map((item) => item.decision_key), ["closed", "rejected"]);
  assert.deepEqual(filterGovernedDecisionCycle(records, "due_soon", now).map((item) => item.decision_key), ["pending"]);
  assert.deepEqual(filterGovernedDecisionCycle(records, "without_deadline", now).map((item) => item.decision_key), []);
  assert.deepEqual(filterGovernedDecisionCycle(records, "all", now), records);
});

test("separa decisões abertas sem prazo para completar a governança", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  const records = [
    { decision_key: "without-date", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: null, outcome_recorded_at: null },
    { decision_key: "invalid-date", human_decision: "adapt", created_at: "2026-08-03T10:00:00.000Z", due_at: "inválido", outcome_recorded_at: null },
    { decision_key: "closed", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: null, outcome_recorded_at: "2026-08-04T12:00:00.000Z" },
  ];
  assert.equal(summarizeGovernedDecisionCycle(records, now).withoutDeadline, 2);
  assert.deepEqual(filterGovernedDecisionCycle(records, "without_deadline", now).map((item) => item.decision_key), ["without-date", "invalid-date"]);
});

test("identifica a janela de 24 horas sem incluir prazo vencido ou ciclo fechado", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  assert.equal(isGovernedDecisionDueSoon({ decision_key: "soon", human_decision: "accept", due_at: "2026-08-05T10:00:00.000Z", outcome_recorded_at: null }, now), true);
  assert.equal(isGovernedDecisionDueSoon({ decision_key: "late", human_decision: "accept", due_at: "2026-08-04T10:00:00.000Z", outcome_recorded_at: null }, now), false);
  assert.equal(isGovernedDecisionDueSoon({ decision_key: "closed", human_decision: "accept", due_at: "2026-08-05T10:00:00.000Z", outcome_recorded_at: "2026-08-04T15:00:00.000Z" }, now), false);
});

test("aponta uma única próxima decisão sem criar nova tarefa ou automação", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  const focus = getNextGovernedDecisionFocus([
    { decision_key: "pending", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: "2026-08-06T10:00:00.000Z", outcome_recorded_at: null },
    { decision_key: "overdue", human_decision: "adapt", created_at: "2026-08-02T10:00:00.000Z", due_at: "2026-08-03T10:00:00.000Z", outcome_recorded_at: null },
  ], now);
  assert.equal(focus.state, "overdue");
  assert.equal(focus.record?.decision_key, "overdue");
  assert.deepEqual(getNextGovernedDecisionFocus([{ decision_key: "closed", human_decision: "accept", created_at: "2026-08-03T10:00:00.000Z", due_at: "2026-08-01T10:00:00.000Z", outcome_recorded_at: "2026-08-04T12:00:00.000Z" }], now), { record: null, state: "clear" });
});

test("mantém prazos legados legíveis sem assumir uma data inválida", () => {
  const now = new Date("2026-08-04T15:00:00.000Z");
  assert.deepEqual(describeGovernedDecisionDeadline(null, now), { state: "unscheduled", label: "sem prazo registrado" });
  assert.deepEqual(describeGovernedDecisionDeadline("invalido", now), { state: "unscheduled", label: "prazo indisponível" });
  assert.equal(describeGovernedDecisionDeadline("2026-08-03T10:00:00.000Z", now).state, "overdue");
  assert.equal(describeGovernedDecisionDeadline("2026-08-06T10:00:00.000Z", now).state, "upcoming");
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendationEvidence } from "../../lib/atlas/recommendation-confidence.ts";
import {
  loadRecommendationConfidenceRegistry,
  validateRecommendationConfidence,
} from "../../scripts/check-v3000-phase-47-recommendation-confidence.mjs";

const root = process.cwd();

const completeInput = {
  assignedTo: "broker-1",
  campaignId: "campaign-1",
  evaluatedAt: "2026-08-11T12:00:00.000Z",
  firstContactSlaMet: true,
  firstResponseMinutes: 12,
  lastInteractionAt: "2026-08-11T11:00:00.000Z",
  nextActionAt: "2026-08-11T15:00:00.000Z",
  operationalPriorityLabel: "Ligar agora",
  operationalPriorityReason: "SLA próximo do limite.",
  projectEvidenceCount: 5,
  score: 82,
  source: "Meta Ads",
  status: "qualificado",
  temperature: "quente",
};

test("Fase 47 separa score, prioridade e confiança sem chance de venda", () => {
  const registry = loadRecommendationConfidenceRegistry(root);
  const result = validateRecommendationConfidence({ root, registry });

  assert.equal(result.phase, 47);
  assert.equal(result.status, "recommendation-confidence-adopted");
  assert.equal(result.scorePriorityConfidenceSeparated, true);
  assert.equal(result.aiConfidenceMeasured, false);
  assert.equal(result.salesProbabilityDisplayed, false);
});

test("nove sinais factuais produzem evidência alta, não probabilidade", () => {
  const result = buildRecommendationEvidence(completeInput);

  assert.equal(result.evidenceCount, 9);
  assert.equal(result.evidenceLevel, "high");
  assert.equal(result.evidenceLabel, "Evidência alta");
  assert.equal(result.score.value, 82);
  assert.equal(result.operationalPriorityLabel, "Ligar agora");
  assert.deepEqual(result.aiConfidence, {
    label: "Não aferida",
    status: "not-measured",
  });
  assert.equal(result.salesProbabilityClaimAllowed, false);
  assert.match(result.disclaimer, /não representa probabilidade/i);
});

test("evidência parcial permanece qualitativa e auditável", () => {
  const result = buildRecommendationEvidence({
    operationalPriorityLabel: "Definir próxima ação",
    operationalPriorityReason: "Oportunidade sem compromisso futuro.",
    score: 64,
    source: "Indicação",
    status: "contato",
    temperature: "morno",
  });

  assert.equal(result.evidenceCount, 4);
  assert.equal(result.evidenceLevel, "medium");
  assert.equal(result.evidenceLabel, "Evidência média");
  assert.ok(result.reasons.length <= 3);
});

test("base escassa assume evidência inicial e não inventa score", () => {
  const result = buildRecommendationEvidence({
    operationalPriorityLabel: "Qualificar",
    operationalPriorityReason: "Dados comerciais insuficientes.",
  });

  assert.equal(result.evidenceCount, 0);
  assert.equal(result.evidenceLevel, "initial");
  assert.equal(result.score.value, null);
  assert.equal(result.score.label, "Score não informado");
  assert.equal(result.evaluatedAt, null);
});

test("score zero é preservado como dado cadastrado", () => {
  const result = buildRecommendationEvidence({
    operationalPriorityLabel: "Qualificar",
    operationalPriorityReason: "Sem resposta registrada.",
    score: 0,
  });

  assert.equal(result.score.value, 0);
  assert.equal(result.score.label, "Score cadastrado");
});

test("Fase 47 rejeita ativação de probabilidade comercial", () => {
  const registry = structuredClone(
    loadRecommendationConfidenceRegistry(root),
  );
  registry.scope.salesProbabilityDisplayed = true;

  assert.throws(
    () => validateRecommendationConfidence({ root, registry }),
    /não pode apresentar porcentagem como chance de venda/,
  );
});

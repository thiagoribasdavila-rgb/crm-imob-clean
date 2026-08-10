import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lead360 = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-049-single-decision-flow.json",
    "utf8",
  ),
);

test("fase 49 separa perfil, evidências e rotina", () => {
  assert.equal(config.phase, 49);
  assert.equal(config.profileOwnsCommercialData, true);
  assert.equal(config.qualificationOwnsEvidence, true);
  assert.equal(config.timelineOwnsOperationalContext, true);
  assert.match(lead360, /data-ux-phase="49-lead360-single-decision-flow"/);
  assert.match(lead360, /title="Perfil comercial"/);
  assert.match(lead360, /title="Evidências da qualificação"/);
  assert.match(lead360, /title="Rotina e histórico"/);
});

test("painéis repetidos de recomendação foram removidos", () => {
  assert.equal(config.duplicatedRecommendationPanelsRemoved, 2);
  assert.doesNotMatch(lead360, /title="Próxima ação recomendada"/);
  assert.doesNotMatch(lead360, /<p className="atlas-eyebrow">Próxima melhor ação<\/p>/);
});

test("recomendação canônica continua no resumo e na linha operacional", () => {
  assert.equal(config.canonicalRecommendationPreserved, true);
  assert.match(lead360, /nextAction=\{intelligence\.nextAction\}/);
  assert.match(lead360, /title: intelligence\.nextAction/);
  assert.match(lead360, /const nextActionItem/);
});

test("evidências, riscos, lacunas e perguntas continuam disponíveis", () => {
  assert.equal(config.evidencePreserved, true);
  assert.match(lead360, /qualification\.dimensions\.map/);
  assert.match(lead360, /qualification\.risks\.map/);
  assert.match(lead360, /qualification\.missingData\.join/);
  assert.match(lead360, /qualification\.recommendedQuestions\.map/);
  assert.match(lead360, /Ver evidências do score/);
});

test("fase preserva persistência e não gera entrega externa", () => {
  assert.match(lead360, /onSubmit=\{saveLead\}/);
  assert.match(lead360, /addActivity/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});

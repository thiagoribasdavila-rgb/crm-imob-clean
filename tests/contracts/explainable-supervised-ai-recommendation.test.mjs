import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/decision-center/page.tsx", "utf8");
const notifications = readFileSync("components/AtlasNotificationCenter.tsx", "utf8");
const config = JSON.parse(readFileSync("config/operational-ux-phase-054-explainable-supervised-ai.json", "utf8"));

test("fase 54 torna o Centro de Decisão a superfície canônica", () => {
  assert.equal(config.phase, 54);
  assert.equal(config.canonicalRoute, "/decision-center");
  assert.match(page, /data-ux-phase="54-explainable-supervised-ai-recommendation"/);
  assert.match(page, /Atlas Decision Engine/);
});

test("cada recomendação apresenta evidências observadas", () => {
  assert.equal(config.evidenceVisible, true);
  assert.match(page, /Ver evidências utilizadas/);
  assert.match(page, /decision\.evidence\.map/);
  assert.match(page, /Score comercial registrado/);
  assert.match(page, /Próxima ação registrada para/);
});

test("confiança ausente não recebe percentual inventado", () => {
  assert.equal(config.uncalibratedConfidenceInvented, false);
  assert.equal(config.scorePresentedAsConfidence, false);
  assert.match(page, /Confiança não calibrada/);
  assert.match(page, /Regra determinística/);
  assert.doesNotMatch(page, /generativeReady \? 0\.9 : 0\.74/);
  assert.match(notifications, /decision\.confidence === null \? "REVISAR"/);
});

test("ação é encaminhada para revisão humana contextual", () => {
  assert.equal(config.humanConfirmationRequired, true);
  assert.equal(config.automaticCommercialAction, false);
  assert.match(page, /Ação supervisionada/);
  assert.match(page, /Revisar e decidir/);
  assert.match(page, /não executa contato, mudança de etapa ou orçamento/);
  assert.match(page, /<Link\s+href=\{decision\.href\}/);
});

test("leads e regras operacionais mantêm conceitos separados", () => {
  assert.match(page, /confidenceBasis: "not-calibrated"/);
  assert.match(page, /confidenceBasis: "deterministic"/);
  assert.match(page, /Sinais comerciais indicam prioridade de revisão/);
  assert.match(page, /Uma regra operacional identificou prazo vencido/);
});

test("fase preserva dados, integrações e release", () => {
  assert.equal(config.rawPersonalDataAdded, false);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDeliveryDuringPhase, false);
  assert.equal(config.buildExecuted, false);
});

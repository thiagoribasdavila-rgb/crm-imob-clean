import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const report = readFileSync("components/reports/WeeklyDeveloperPerformance.tsx", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-052-attribution-incrementality-sample.json",
    "utf8",
  ),
);

test("fase 52 separa as três classes de evidência", () => {
  assert.equal(config.phase, 52);
  assert.match(report, /data-ux-phase="52-attribution-incrementality-sample"/);
  for (const label of [
    "Atribuição observada",
    "Impacto incremental",
    "Suficiência da amostra",
  ]) assert.match(report, new RegExp(label));
});

test("atribuição usa origem registrada e expõe lacuna", () => {
  assert.equal(config.observedAttributionSeparated, true);
  assert.match(report, /Atribuição incompleta/);
  assert.match(report, /campaign.campaignId === "sem-campanha"/);
});

test("incrementalidade não é estimada sem experimento", () => {
  assert.equal(config.incrementalImpactRequiresExperiment, true);
  assert.equal(config.liftInvented, false);
  assert.match(report, /Não estimado nesta leitura/);
  assert.match(report, /Incremental não estimado/);
  assert.match(report, /Exige experimento compatível, controle e revisão humana/);
});

test("amostra insuficiente usa o mínimo descritivo canônico", () => {
  assert.equal(config.minimumDescriptiveSample, 30);
  assert.equal(config.insufficientSampleExplicit, true);
  assert.match(report, /const minimumDescriptiveSample = 30/);
  assert.match(report, /Amostra insuficiente/);
  assert.match(report, /campaign.leads >= minimumDescriptiveSample/);
});

test("amostra suficiente não é promovida a causalidade", () => {
  assert.equal(config.sufficientSampleDoesNotClaimCausality, true);
  assert.match(report, /Mesmo com amostra descritiva suficiente/);
  assert.match(report, /não mede lift/);
});

test("fase preserva decisão humana, persistência e release", () => {
  assert.equal(config.automaticCampaignDecision, false);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});

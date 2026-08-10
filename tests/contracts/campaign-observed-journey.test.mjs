import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const report = readFileSync("components/reports/WeeklyDeveloperPerformance.tsx", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-051-campaign-observed-journey.json",
    "utf8",
  ),
);

test("fase 51 apresenta a jornada comercial em uma única leitura", () => {
  assert.equal(config.phase, 51);
  assert.match(report, /data-ux-phase="51-campaign-lead-service-result"/);
  assert.match(report, /Campanha → lead → atendimento → resultado/);
  for (const label of ["Lead", "Atendimento", "Avanço", "Resultado"]) {
    assert.match(report, new RegExp(`"${label}"`));
  }
});

test("jornada usa os fatos já consolidados no relatório semanal", () => {
  assert.equal(config.canonicalSource, "weekly_acquisition_report");
  assert.equal(config.campaignOriginVisible, true);
  assert.equal(config.leadVolumeVisible, true);
  assert.equal(config.serviceEvidenceVisible, true);
  assert.equal(config.commercialOutcomeVisible, true);
  for (const field of [
    "campaign.campaignName",
    "campaign.leads",
    "campaign.contacted",
    "campaign.qualified",
    "campaign.visits",
    "campaign.proposals",
    "campaign.wins",
  ]) {
    assert.match(report, new RegExp(field.replaceAll(".", "\\.")));
  }
});

test("interface diferencia associação observada de causalidade", () => {
  assert.equal(config.causalClaim, false);
  assert.match(report, /associação observada e não comprova/);
  assert.match(report, /SEM ALEGAÇÃO CAUSAL/);
  assert.match(report, /conversão observada/);
});

test("custo ausente continua explícito e não vira zero", () => {
  assert.equal(config.missingSpendShownAsZero, false);
  assert.match(report, /Investimento não conectado/);
  assert.match(report, /campaign.spend === null/);
});

test("detalhes por corretor permanecem acessíveis sob demanda", () => {
  assert.equal(config.brokerDetailProgressive, true);
  assert.match(report, /<details/);
  assert.match(report, /Ver detalhamento de campanhas e execução por corretor/);
  assert.match(report, /Execução campanha × corretor/);
});

test("fase não altera persistência, integração ou release", () => {
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});

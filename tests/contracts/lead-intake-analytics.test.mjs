import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeadIntakeAnalytics,
  buildLeadIntakePriority,
  calendarDayKey,
} from "../../lib/analytics/lead-intake.ts";

const now = new Date("2026-08-04T15:00:00.000Z");
const brokers = [{ id: "broker-a", name: "Ana" }, { id: "broker-b", name: "Bruno" }];

test("agrupa entrada no dia comercial de São Paulo", () => {
  assert.equal(calendarDayKey("2026-08-04T02:30:00.000Z"), "2026-08-03");
  assert.equal(calendarDayKey("2026-08-04T03:30:00.000Z"), "2026-08-04");
});

test("separa leads que caíram de recebimentos por corretor sem duplicar a distribuição", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    brokers,
    leads: [
      { id: "lead-1", created_at: "2026-08-04T12:00:00.000Z", assigned_to: "broker-a", source: "Meta Ads" },
      { id: "lead-2", created_at: "2026-08-04T13:00:00.000Z", assigned_to: "broker-b", source: "Site" },
      { id: "lead-3", created_at: "2026-08-04T14:00:00.000Z", assigned_to: null, source: "Indicação" },
    ],
    assignments: [
      { lead_id: "lead-1", assigned_to: "broker-a", created_at: "2026-08-04T12:01:00.000Z" },
    ],
  });

  assert.equal(result.summary.today, 3);
  assert.equal(result.summary.assignedToday, 2);
  assert.equal(result.summary.unassignedToday, 1);
  assert.equal(result.summary.receivedToday, 2);
  assert.deepEqual(result.byBroker.map(({ brokerName, today }) => [brokerName, today]), [["Ana", 1], ["Bruno", 1]]);
});

test("conta uma transferência como novo recebimento sem alterar o total de entrada", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    brokers,
    leads: [{ id: "lead-1", created_at: "2026-08-04T10:00:00.000Z", assigned_to: "broker-b", source: "Meta Ads" }],
    assignments: [
      { lead_id: "lead-1", assigned_to: "broker-a", created_at: "2026-08-04T10:01:00.000Z" },
      { lead_id: "lead-1", assigned_to: "broker-b", created_at: "2026-08-04T11:00:00.000Z" },
    ],
  });
  assert.equal(result.summary.today, 1);
  assert.equal(result.summary.receivedToday, 2);
  assert.equal(result.byBroker.find((broker) => broker.brokerId === "broker-a")?.today, 1);
  assert.equal(result.byBroker.find((broker) => broker.brokerId === "broker-b")?.today, 1);
});

test("não sinaliza desequilíbrio com amostra pequena", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    brokers,
    leads: [{ id: "lead-1", created_at: "2026-08-04T12:00:00.000Z", assigned_to: "broker-a", source: "Site" }],
    assignments: [],
  });
  assert.equal(result.distribution.imbalanced, false);
  assert.equal(result.byBroker[0].changePercent, null);
});

test("separa importação histórica e origem ambígua da operação diária", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    brokers,
    leads: [
      { id: "lead-live", created_at: "2026-08-04T12:00:00.000Z", assigned_to: "broker-a", source: "Meta Ads" },
      { id: "lead-old", created_at: "2026-08-04T12:10:00.000Z", assigned_to: "broker-a", source: "Base antiga", metadata: { reactivation: { batchId: "batch-1" } } },
      { id: "lead-unknown", created_at: "2026-08-04T12:20:00.000Z", assigned_to: null },
    ],
    assignments: [
      { lead_id: "lead-live", assigned_to: "broker-a", created_at: "2026-08-04T12:01:00.000Z" },
      { lead_id: "lead-old", assigned_to: "broker-a", created_at: "2026-08-04T12:11:00.000Z" },
    ],
  });
  assert.equal(result.summary.today, 1);
  assert.equal(result.summary.historicalImportsToday, 1);
  assert.equal(result.summary.ambiguousToday, 1);
  assert.equal(result.summary.receivedToday, 1);
  assert.equal(result.dataBoundary.status, "insufficient");
  assert.equal(result.dataBoundary.decisionReady, false);
  assert.equal(result.dataBoundary.historicalImportsExcludedFromOperationalMetrics, true);
});

test("mede baseline real por dia, projeto, origem e corretor sem transformar ausência em zero", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    periodDays: 7,
    brokers,
    leads: [
      {
        id: "lead-1",
        created_at: "2026-08-04T12:00:00.000Z",
        first_contacted_at: "2026-08-04T12:10:00.000Z",
        assigned_to: "broker-a",
        development_id: "project-a",
        development_name: "Projeto A",
        campaign_id: "campaign-a",
        campaign_name: "Campanha A",
        developer_id: "developer-a",
        developer_name: "Incorporadora A",
        source: "Meta Ads",
        next_action_at: "2026-08-05T12:00:00.000Z",
      },
      {
        id: "lead-2",
        created_at: "2026-08-04T13:00:00.000Z",
        first_response_minutes: 30,
        assigned_to: "broker-b",
        development_id: "project-a",
        development_name: "Projeto A",
        campaign_id: "campaign-a",
        campaign_name: "Campanha A",
        developer_id: "developer-a",
        developer_name: "Incorporadora A",
        source_normalized: "meta_ads",
      },
      {
        id: "lead-3",
        created_at: "2026-08-04T14:00:00.000Z",
        assigned_to: null,
        source: "Site",
      },
    ],
    assignments: [],
  });

  assert.equal(result.baseline.sampleSize, 3);
  assert.equal(result.baseline.medianFirstActionMinutes, 20);
  assert.equal(result.baseline.firstActionCoveragePercent, 66.7);
  assert.equal(result.baseline.ownerRatePercent, 66.7);
  assert.equal(result.baseline.nextActionRatePercent, 33.3);
  assert.deepEqual(result.byProject.map(({ developmentId, leads }) => [developmentId, leads]), [["project-a", 2], [null, 1]]);
  assert.deepEqual(result.bySource.map(({ name, leads }) => [name, leads]), [["Meta Ads", 2], ["Site", 1]]);
  assert.deepEqual(result.byCampaign.map(({ campaignId, leads }) => [campaignId, leads]), [["campaign-a", 2], [null, 1]]);
  assert.deepEqual(result.byDeveloper.map(({ developerId, leads }) => [developerId, leads]), [["developer-a", 2], [null, 1]]);
  for (const dimension of [result.byProject, result.bySource, result.byCampaign, result.byDeveloper]) {
    assert.equal(dimension.reduce((sum, row) => sum + row.leads, 0), result.baseline.sampleSize);
  }
  assert.equal(result.baselineByDay.at(-1).medianFirstActionMinutes, 20);
  assert.equal(result.byBroker.find((broker) => broker.brokerId === "broker-a")?.totalPeriod, 1);
});

test("preserva campanhas distintas e consolida a mesma incorporadora", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    periodDays: 7,
    brokers,
    leads: [
      {
        id: "lead-a1",
        created_at: "2026-08-04T12:00:00.000Z",
        assigned_to: "broker-a",
        source: "Meta Ads",
        campaign_id: "campaign-a",
        campaign_name: "Campanha A",
        developer_id: "developer-a",
        developer_name: "Incorporadora A",
      },
      {
        id: "lead-a2",
        created_at: "2026-08-04T12:10:00.000Z",
        assigned_to: "broker-b",
        source: "Meta Ads",
        campaign_id: "campaign-a",
        campaign_name: "Campanha A",
        developer_id: "developer-a",
        developer_name: "Incorporadora A",
      },
      {
        id: "lead-b1",
        created_at: "2026-08-04T12:20:00.000Z",
        assigned_to: "broker-a",
        source: "Meta Ads",
        campaign_id: "campaign-b",
        campaign_name: "Campanha B",
        developer_id: "developer-a",
        developer_name: "Incorporadora A",
      },
    ],
    assignments: [],
  });

  assert.deepEqual(result.byCampaign.map(({ campaignId, leads }) => [campaignId, leads]), [
    ["campaign-a", 2],
    ["campaign-b", 1],
  ]);
  assert.deepEqual(result.byDeveloper.map(({ developerId, leads }) => [developerId, leads]), [
    ["developer-a", 3],
  ]);
});

test("baseline sem amostra mantém métricas desconhecidas como null", () => {
  const result = buildLeadIntakeAnalytics({ now, periodDays: 7, brokers, leads: [], assignments: [] });
  assert.equal(result.baseline.sampleSize, 0);
  assert.equal(result.baseline.medianFirstActionMinutes, null);
  assert.equal(result.baseline.firstActionCoveragePercent, null);
  assert.equal(result.baseline.ownerRatePercent, null);
  assert.equal(result.baseline.nextActionRatePercent, null);
  assert.equal(result.baseline.noSampleAsZero, false);
});

test("valor nulo de primeira resposta não vira atendimento instantâneo", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    periodDays: 7,
    brokers,
    leads: [{
      id: "lead-null-sla",
      created_at: "2026-08-04T12:00:00.000Z",
      assigned_to: "broker-a",
      source: "Meta Ads",
      first_response_minutes: null,
    }],
    assignments: [],
  });
  assert.equal(result.baseline.medianFirstActionMinutes, null);
  assert.equal(result.baseline.firstActionMeasured, 0);
  assert.equal(result.baseline.firstActionCoveragePercent, 0);
});

test("não usa importações históricas para melhorar artificialmente a baseline", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    periodDays: 7,
    brokers,
    leads: [
      {
        id: "live",
        created_at: "2026-08-04T12:00:00.000Z",
        assigned_to: "broker-a",
        source: "Site",
        first_response_minutes: 12,
      },
      {
        id: "history",
        created_at: "2026-08-04T12:00:00.000Z",
        assigned_to: "broker-a",
        source: "Base histórica",
        first_response_minutes: 1,
      },
    ],
    assignments: [],
  });
  assert.equal(result.baseline.sampleSize, 1);
  assert.equal(result.baseline.medianFirstActionMinutes, 12);
  assert.equal(result.baseline.historicalImportsExcluded, true);
});

test("prioriza distribuição humana para gestão quando há lead sem responsável", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    periodDays: 7,
    role: "director",
    brokers,
    leads: [{
      id: "lead-unassigned",
      created_at: "2026-08-04T12:00:00.000Z",
      assigned_to: null,
      source: "Meta Ads",
    }],
    assignments: [],
  });

  assert.equal(result.priority.code, "distribute_unassigned");
  assert.equal(result.priority.actionHref, "/distribution");
  assert.equal(result.priority.automaticAction, false);
  assert.equal(result.priority.humanDecisionRequired, true);
});

test("corretor acompanha atribuição sem receber acesso à fila da diretoria", () => {
  const priority = buildLeadIntakePriority({
    role: "broker",
    summary: { unassignedToday: 2, ambiguousToday: 0 },
    dataBoundary: { operationalPeriod: 2 },
    distribution: { imbalanced: false },
    baseline: {
      sampleSize: 2,
      medianFirstActionMinutes: null,
      firstActionCoveragePercent: 0,
      nextActionRatePercent: 0,
    },
  });

  assert.equal(priority.code, "review_unassigned");
  assert.equal(priority.actionHref, "/leads");
  assert.notEqual(priority.actionHref, "/distribution");
});

test("ausência de amostra não é apresentada como desempenho zero", () => {
  const result = buildLeadIntakeAnalytics({
    now,
    periodDays: 7,
    role: "director",
    brokers,
    leads: [{
      id: "historical-only",
      created_at: "2026-08-04T12:00:00.000Z",
      assigned_to: "broker-a",
      source: "Base histórica",
    }],
    assignments: [],
  });

  assert.equal(result.priority.code, "await_operational_sample");
  assert.equal(result.priority.metricValue, null);
  assert.equal(result.priority.severity, "monitor");
});

test("mantém cadência quando a entrada possui dono, ação e SLA medidos", () => {
  const leads = Array.from({ length: 5 }, (_, index) => ({
    id: `healthy-${index}`,
    created_at: `2026-08-04T12:0${index}:00.000Z`,
    assigned_to: index % 2 ? "broker-b" : "broker-a",
    source: "Meta Ads",
    first_response_minutes: 8 + index,
    next_action_at: "2026-08-05T12:00:00.000Z",
  }));
  const result = buildLeadIntakeAnalytics({
    now,
    periodDays: 7,
    role: "director",
    brokers,
    leads,
    assignments: [],
  });

  assert.equal(result.dataBoundary.decisionReady, true);
  assert.equal(result.priority.code, "keep_cadence");
  assert.equal(result.priority.severity, "healthy");
});

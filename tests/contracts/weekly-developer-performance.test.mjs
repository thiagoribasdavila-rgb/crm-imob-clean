import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildWeeklyAcquisitionReport } from "../../lib/analytics/weekly-acquisition-report.ts";

const developments = [
  { id: "inside", name: "Inside Perdizes", developer_name: "Teixeira Duarte" },
  { id: "arvo", name: "Arvo Paraíso", developer_name: "Atria" },
];

const profiles = [
  { id: "broker-a", name: "Ana" },
  { id: "broker-b", name: "Bruno" },
];

test("consolida campanha, incorporadora e trabalho do corretor com registros reais", () => {
  const report = buildWeeklyAcquisitionReport(
    [
      {
        id: "lead-1",
        campaign_id: "campaign-1",
        development_id: "inside",
        assigned_to: "broker-a",
        status: "ganho",
        score: 92,
      },
      {
        id: "lead-2",
        campaign_id: "campaign-1",
        project_id: "inside",
        assigned_user_id: "broker-a",
        status: "proposta",
        score_ia: 81,
      },
      {
        id: "lead-3",
        campaign_id: "campaign-1",
        development_id: "arvo",
        assigned_to: "broker-b",
        status: "qualificacao",
        score: 70,
      },
      {
        id: "lead-4",
        campaign_id: "campaign-2",
        development_id: "inside",
        assigned_to: null,
        status: "novo",
        score: 10,
      },
    ],
    developments,
    [
      {
        campaignId: "campaign-1",
        campaignName: "Captação premium",
        spend: 300,
      },
      { campaignId: "campaign-2", campaignName: "Remarketing", spend: 100 },
    ],
    profiles,
    [
      { lead_id: "lead-1", user_id: "broker-a", type: "call" },
      { lead_id: "lead-1", user_id: "broker-a", type: "message" },
      { lead_id: "lead-3", user_id: "broker-b", type: "call" },
      { lead_id: "outside-window", user_id: "broker-a", type: "call" },
    ],
  );

  assert.equal(report.totals.leads, 4);
  assert.equal(report.totals.wins, 1);
  assert.equal(report.totals.unassigned, 1);
  assert.equal(report.totals.interactions, 3);
  assert.equal(report.totals.spend, 400);

  const inside = report.developers.find(
    (row) => row.developer === "Teixeira Duarte",
  );
  assert.equal(inside?.leads, 3);
  assert.equal(inside?.wins, 1);
  assert.equal(inside?.spend, 300);
  assert.equal(inside?.allocation, "proportional_by_leads");

  const arvo = report.developers.find((row) => row.developer === "Atria");
  assert.equal(arvo?.spend, 100);

  const ana = report.brokerResults.find((row) => row.brokerId === "broker-a");
  assert.equal(ana?.leads, 2);
  assert.equal(ana?.interactions, 2);
  assert.equal(ana?.wins, 1);
  assert.equal(ana?.campaignName, "Captação premium");
  assert.equal(
    report.projectBrokerResults.find(
      (row) => row.developmentId === "inside" && row.brokerId === "broker-a",
    )?.interactions,
    2,
  );

  assert.equal(report.governance.crmIsOutcomeTruth, true);
  assert.equal(report.governance.automaticDecisions, false);
});

test("não apresenta custo zero quando a Meta ainda não forneceu investimento", () => {
  const report = buildWeeklyAcquisitionReport(
    [
      {
        id: "lead-1",
        campaign_id: "campaign-1",
        development_id: "inside",
        assigned_to: "broker-a",
        status: "contato",
      },
    ],
    developments,
    [],
    profiles,
    [],
  );

  assert.equal(report.totals.spend, null);
  assert.equal(report.campaigns[0].spend, null);
  assert.equal(report.developers[0].spend, null);
  assert.equal(report.totals.cpl, null);
  assert.equal(report.governance.spendSource, "Não disponível");
});

test("detalha leads, etapa atual e corretores por incorporadora e projeto", () => {
  const report = buildWeeklyAcquisitionReport(
    [
      {
        id: "one",
        development_id: "inside",
        assigned_to: "broker-a",
        status: "novo",
      },
      {
        id: "two",
        development_id: "inside",
        assigned_to: "broker-a",
        status: "qualificacao",
      },
      {
        id: "three",
        development_id: "inside",
        assigned_to: "broker-b",
        status: "proposta",
      },
      {
        id: "four",
        development_id: "arvo",
        assigned_to: "broker-b",
        status: "venda",
      },
    ],
    [
      { id: "inside", name: "Inside Perdizes", developer_id: "dev-td" },
      { id: "arvo", name: "Arvo Paraíso", developer_id: "dev-atria" },
    ],
    [],
    profiles,
    [],
    [
      { id: "dev-td", trade_name: "Teixeira Duarte" },
      { id: "dev-atria", trade_name: "Atria" },
    ],
  );

  const inside = report.projectResults.find(
    (row) => row.developmentId === "inside",
  );
  assert.equal(inside?.developer, "Teixeira Duarte");
  assert.equal(inside?.leads, 3);
  assert.equal(inside?.brokers, 2);
  assert.equal(inside?.service.measured, 0);
  assert.deepEqual(inside?.stages, {
    novo: 1,
    contato: 0,
    qualificacao: 1,
    visita: 0,
    proposta: 1,
    contrato: 0,
    ganho: 0,
    outros: 0,
  });

  const anaInside = report.projectBrokerResults.find(
    (row) => row.developmentId === "inside" && row.brokerId === "broker-a",
  );
  assert.equal(anaInside?.brokerName, "Ana");
  assert.equal(anaInside?.leads, 2);
  assert.equal(anaInside?.interactions, 0);
  assert.equal(anaInside?.stages.qualificacao, 1);
  assert.equal(
    report.projectResults.find((row) => row.developmentId === "arvo")?.stages
      .ganho,
    1,
  );
});

test("mede SLA real e evidencia lacunas de atribuição sem inventar dados", () => {
  const report = buildWeeklyAcquisitionReport(
    [
      {
        id: "fast",
        development_id: "inside",
        campaign_id: "campaign-1",
        assigned_to: "broker-a",
        source: "Meta Ads",
        status: "contato",
        created_at: "2026-08-04T12:00:00.000Z",
        first_contacted_at: "2026-08-04T12:10:00.000Z",
      },
      {
        id: "incomplete",
        status: "novo",
        created_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    developments,
    [],
    profiles,
    [],
  );

  assert.equal(report.service.measured, 1);
  assert.equal(report.service.averageFirstContactMinutes, 10);
  assert.equal(report.service.within15Rate, 100);
  assert.equal(report.service.coverageRate, 50);
  assert.equal(report.dataQuality.missingProject, 1);
  assert.equal(report.dataQuality.missingDeveloper, 1);
  assert.equal(report.dataQuality.missingCampaign, 1);
  assert.equal(report.dataQuality.missingSource, 1);
  assert.equal(report.dataQuality.completeAttribution, 1);
  assert.equal(report.dataQuality.unassigned, 1);
  assert.deepEqual(report.dailyDistribution, [
    {
      date: "2026-08-04",
      developerId: null,
      developer: "Teixeira Duarte",
      developmentId: "inside",
      projectName: "Inside Perdizes",
      brokerId: "broker-a",
      brokerName: "Ana",
      leads: 1,
      assigned: 1,
      contacted: 1,
      qualified: 0,
      visits: 0,
      proposals: 0,
      wins: 0,
      unassigned: 0,
      contactRate: 100,
      leadToWinRate: 0,
    },
    {
      date: "2026-08-04",
      developerId: null,
      developer: "Sem incorporadora atribuída",
      developmentId: null,
      projectName: "Sem projeto",
      brokerId: null,
      brokerName: "Sem corretor",
      leads: 1,
      assigned: 0,
      contacted: 0,
      qualified: 0,
      visits: 0,
      proposals: 0,
      wins: 0,
      unassigned: 1,
      contactRate: 0,
      leadToWinRate: 0,
    },
  ]);
});

test("incorporadora responsável da campanha prevalece e mantém compatibilidade com projeto", () => {
  const report = buildWeeklyAcquisitionReport(
    [
      {
        id: "lead",
        campaign_id: "campaign",
        development_id: "inside",
        assigned_to: "broker-a",
        status: "qualificacao",
      },
    ],
    [{ id: "inside", name: "Inside", developer_id: "dev-projeto" }],
    [{ campaignId: "campaign", spend: 250 }],
    profiles,
    [],
    [
      { id: "dev-projeto", trade_name: "Incorporadora do projeto" },
      { id: "dev-campanha", trade_name: "Incorporadora responsável" },
    ],
    [
      {
        id: "campaign",
        name: "Campanha oficial",
        developer_id: "dev-campanha",
        development_id: "inside",
      },
    ],
  );
  assert.equal(report.developers[0].developer, "Incorporadora responsável");
  assert.equal(report.developers[0].spend, 250);
  assert.equal(report.campaigns[0].campaignName, "Campanha oficial");
  assert.equal(
    report.campaigns[0].responsibleDeveloper,
    "Incorporadora responsável",
  );
  assert.equal(report.campaigns[0].responsibleDeveloperId, "dev-campanha");
});

test("expõe ausência de responsável da campanha sem inventar incorporadora", () => {
  const report = buildWeeklyAcquisitionReport(
    [{ id: "lead-sem-responsavel", campaign_id: "campaign-sem-responsavel" }],
    [],
    [],
  );

  assert.equal(
    report.campaigns[0].responsibleDeveloper,
    "Sem incorporadora atribuída",
  );
  assert.equal(report.campaigns[0].responsibleDeveloperId, null);
});

test("explicita o escopo de filtros antes de exportar investimento e campanhas", () => {
  const source = fs.readFileSync(
    new URL(
      "../../components/reports/WeeklyDeveloperPerformance.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /data-report="developer-scope-note"/);
  assert.match(source, /const dateRange = \(start: string, end: string\)/);
  assert.match(source, /Coorte captada de \{displayedPeriod\}/);
  assert.match(source, /Período: \{displayedPeriod\}/);
  assert.match(source, /\["Recorte de atendimento", selectedScope\]/);
  assert.match(source, /\["Escopo financeiro", financialScopeNote\]/);
  assert.match(source, /\["Escopo de campanhas", campaignScopeNote\]/);
  assert.match(source, /não rateia investimento por projeto/);
  assert.match(source, /const visibleCampaigns = useMemo/);
  assert.match(source, /const visibleBrokerResults = useMemo/);
  assert.match(source, /\.\.\.observedCampaignJourneys\.map/);
  assert.match(source, /row\.nextDecision\.label/);
  assert.match(source, /row\.nextDecision\.description/);
  assert.match(source, /\{visibleBrokerResults\.map/);
  assert.match(source, /data-report-broker-daily-workload-action=/);
  assert.match(source, /const needsNewLeadReview = broker\.withoutFirstContact > 0/);
  assert.match(source, /\.\.\.\(needsNewLeadReview \? \{ status: "novo" \} : \{\}\)/);
  assert.match(source, /const actionLabel = needsNewLeadReview/);
  assert.match(source, /Registrar contato em \$\{broker\.withoutFirstContact\} lead/);
});

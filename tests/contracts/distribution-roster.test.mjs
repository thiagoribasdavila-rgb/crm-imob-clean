import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDistributionDecisionTrail,
  buildDistributionRotation,
  distributionEligibility,
  resolveDistributionProjectFilter,
} from "../../lib/crm/distribution-roster.ts";

const base = {
  enabled: true,
  online: true,
  availability: "available",
  weight: 1,
  totalLoad: 10,
  projectLoad: 4,
  maxActiveLeads: 100,
  maxProjectLeads: 50,
  lastAssignedAt: "2026-08-04T12:00:00.000Z",
};

test("explica por que um corretor não participa da roleta", () => {
  assert.equal(
    distributionEligibility({ ...base, id: "paused", enabled: false }).reason,
    "Pausado neste projeto",
  );
  assert.equal(
    distributionEligibility({ ...base, id: "offline", online: false }).reason,
    "Fora do Atlas agora",
  );
  assert.equal(
    distributionEligibility({ ...base, id: "busy", availability: "busy" })
      .reason,
    "Marcado como ocupado",
  );
  assert.equal(
    distributionEligibility({ ...base, id: "full", totalLoad: 100 }).reason,
    "Limite total atingido",
  );
});

test("a prévia da roleta exclui inelegíveis e ordena por carga ponderada", () => {
  const rotation = buildDistributionRotation([
    { ...base, id: "weighted", projectLoad: 8, weight: 4 },
    { ...base, id: "regular", projectLoad: 3, weight: 1 },
    { ...base, id: "paused", enabled: false, projectLoad: 0 },
  ]);

  assert.deepEqual(
    rotation.map((broker) => broker.id),
    ["weighted", "regular"],
  );
});

test("em empate prioriza quem nunca recebeu e depois a entrega mais antiga", () => {
  const rotation = buildDistributionRotation([
    {
      ...base,
      id: "recent",
      lastAssignedAt: "2026-08-04T14:00:00.000Z",
    },
    { ...base, id: "never", lastAssignedAt: null },
    {
      ...base,
      id: "older",
      lastAssignedAt: "2026-08-04T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(
    rotation.map((broker) => broker.id),
    ["never", "older", "recent"],
  );
});

test("o desempate final por id deixa a decisão reproduzível", () => {
  const rotation = buildDistributionRotation([
    { ...base, id: "broker-b" },
    { ...base, id: "broker-a" },
  ]);

  assert.deepEqual(
    rotation.map((broker) => broker.id),
    ["broker-a", "broker-b"],
  );
});

test("o rastro explica capacidade, bloqueio e próximo corretor", () => {
  const decisions = buildDistributionDecisionTrail([
    { ...base, id: "next", projectLoad: 2, totalLoad: 7 },
    { ...base, id: "full", totalLoad: 100 },
  ]);

  assert.equal(decisions[0].candidate.id, "next");
  assert.equal(decisions[0].isNext, true);
  assert.equal(decisions[0].projectRemaining, 48);
  assert.equal(decisions[0].totalRemaining, 93);
  assert.match(decisions[0].decisionReason, /Menor carga ponderada/);
  assert.equal(decisions[1].eligible, false);
  assert.equal(decisions[1].eligibilityReason, "Limite total atingido");
});

test("o filtro de incorporadora mantém ou troca o projeto ativo com segurança", () => {
  const projects = [
    { id: "inside", developerName: "Incorporadora A" },
    { id: "arvo", developerName: "Incorporadora B" },
    { id: "sem-incorporadora", developerName: null },
  ];

  assert.deepEqual(
    resolveDistributionProjectFilter(
      projects,
      "Incorporadora A",
      "inside",
    ).projectId,
    "inside",
  );
  assert.equal(
    resolveDistributionProjectFilter(
      projects,
      "Incorporadora B",
      "inside",
    ).projectId,
    "arvo",
  );
  assert.equal(
    resolveDistributionProjectFilter(
      projects,
      "Não informada",
      "inside",
    ).projectId,
    "sem-incorporadora",
  );
});

test("a interface não permite ocultar o projeto com alterações pendentes", () => {
  const component = readFileSync(
    new URL(
      "../../components/distribution/ProjectBrokerRoster.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(component, /onChange=\{\(event\) => changeDeveloper\(event\.target\.value\)\}/);
  assert.match(component, /disabled=\{dirty \|\| working\}/);
  assert.match(component, /Editando agora:/);
  assert.match(component, /Salve ou desfaça as alterações antes de trocar de incorporadora/);
  assert.match(component, /data-distribution-decision="explainable"/);
  assert.match(component, /Prioridade ordena a lead; capacidade \+ peso escolhem o corretor/);
  assert.match(component, /selectedCount < 1/);
  assert.match(component, /Uma roleta vazia não pode ser salva/);
});

test("a API salva a equipe canônica do projeto em lote com limite e hierarquia", () => {
  const route = readFileSync(
    new URL("../../app/api/v1/crm/distribution/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /action === "configure_members"/);
  assert.match(route, /members\.length > 100/);
  assert.match(route, /distribution_roster/);
  assert.match(route, /project_distribution_members/);
  assert.match(route, /configure_project_distribution_roster_v1/);
  assert.match(route, /EMPTY_DISTRIBUTION_ROSTER/);
  assert.match(route, /BROKER_OUT_OF_SCOPE/);
  assert.doesNotMatch(route, /descendantsFromLiveProfiles/);
  assert.match(route, /new Set\(hierarchy\.map\(\(profile\) => text\(profile\.id\)\)\)/);
  assert.match(route, /allowed\.has\(text\(profile\.id\)\)/);
});

test("a API usa v6 e limita o v4 à compatibilidade de schema", () => {
  const route = readFileSync(
    new URL("../../app/api/v1/crm/distribution/route.ts", import.meta.url),
    "utf8",
  );

  const v6 = route.indexOf('admin.rpc("distribute_project_leads_v6"');
  const fallback = route.indexOf("isMissingSchema(distributionResult.error)");
  const v4 = route.indexOf('admin.rpc("distribute_project_leads_v4"');

  assert.ok(v6 >= 0 && fallback > v6 && v4 > fallback);
  assert.match(route, /distributionVersion = "v4-compatibility"/);
  assert.match(route, /sla_campaign_project_roster_reservation_v6/);
  assert.doesNotMatch(route, /supabase\.rpc\("distribute_project_leads_v6"/);
});

test("a migration reconcilia a roleta v6 sem expor RPCs ao cliente", () => {
  const migration = readFileSync(
    new URL(
      "../../supabase/migrations/20260810170000_distribution_roster_contract_reconciliation.sql",
      import.meta.url,
    ),
    "utf8",
  ).toLowerCase();

  for (const marker of [
    "configure_project_distribution_roster_v1",
    "configure_project_distribution_member_v1",
    "empty_distribution_roster",
    "distribution_roster_director_write",
    "project_distribution_members",
    "distribute_project_leads_v6",
    "from public, anon, authenticated",
    "to service_role",
  ]) {
    assert.ok(migration.includes(marker), `migration sem ${marker}`);
  }
});

test("somente a diretoria abre e altera a fila; presença continua sendo individual", () => {
  const route = readFileSync(
    new URL("../../app/api/v1/crm/distribution/route.ts", import.meta.url),
    "utf8",
  );

  const getStart = route.indexOf("export async function GET");
  const postStart = route.indexOf("export async function POST");
  const heartbeatStart = route.indexOf('body.action === "heartbeat"', postStart);
  const writeGateStart = route.indexOf("if (role !== \"director\")", heartbeatStart);
  const distributeStart = route.indexOf('body.action === "distribute"', heartbeatStart);

  assert.ok(getStart >= 0 && postStart > getStart, "rotas da fila existem");
  assert.match(
    route.slice(getStart, postStart),
    /if \(role !== "director"\)[\s\S]{0,500}A fila comercial é configurada somente pela diretoria/,
  );
  assert.ok(
    heartbeatStart > postStart &&
      writeGateStart > heartbeatStart &&
      distributeStart > writeGateStart,
    "heartbeat pessoal ocorre antes da proteção e distribuir ocorre depois dela",
  );
  assert.match(
    route.slice(writeGateStart, writeGateStart + 500),
    /Somente a diretoria pode alterar a distribuição/,
  );
  assert.match(route, /sourceKey !== "meta"/);
  assert.match(route, /profile\.commercial_role !== "broker"/);
});

test("a navegação não oferece distribuição para gerente ou superintendente", () => {
  const navigation = readFileSync(
    new URL("../../lib/atlas/navigation.ts", import.meta.url),
    "utf8",
  );

  const distributionStart = navigation.indexOf('id: "distribution"');
  const distributionBlock = navigation.slice(distributionStart, distributionStart + 650);
  assert.ok(distributionStart >= 0, "item de distribuição existe");
  assert.match(distributionBlock, /roles: \["director"\]/);
  assert.doesNotMatch(distributionBlock, /superintendent|manager/);
});

test("o contrato operacional marca a fila como exclusiva da diretoria", () => {
  const registry = readFileSync(
    new URL("../../lib/atlas/core-v2/page-registry.ts", import.meta.url),
    "utf8",
  );

  const contractStart = registry.indexOf('id: "distribution"');
  const contractBlock = registry.slice(contractStart, contractStart + 1200);
  assert.ok(contractStart >= 0, "contrato da fila existe");
  assert.match(contractBlock, /roleScopes: directorOnlyRoles/);
  assert.match(registry, /const directorOnlyRoles = \{[\s\S]{0,180}superintendent: "hidden",[\s\S]{0,180}manager: "hidden",[\s\S]{0,180}broker: "hidden"/);
});

test("acesso direto sem permissão recebe orientação sem expor a fila", () => {
  const page = readFileSync(
    new URL("../../app/(crm)/distribution/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /response\.status === 403/);
  assert.match(page, /setAccessDenied\(true\)/);
  assert.match(page, /data-distribution-access="director-only"/);
  assert.match(page, /A fila de distribuição é administrada pela diretoria/);
  assert.match(page, /if \(accessDenied\) return;/);
});

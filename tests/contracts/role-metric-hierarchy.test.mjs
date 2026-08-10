import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/operational-ux-phase-018-role-metric-hierarchy.json", "utf8"));
const dashboard = readFileSync("app/(crm)/dashboard/page.tsx", "utf8");

test("contrato define cinco métricas principais para os quatro papéis", () => {
  assert.equal(config.phase, 18);
  assert.equal(config.maximumPrimaryMetrics, 5);
  assert.deepEqual(Object.keys(config.roles).sort(), ["broker", "director", "manager", "superintendent"]);
  for (const role of Object.values(config.roles)) assert.equal(role.primary.length, 5);
});

test("cada painel de papel usa o deck compartilhado", () => {
  for (const role of ["corretor", "gerente", "superintendente", "diretor"]) {
    assert.match(dashboard, new RegExp(`label="Indicadores essenciais do ${role}"`));
  }
});

test("cada deck mantém exatamente cinco MetricCard na leitura principal", () => {
  const primaryGroups = [...dashboard.matchAll(/primary=\{\s*<>\s*([\s\S]*?)\s*<\/>\s*\}\s*secondary=/g)];
  assert.ok(primaryGroups.length >= 5);
  for (const group of primaryGroups) {
    assert.equal((group[1].match(/<MetricCard/g) || []).length, 5);
  }
});

test("indicadores complementares de cada papel continuam presentes", () => {
  for (const metric of ["Agenda 7 dias", "Equilíbrio da carga", "Equilíbrio entre equipes", "IA em 30 dias"]) {
    assert.match(dashboard, new RegExp(`label="${metric}"`));
  }
});

test("fase preserva infraestrutura e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});

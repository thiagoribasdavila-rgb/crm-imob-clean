import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("config/operational-ux-phase-017-primary-metric-hierarchy.json", "utf8"));
const primitives = readFileSync("components/atlas/information-primitives.tsx", "utf8");
const dashboard = readFileSync("app/(crm)/dashboard/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("contrato limita a leitura principal a cinco métricas", () => {
  assert.equal(config.phase, 17);
  assert.equal(config.maximumPrimaryMetrics, 5);
  assert.equal(config.canonicalSurface, "command-center");
});

test("componente compartilhado separa métricas principais e complementares", () => {
  assert.match(primitives, /export function AtlasMetricDeck/);
  assert.match(primitives, /data-primary-metric-limit="5"/);
  assert.match(primitives, /className="atlas-metric-deck-primary"/);
  assert.match(primitives, /className="atlas-metric-deck-secondary"/);
  assert.match(primitives, /Ver indicadores complementares/);
});

test("Sala de Comando aplica cinco métricas essenciais sem perder as demais", () => {
  const primary = dashboard.match(/primary=\{\s*<>\s*([\s\S]*?)\s*<\/>\s*\}\s*secondary=/)?.[1] || "";
  assert.equal((primary.match(/<MetricCard/g) || []).length, 5);
  assert.match(dashboard, /secondary=\{\s*<>/);
  assert.match(dashboard, /label="Visitas"/);
  assert.match(dashboard, /label="Leads Meta ativos"/);
  assert.match(dashboard, /label="Comissões a receber"/);
});

test("CSS não elimina métricas por posição e mantém foco nativo", () => {
  assert.doesNotMatch(css, /atlas-decision-strip > :nth-child\(n \+ 6\)/);
  assert.match(css, /atlas-metric-deck-secondary\s+summary/);
  assert.match(css, /summary[\s\S]*?:focus-visible/);
});

test("fase preserva infraestrutura e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});

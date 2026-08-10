import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-019-sla-intake-disclosure.json",
    "utf8",
  ),
);
const dashboard = readFileSync("app/(crm)/dashboard/page.tsx", "utf8");

test("contrato cobre entrada diária e SLA", () => {
  assert.equal(config.phase, 19);
  assert.deepEqual(config.canonicalSurfaces, ["lead-intake", "team-sla"]);
});

test("entrada mantém decisão visível e recolhe auditoria detalhada", () => {
  for (const label of [
    "Entradas operacionais hoje",
    "Recebimentos hoje",
    "Sem responsável",
    "Média diária · 7 dias",
  ]) {
    assert.match(dashboard, new RegExp(label.replace("·", "\\·")));
  }
  assert.match(
    dashboard,
    /label="Ver histórico, distribuição e origem dos dados"/,
  );
  assert.match(
    dashboard,
    /leadIntake\.dataBoundary\.provenanceCoveragePercent/,
  );
  assert.match(dashboard, /visibleBrokerIntake\.map/);
});

test("SLA mantém cinco decisões e coloca diagnóstico complementar sob demanda", () => {
  assert.match(dashboard, /label="Indicadores essenciais do SLA do time"/);
  assert.match(dashboard, /secondaryLabel="Ver tempo médio de execução"/);
  assert.match(dashboard, /teamSla\.alerts\.slice\(0, 4\)/);
  assert.match(dashboard, /teamSla\.alerts\.slice\(4, 12\)/);
});

test("fase preserva dados, infraestrutura e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
  assert.match(dashboard, /teamSla\.totals\.averageFollowUpMinutes/);
  assert.match(dashboard, /leadIntake\.summary\.historicalImportsToday/);
});

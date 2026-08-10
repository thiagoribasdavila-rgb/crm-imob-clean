import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-025-minimum-advance-readiness.json",
    "utf8",
  ),
);
const page = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");

test("contrato declara seis requisitos comerciais explicáveis", () => {
  assert.equal(config.phase, 25);
  assert.equal(config.canonicalSurface, "lead-360");
  assert.equal(config.requirements.length, 6);
  assert.deepEqual(config.requirements, [
    "contato válido",
    "projeto de interesse",
    "faixa de investimento",
    "região prioritária",
    "tipologia mínima",
    "continuidade programada",
  ]);
});

test("Lead 360 mostra progresso, requisitos e primeira lacuna", () => {
  for (const marker of [
    'data-ux-phase="25-minimum-advance-readiness"',
    "minimumAdvanceReadiness.checks.map",
    "minimumAdvanceReadiness.nextMissing",
    "Resolver próximo requisito",
    "Requisitos comerciais confirmados",
  ]) assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("a correção reutiliza fontes canônicas e não trava o funil", () => {
  assert.match(page, /recoverAdvanceRequirement/);
  assert.match(page, /recoverEssentialData\(target\)/);
  assert.match(page, /\/leads\/\$\{leadId\}\/schedule/);
  assert.match(page, /Orientação operacional, não bloqueio automático/);
  assert.doesNotMatch(page, /disabled=\{!minimumAdvanceReadiness\.ready\}/);
});

test("fase preserva infraestrutura e release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});

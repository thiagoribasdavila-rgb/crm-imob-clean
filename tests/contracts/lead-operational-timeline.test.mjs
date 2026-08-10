import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-023-lead-operational-timeline.json",
    "utf8",
  ),
);
const page = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
const api = readFileSync("app/api/v1/leads/[id]/route.ts", "utf8");

test("contrato consolida a rotina no Lead 360", () => {
  assert.equal(config.phase, 23);
  assert.equal(config.canonicalSurface, "lead-360");
  assert.deepEqual(config.priorityOrder, [
    "tarefas vencidas",
    "próximas ações",
    "visitas registradas",
    "histórico recente",
  ]);
});

test("linha operacional prioriza atraso e mantém contexto recente", () => {
  for (const marker of [
    'data-ux-phase="23-lead-operational-timeline"',
    "Linha do tempo operacional",
    "Atrasos e próximos compromissos primeiro",
    "operationalTimeline",
    "closedTaskStatuses",
  ]) assert.match(page, new RegExp(marker));
});

test("dados vêm do payload canônico existente", () => {
  assert.match(api, /\.from\("tasks"\)/);
  assert.match(api, /\.from\("activities"\)/);
  assert.match(api, /\.from\("lead_events"\)/);
  assert.match(page, /setUnifiedProfile\(data\.unifiedProfile\)/);
  assert.match(page, /setActivities\(data\.activities\)/);
});

test("fase não altera infraestrutura nem release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
  assert.match(page, /Ver histórico completo do relacionamento/);
  assert.match(page, /Salvar acompanhamento e aprendizado/);
});

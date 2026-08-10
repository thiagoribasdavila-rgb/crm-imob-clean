import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-022-tasks-calendar-focus.json",
    "utf8",
  ),
);
const tasks = readFileSync("app/(crm)/tasks/page.tsx", "utf8");
const calendar = readFileSync("app/(crm)/calendar/page.tsx", "utf8");

test("contrato cobre Tarefas e Agenda", () => {
  assert.equal(config.phase, 22);
  assert.deepEqual(config.canonicalSurfaces, ["tasks", "calendar"]);
  assert.ok(config.alwaysVisible.length >= 9);
  assert.ok(config.progressive.length >= 4);
});

test("decisões e operações permanecem na primeira leitura", () => {
  for (const marker of [
    "O que precisa ser feito agora",
    "Comece por aqui",
    "Fila comercial priorizada",
    "createTask",
  ]) assert.match(tasks, new RegExp(marker));
  assert.ok(tasks.includes('act(task,"postpone_one_day")'));
  assert.ok(tasks.includes('act(task,"complete")'));

  for (const marker of [
    "O que exige ação agora",
    "atlas-calendar-timeline-card",
    "AGENDA SINCRONIZADA",
    "/api/v1/calendar",
  ]) assert.match(calendar, new RegExp(marker));
});

test("análises complementares ficam disponíveis sob demanda", () => {
  for (const label of [
    "Ver indicadores completos da rotina",
    "Gerenciar recorrências ativas",
    "Ver carga da equipe por responsável",
  ]) assert.match(tasks, new RegExp(label));
  assert.match(calendar, /Ver composição da agenda/);
});

test("fase reduz ruído sem alterar a operação", () => {
  assert.match(tasks, /data-ux-phase="22-tasks-agenda-focus"/);
  assert.match(calendar, /data-ux-phase="22-tasks-agenda-focus"/);
  assert.doesNotMatch(calendar, /FASE 39 · AGENDA TEMPORAL/);
  assert.doesNotMatch(calendar, /FASE 46 · AGENDA COMERCIAL UNIFICADA/);
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lead360 = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-047-prioritized-timeline.json",
    "utf8",
  ),
);

test("fase 47 limita a primeira leitura a três registros", () => {
  assert.equal(config.phase, 47);
  assert.equal(config.visibleLimit, 3);
  assert.match(lead360, /data-ux-phase="47-lead360-prioritized-timeline"/);
  assert.match(lead360, /operationalTimeline\.slice\(0, 3\)/);
});

test("ordenação canônica mantém atrasos e compromissos antes do histórico", () => {
  assert.equal(config.overdueFirst, true);
  assert.equal(config.upcomingSecond, true);
  assert.equal(config.recentContextPreserved, true);
  const overdue = lead360.indexOf('left.timing === "overdue" ? -1 : 1');
  const history = lead360.indexOf("const historyItems = activities");
  assert.ok(overdue >= 0);
  assert.ok(history > overdue);
});

test("registros complementares permanecem em divulgação acessível", () => {
  assert.equal(config.overflowAccessible, true);
  assert.match(lead360, /<details className="atlas-lead360-timeline-overflow">/);
  assert.match(lead360, /Ver mais \{prioritizedOperationalTimeline\.remaining\.length\}/);
  assert.match(styles, /atlas-lead360-timeline-overflow summary:focus-visible/);
});

test("histórico completo e registro de acompanhamento são preservados", () => {
  assert.equal(config.fullHistoryPreserved, true);
  assert.match(lead360, /Ver histórico completo do relacionamento/);
  assert.match(lead360, /Salvar acompanhamento e aprendizado/);
  assert.match(lead360, /addActivity/);
});

test("fase reutiliza dados existentes e não altera infraestrutura", () => {
  assert.equal(config.canonicalDataReused, true);
  assert.match(lead360, /const prioritizedOperationalTimeline = useMemo/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});

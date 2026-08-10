import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lead360 = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-046-lead360-operational-snapshot.json",
    "utf8",
  ),
);

test("fase 46 consolida a retomada do atendimento", () => {
  assert.equal(config.phase, 46);
  assert.match(lead360, /data-ux-phase="46-lead360-operational-snapshot"/);
  assert.match(lead360, /Situação, contexto e próximo passo/);
});

test("situação, interação e ação permanecem na primeira leitura", () => {
  assert.equal(config.situationVisible, true);
  assert.equal(config.lastInteractionVisible, true);
  assert.equal(config.nextActionVisible, true);
  for (const marker of [
    'data-signal="situation"',
    'data-signal="last-interaction"',
    'data-signal="next-action"',
  ]) {
    assert.match(lead360, new RegExp(marker));
  }
});

test("snapshot reutiliza dados canônicos já carregados", () => {
  assert.equal(config.canonicalDataReused, true);
  assert.match(lead360, /const operationalSnapshot = useMemo/);
  assert.match(lead360, /activities\[0\]/);
  assert.match(lead360, /operationalTimeline\.find/);
  assert.match(lead360, /intelligence\.nextAction/);
});

test("profundidade analítica e histórico continuam acessíveis", () => {
  assert.equal(config.fullIntelligencePreserved, true);
  assert.equal(config.historyPreserved, true);
  assert.match(lead360, /Ver inteligência completa do atendimento/);
  assert.match(lead360, /Ver histórico completo do relacionamento/);
  assert.match(lead360, /addActivity/);
});

test("layout é responsivo e não altera infraestrutura", () => {
  assert.equal(config.responsive, true);
  assert.match(styles, /atlas-lead360-operational-snapshot/);
  assert.match(
    styles,
    /@media \(max-width: 760px\)[\s\S]*atlas-lead360-operational-snapshot-grid/,
  );
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});

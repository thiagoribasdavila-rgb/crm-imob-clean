import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const snapshot = JSON.parse(read("config/v3000-progress.json"));
const page = read("app/(crm)/atlas-v3/page.tsx");
const surface = read("components/atlas/v3000-progress-surface.tsx");
const audit = read("scripts/audit-v3000-progress-governance.mjs");

test("snapshot mantém progresso histórico e gates separados", () => {
  assert.equal(snapshot.program.targetPhases, 3000);
  assert.equal(snapshot.program.legacyPhasesRequested, 380);
  assert.equal(snapshot.program.verifiedHistoricalPhases, 377);
  assert.equal(snapshot.program.phaseContractsFound, 57);
  assert.equal(snapshot.consolidation.totalPhases, 16);
  assert.equal(snapshot.consolidation.currentPhase, 4);
  assert.deepEqual(
    snapshot.consolidation.phases.map((phase) => phase.id),
    Array.from({ length: 16 }, (_, index) => index + 1),
  );
});

test("somente gates comprovados aparecem concluídos", () => {
  const complete = snapshot.consolidation.phases.filter(
    (phase) => phase.status === "complete",
  );
  const next = snapshot.consolidation.phases.filter(
    (phase) => phase.status === "next",
  );

  assert.deepEqual(complete.map((phase) => phase.id), [1, 2, 3, 4]);
  assert.deepEqual(next.map((phase) => phase.id), [5]);
});

test("página canônica usa template V3000 e remove programa inflado", () => {
  assert.match(page, /V3000PageTemplate/);
  assert.match(page, /V3000ProgressMetrics/);
  assert.match(page, /V3000ProgressWorkspace/);
  assert.doesNotMatch(page, /Evolution500Program/);
  assert.doesNotMatch(page, /overallEvolution/);
  assert.doesNotMatch(page, /technicalEvolution/);
});

test("superfície explica fonte, lacuna e gate do ZIP", () => {
  assert.match(surface, /Fonte de verdade/);
  assert.match(surface, /Lacuna identificada/);
  assert.match(surface, /Consolidação para ZIP/);
  assert.match(surface, /ZIP é consequência/);
});

test("auditoria é somente leitura e não acessa runtime externo", () => {
  assert.doesNotMatch(audit, /writeFile|unlink|rmSync|fetch\(|supabase/i);
  assert.doesNotMatch(audit, /process\.env/);
  assert.match(audit, /readFileSync/);
});

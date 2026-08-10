import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/reports/page.tsx", "utf8");

test("relatórios validam payloads antes de atualizar estados tipados", () => {
  assert.match(page, /const isBriefing/);
  assert.match(page, /const isWeeklyReview/);
  assert.match(page, /const isWeeklyAcquisitionReport/);
  assert.match(page, /if \(isBriefing\(payload\)\)/);
  assert.match(page, /if \(isWeeklyAcquisitionReport\(payload\)\)/);
  assert.match(page, /if \(isWeeklyReview\(report\)\)/);
});

test("resposta inválida preserva a última leitura válida e informa o operador", () => {
  assert.match(page, /Os últimos dados válidos foram preservados/);
  assert.doesNotMatch(page, /setWeekly\(payload as WeeklyAcquisitionReport\)/);
  assert.doesNotMatch(
    page,
    /setBriefing\(\(await response\.json\(\)\) as Briefing\)/,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/reports/page.tsx", "utf8");

test("relatórios não convertem ausência de mídia em resultado financeiro zero", () => {
  assert.match(page, /const moneyOrUnavailable/);
  assert.match(page, /spend: null/);
  assert.match(page, /revenue: null/);
  assert.match(page, /leads_count: null/);
  assert.match(page, /sales_count: null/);
  assert.match(page, /campaignsWithSpend/);
  assert.match(page, /moneyOrUnavailable\(metrics\.spend\)/);
  assert.match(page, /metricOrUnavailable\(metrics\.roi, "%"\)/);
});

test("relatórios preservam dados anteriores quando uma fonte falha e permitem recuperação", () => {
  assert.match(page, /if \(!leadResult\.error\)/);
  assert.match(page, /if \(!campaignResult\.error\)/);
  assert.match(page, /Tentar novamente/);
  assert.match(page, /const latestLoad = useRef\(0\)/);
  assert.match(page, /const isMounted = useRef\(false\)/);
  assert.match(page, /if \(!isCurrentLoad\(\)\) return/);
});

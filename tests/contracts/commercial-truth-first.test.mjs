import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-027-commercial-truth-first.json",
    "utf8",
  ),
);
const page = readFileSync("app/(crm)/developments/materials/page.tsx", "utf8");
const api = readFileSync("app/api/v1/developments/materials/route.ts", "utf8");

test("contrato prioriza a verdade comercial antes da análise", () => {
  assert.equal(config.phase, 27);
  assert.deepEqual(config.decisionOrder.slice(0, 3), [
    "estoque disponível",
    "preço de entrada",
    "material vigente",
  ]);
});

test("Hub mostra estoque, preço e vigência na primeira faixa de decisão", () => {
  assert.match(page, /data-ux-phase="27-commercial-truth-first"/);
  assert.match(page, /label="Estoque disponível"/);
  assert.match(page, /label="Preço de entrada"/);
  assert.match(page, /label="Material vigente"/);
});

test("preço e estoque vêm do cadastro canônico e respeitam organização", () => {
  assert.match(api, /from\("properties"\)/);
  assert.match(api, /select\("development_id,status,price"\)/);
  assert.match(api, /\.eq\("organization_id", org\)/);
  assert.match(api, /availableStatuses/);
});

test("ausência de preço não é apresentada como valor comercial válido", () => {
  assert.match(page, /"A confirmar"/);
  assert.equal(config.zeroPricePolicy, "never-present-zero-as-valid-price");
  assert.equal(config.infrastructureMutation, false);
});

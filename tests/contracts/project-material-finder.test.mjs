import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-026-project-material-finder.json",
    "utf8",
  ),
);
const page = readFileSync("app/(crm)/developments/materials/page.tsx", "utf8");
const api = readFileSync("app/api/v1/developments/materials/route.ts", "utf8");

test("contrato declara as quatro dimensões da busca operacional", () => {
  assert.equal(config.phase, 26);
  assert.equal(config.canonicalSurface, "development-material-hub");
  assert.deepEqual(config.searchDimensions, [
    "projeto",
    "incorporadora",
    "região",
    "tipologia",
  ]);
});

test("Hub de Materiais oferece busca compacta e filtros acionáveis", () => {
  for (const marker of [
    'data-ux-phase="26-project-material-finder"',
    "Encontre a oferta certa",
    "Todas as incorporadoras",
    "Todas as regiões",
    "Todas as tipologias",
    "projeto(s) aderentes aos filtros",
  ])
    assert.match(
      page,
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
});

test("busca usa região e tipologia persistidas no cadastro canônico", () => {
  for (const marker of ["neighborhood", "city", "product_type", "typologies"]) {
    assert.match(page, new RegExp(marker));
    assert.match(api, new RegExp(marker));
  }
  assert.match(page, /parameters\.get\("project"\)/);
});

test("fase preserva governança do endpoint e não altera infraestrutura", () => {
  assert.match(api, /requireAccessContext/);
  assert.match(api, /materials\.portfolio\.read/);
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});

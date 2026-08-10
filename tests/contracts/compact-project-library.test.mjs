import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/developments/materials/page.tsx", "utf8");
const api = readFileSync(
  "app/api/v1/developments/[id]/materials/route.ts",
  "utf8",
);
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-028-compact-project-library.json",
    "utf8",
  ),
);

test("fase 28 agrupa a biblioteca por intenção operacional", () => {
  assert.match(page, /28-compact-project-library/);
  assert.match(page, /Oferta comercial/);
  assert.match(page, /Plantas e implantação/);
  assert.match(page, /Imagens e vídeos/);
  assert.match(page, /Documentos de apoio/);
});

test("classificação visual usa o tipo MIME real sem criar categoria fictícia", () => {
  assert.match(page, /mime_type\?\.startsWith\("image\/"\)/);
  assert.match(page, /mime_type\?\.startsWith\("video\/"\)/);
  assert.equal(config.groups.length, 4);
});

test("ações existentes permanecem disponíveis na biblioteca compacta", () => {
  for (const label of ["Abrir", "Compartilhar", "Validar"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /Publicar nova versão/);
});

test("API preserva isolamento da organização e URLs temporárias", () => {
  assert.match(api, /requireAccessContext/);
  assert.match(
    api,
    /\.eq\("organization_id", access\.access\.organization\.id\)/,
  );
  assert.match(api, /signedMaterialUrl/);
  assert.match(api, /expiresInSeconds = 900/);
});

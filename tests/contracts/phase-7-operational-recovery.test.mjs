import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("campanhas internas têm CRUD, anexos privados e operação sem Meta", () => {
  const collection = read("app/api/v1/marketing/campaigns/route.ts");
  const detail = read("app/api/v1/marketing/campaigns/[id]/route.ts");
  const assets = read("app/api/v1/marketing/campaigns/[id]/assets/route.ts");
  const migration = read("supabase/migrations/20260723203000_phase_7_operational_recovery.sql");
  assert.match(collection, /export async function GET/);
  assert.match(collection, /export async function POST/);
  assert.match(detail, /export async function PATCH/);
  assert.match(detail, /export async function DELETE/);
  assert.match(assets, /uploadMaterial/);
  assert.match(assets, /validSignature/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /campaign_assets_org_select/);
});

test("projetos têm detalhe, edição e arquivamento preservando histórico", () => {
  const route = read("app/api/v1/developments/[id]/route.ts");
  const page = read("app/(crm)/developments/registry/page.tsx");
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /status: "archived"/);
  assert.match(page, /Salvar alterações/);
  assert.match(page, /Arquivar/);
  assert.match(page, /statusFilter/);
});

test("materiais e estoque mantêm validação, versão e isolamento", () => {
  const materials = read("app/api/v1/developments/[id]/materials/route.ts");
  const inventory = read("app/api/v1/developments/[id]/inventory/import/route.ts");
  assert.match(materials, /MAX_FILE_SIZE = 50/);
  assert.match(materials, /hasExpectedSignature/);
  assert.match(materials, /version_project_material_cloud/);
  assert.match(inventory, /requireAccessContext/);
  assert.match(inventory, /read-excel-file|readXlsxFile/);
});

test("navegação operacional usa Atlas One e sinaliza integrações externas", () => {
  const sidebar = read("components/Sidebar.tsx");
  assert.match(sidebar, /ATLAS <span className="text-sky-400">ONE/);
  assert.match(sidebar, /Incorporadoras/);
  assert.match(sidebar, /Materiais/);
  assert.match(sidebar, /Campanhas/);
  assert.match(sidebar, /CONECTAR/);
  assert.doesNotMatch(sidebar, /ATLAS AI/);
});

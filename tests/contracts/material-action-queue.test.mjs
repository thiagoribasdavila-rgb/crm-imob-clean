import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/(crm)/developments/materials/page.tsx", "utf8");
const portfolioApi = readFileSync(
  "app/api/v1/developments/materials/route.ts",
  "utf8",
);
const materialApi = readFileSync(
  "app/api/v1/developments/[id]/materials/route.ts",
  "utf8",
);
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-029-material-action-queue.json",
    "utf8",
  ),
);

test("fase 29 ordena vencido, próximo vencimento e revisão pendente", () => {
  assert.match(page, /29-material-action-queue/);
  assert.match(page, /daysUntilExpiry <= 30/);
  assert.match(page, /left\.priority - right\.priority/);
  assert.deepEqual(config.priorityOrder, [
    "expired",
    "expires_within_30_days",
    "pending_review",
  ]);
});

test("fila é curta e informa pendências restantes", () => {
  assert.match(page, /materialActionQueue\.slice\(0, 5\)/);
  assert.match(page, /pendência\(s\) no/);
  assert.equal(config.visibleLimit, 5);
});

test("ações reutilizam validação e publicação versionada existentes", () => {
  assert.match(page, /reviewMaterial\(item\.material\.id\)/);
  assert.match(page, /prepareMaterialUpdate\(item\.material\)/);
  assert.match(page, /id="material-version-form"/);
  assert.match(materialApi, /version_project_material_cloud/);
  assert.match(portfolioApi, /review_project_material/);
});

test("gestão e isolamento existentes continuam governando a fila", () => {
  const patchHandler = portfolioApi.slice(
    portfolioApi.indexOf("export async function PATCH"),
  );
  assert.match(page, /canManage &&/);
  assert.match(patchHandler, /roles:\s*\[/);
  for (const role of ["admin", "director", "superintendent", "manager"]) {
    assert.match(patchHandler, new RegExp(`"${role}"`));
  }
  assert.match(materialApi, /requireAccessContext/);
  assert.match(materialApi, /organization_id/);
});

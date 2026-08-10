import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-024-essential-data-recovery.json",
    "utf8",
  ),
);
const page = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
const contextEditor = readFileSync(
  "components/crm/lead-context-correction.tsx",
  "utf8",
);

test("contrato mantém a recuperação no Lead 360 canônico", () => {
  assert.equal(config.phase, 24);
  assert.equal(config.canonicalSurface, "lead-360");
  assert.deepEqual(config.essentialFields, [
    "project",
    "budget_max",
    "preferred_regions",
    "bedrooms",
    "phone",
  ]);
});

test("primeira pendência recebe ação e as demais ficam compactas", () => {
  for (const marker of [
    'data-ux-phase="24-essential-data-recovery"',
    "Complete o mínimo para recomendar melhor",
    "essentialRecoveryItems[0]",
    "essentialRecoveryItems.slice(1)",
    "recoverEssentialData",
  ]) assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("projeto abre correção governada e perfil reutiliza campos existentes", () => {
  assert.match(page, /setContextEditorRequest/);
  assert.match(page, /initiallyEditing=\{contextEditorRequest > 0\}/);
  assert.match(contextEditor, /initiallyEditing\?: boolean/);
  assert.match(contextEditor, /useState\(initiallyEditing\)/);
  assert.match(page, /id="lead-commercial-profile"/);
  assert.match(page, /placeholder="Orçamento máximo"/);
  assert.match(page, /placeholder="Regiões preferidas"/);
});

test("fase não altera infraestrutura nem release", () => {
  assert.equal(config.infrastructureMutation, false);
  assert.equal(config.releaseMutation, false);
});

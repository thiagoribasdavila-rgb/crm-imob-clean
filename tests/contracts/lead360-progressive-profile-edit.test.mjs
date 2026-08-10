import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lead360 = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync(
    "config/operational-ux-phase-048-progressive-profile-edit.json",
    "utf8",
  ),
);

test("fase 48 mantém quatro campos comerciais na primeira leitura", () => {
  assert.equal(config.phase, 48);
  assert.deepEqual(config.essentialFields, [
    "status",
    "temperature",
    "budget_max",
    "preferred_regions",
  ]);
  assert.match(lead360, /data-ux-phase="48-lead360-progressive-profile-edit"/);
  assert.match(lead360, /data-field-priority="essential"/);
  assert.match(lead360, /Essencial para conduzir/);
});

test("dados complementares permanecem editáveis sob demanda", () => {
  assert.equal(config.complementaryFieldsPreserved, true);
  assert.match(lead360, /className="atlas-lead360-profile-complementary"/);
  assert.match(lead360, /Dados complementares do perfil/);
  for (const field of [
    "Nome",
    "Telefone",
    "E-mail",
    "Orçamento mínimo",
    "Dormitórios",
    "Observações estratégicas",
  ]) {
    assert.match(lead360, new RegExp(`aria-label="${field}"`));
  }
});

test("divulgação complementar oferece foco visível e sem marcador nativo duplicado", () => {
  assert.match(
    styles,
    /atlas-lead360-profile-complementary > summary:focus-visible/,
  );
  assert.match(styles, /summary::-webkit-details-marker/);
  assert.match(styles, /atlas-lead360-profile-complementary\[open\]/);
});

test("salvamento e estado canônico permanecem únicos", () => {
  assert.equal(config.singleSaveFlowPreserved, true);
  assert.equal(config.canonicalStatePreserved, true);
  assert.match(lead360, /onSubmit=\{saveLead\}/);
  assert.match(lead360, /Salvar alterações/);
  assert.match(lead360, /setLead\(\{ \.\.\.lead,/);
});

test("fase não altera infraestrutura nem gera entrega externa", () => {
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});

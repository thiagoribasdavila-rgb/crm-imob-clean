import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lead360 = readFileSync("app/(crm)/leads/[id]/page.tsx", "utf8");
const materials = readFileSync("app/(crm)/developments/materials/page.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");
const config = JSON.parse(
  readFileSync("config/operational-ux-phase-050-material-in-attendance.json", "utf8"),
);

test("fase 50 cria um único percurso principal para o material", () => {
  assert.equal(config.phase, 50);
  assert.equal(config.singlePrimaryMaterialRoute, true);
  assert.match(lead360, /data-ux-phase="50-material-in-attendance"/);
  assert.match(lead360, /Abrir kit do projeto/);
  assert.match(lead360, /mode: "attendance"/);
  assert.match(lead360, /lead: lead\.id/);
});

test("biblioteca recebe projeto e contexto da lead", () => {
  assert.equal(config.leadContextPreserved, true);
  assert.equal(config.projectFilterPreserved, true);
  assert.match(materials, /parameters\.get\("mode"\) === "attendance"/);
  assert.match(materials, /parameters\.get\("lead"\)/);
  assert.match(materials, /parameters\.get\("project"\)/);
  assert.match(materials, /data-ux-phase="50-material-attendance-context"/);
});

test("corretor retorna ao mesmo atendimento sem refazer a busca", () => {
  assert.equal(config.returnToLeadAvailable, true);
  assert.match(materials, /Voltar ao atendimento/);
  assert.match(materials, /encodeURIComponent\(attendanceLeadId\)/);
});

test("estoque, simulação, perfil e Copilot continuam acessíveis sob demanda", () => {
  assert.equal(config.secondaryActionsProgressive, true);
  assert.match(lead360, /Outras ações do atendimento/);
  for (const label of ["Conferir estoque", "Montar simulação", "Revisar perfil", "Preparar mensagem"]) {
    assert.match(lead360, new RegExp(label));
  }
  assert.match(styles, /atlas-lead360-attendance-kit-more/);
});

test("fase preserva verdade comercial, persistência e entrega", () => {
  assert.equal(config.priceAndInventoryWarningPreserved, true);
  assert.match(materials, /Confirme vigência, preço e estoque/);
  assert.match(lead360, /Disponibilidade deve ser confirmada antes do envio/);
  assert.equal(config.databaseMutation, false);
  assert.equal(config.migrationCreated, false);
  assert.equal(config.externalDelivery, false);
  assert.equal(config.buildExecuted, false);
});

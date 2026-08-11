import assert from "node:assert/strict";
import test from "node:test";
import {
  KANBAN_ACCESSIBILITY_CONTRACT,
  buildKanbanCardAccessibility,
} from "../../lib/atlas/kanban-accessibility.ts";
import {
  loadMotionFocusAccessibilityRegistry,
  validateMotionFocusAccessibility,
} from "../../scripts/check-v3000-phase-54-motion-focus-accessibility.mjs";

const root = process.cwd();

function card(overrides = {}) {
  return buildKanbanCardAccessibility({
    busy: false,
    currentStageLabel: "Qualificação",
    leadName: "Ana Costa",
    nextActionLabel: "Agendar visita",
    nextStageLabel: "Visita",
    previousStageLabel: "Contato",
    projectName: "Inside Perdizes",
    ...overrides,
  });
}

test("Fase 54 preserva o contrato de movimento, foco e acessibilidade", () => {
  const registry = loadMotionFocusAccessibilityRegistry(root);
  const result = validateMotionFocusAccessibility({ root, registry });

  assert.equal(result.phase, 54);
  assert.equal(result.status, "motion-focus-accessibility-adopted");
  assert.equal(result.wcagTarget, "AA");
  assert.equal(result.motionPurposes, 3);
  assert.equal(result.keyboardShortcuts, 2);
  assert.equal(result.minimumTargetSize, 24);
  assert.equal(result.primaryTargetSize, 44);
});

test("card anuncia identidade, projeto, etapa e próxima ação", () => {
  const result = card();

  assert.match(result.label, /Ana Costa/);
  assert.match(result.label, /Projeto Inside Perdizes/);
  assert.match(result.label, /Etapa Qualificação/);
  assert.match(result.label, /Próxima ação: Agendar visita/);
  assert.equal(result.movementAvailable, true);
});

test("card central descobre os dois destinos por teclado", () => {
  const result = card();

  assert.equal(result.keyShortcuts, "Alt+ArrowLeft Alt+ArrowRight");
  assert.match(result.description, /esquerda volta para Contato/);
  assert.match(result.description, /direita avança para Visita/);
});

test("primeira e última etapas anunciam seus limites", () => {
  const first = card({ previousStageLabel: null });
  const last = card({ nextStageLabel: null });

  assert.match(first.description, /primeira etapa/);
  assert.match(last.description, /última etapa visível/);
  assert.equal(first.movementAvailable, true);
  assert.equal(last.movementAvailable, true);
});

test("card ocupado interrompe o movimento sem esconder contexto", () => {
  const result = card({ busy: true });

  assert.equal(result.movementAvailable, false);
  assert.match(result.description, /temporariamente indisponível/);
  assert.match(result.label, /Inside Perdizes/);
});

test("dados ausentes recebem alternativas textuais explícitas", () => {
  const result = card({
    leadName: " ",
    projectName: null,
    nextActionLabel: undefined,
    currentStageLabel: "",
  });

  assert.match(result.label, /Lead sem nome/);
  assert.match(result.label, /Projeto não informado/);
  assert.match(result.label, /Etapa não informada/);
  assert.match(result.label, /Próxima ação não definida/);
});

test("contrato proíbe motion decorativo, IA, mutação e migration", () => {
  assert.deepEqual(KANBAN_ACCESSIBILITY_CONTRACT.motionPurposes, [
    "state-change",
    "data-arrival",
    "disclosure",
  ]);
  assert.equal(KANBAN_ACCESSIBILITY_CONTRACT.reducedMotion, true);
  assert.equal(KANBAN_ACCESSIBILITY_CONTRACT.aiCalls, 0);
  assert.equal(KANBAN_ACCESSIBILITY_CONTRACT.businessMutation, false);
  assert.equal(KANBAN_ACCESSIBILITY_CONTRACT.databaseMigration, false);
});

test("Fase 54 rejeita padrão AAA não assumido pelo produto", () => {
  const registry = structuredClone(loadMotionFocusAccessibilityRegistry(root));
  registry.accessibility.wcagTarget = "AAA";

  assert.throws(
    () => validateMotionFocusAccessibility({ root, registry }),
    /alvo WCAG AA e contraste 4,5:1/,
  );
});

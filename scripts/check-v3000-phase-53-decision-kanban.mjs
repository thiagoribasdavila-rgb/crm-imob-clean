import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-53-decision-kanban.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadDecisionKanbanRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateDecisionKanban({ root = process.cwd(), registry }) {
  assert(registry.phase === 53, "O contrato precisa representar a Fase 53.");
  assert(
    registry.status === "decision-kanban-adopted",
    "A Fase 53 precisa estar decision-kanban-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 52 &&
      registry.previousPhase?.status === "command-center-exceptions-adopted",
    "A Fase 53 precisa preservar o rastro factual da Fase 52.",
  );
  assert(
    JSON.stringify(registry.board?.visibleHeaderMetrics) ===
      JSON.stringify(["volume", "valid-value", "main-bottleneck"]),
    "O cabeçalho precisa conter somente volume, valor válido e gargalo principal.",
  );
  assert(
    registry.board?.preservedCardContext?.includes("project") &&
      registry.board?.preservedCardContext?.includes("validation") &&
      registry.board?.preservedCardContext?.includes("next-action") &&
      registry.board?.preservedCardContext?.includes("movement-audit"),
    "O card precisa preservar projeto, validação, próxima ação e auditoria.",
  );
  assert(
    registry.board?.mobileColumns === 1 &&
      registry.board?.governedMovement?.includes("drag-and-drop") &&
      registry.board?.governedMovement?.includes("keyboard-alt-arrows") &&
      registry.board?.governedMovement?.includes("undo-audit"),
    "O board precisa manter movimento governado e uma coluna compacta no mobile.",
  );
  assert(
    registry.constraints?.databaseMigration === false &&
      registry.constraints?.businessMutation === false &&
      registry.constraints?.aiCall === false &&
      registry.constraints?.visibilityExpansion === false &&
      registry.constraints?.syntheticData === false,
    "A fase não pode migrar banco, mutar negócio, chamar IA, ampliar visibilidade ou inventar dados.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const helper = readText(root, "lib/atlas/kanban-decision-board.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_53_DECISION_KANBAN.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildKanbanStageDecisionHeader",
    'data-v3000-phase="53-decision-kanban"',
    'data-stage-metric="volume"',
    'data-stage-metric="valid-value"',
    'data-stage-metric="main-bottleneck"',
    'data-decision-preserved="project validation next-action movement-audit"',
    'data-v3000-phase="53-progressive-card-context"',
  ]) {
    assert(pipeline.includes(marker), `Marcador de decisão ausente: ${marker}`);
  }
  for (const marker of [
    "onDrop={(event) => onDrop(event, stage.key)}",
    "onDragStart={(event) =>",
    "moveByKeyboard(lead, -1)",
    "moveByKeyboard(lead, 1)",
    "void moveLead(",
  ]) {
    assert(pipeline.includes(marker), `Movimento governado ausente: ${marker}`);
  }
  assert(
    !pipeline.includes('data-stage-metric="probability"') &&
      !pipeline.includes("AtlasProgress value={stage.probability}"),
    "O cabeçalho não pode repetir probabilidade ou decoração antiga.",
  );

  for (const marker of [
    "visibleHeaderMetrics: 3",
    '"project"',
    '"validation"',
    '"next-action"',
    '"movement-audit"',
    "compactMobileColumns: 1",
    "if (urgent > 0)",
    "if (noAction > 0)",
    "if (stalled > 0)",
  ]) {
    assert(helper.includes(marker), `Regra do contrato ausente: ${marker}`);
  }

  for (const marker of [
    "V3000 Fase 053",
    ".atlas-kanban-v3000-decision-header",
    ".atlas-kanban-v3000-decision-preservation",
    '.atlas-kanban-board[data-v3000-phase~="53-decision-kanban"]',
    "grid-template-columns: minmax(0, 1fr) !important",
  ]) {
    assert(
      css.includes(marker),
      `Estilo do Kanban decisivo ausente: ${marker}`,
    );
  }

  assert(
    /três sinais[\s\S]+volume, valor válido e gargalo\s+principal/i.test(
      documentation,
    ) &&
      /Arraste[\s\S]+Alt[^\n]*\+[^\n]*seta[\s\S]+auditoria/i.test(
        documentation,
      ),
    "A documentação precisa registrar hierarquia e movimento governado.",
  );
  assert(
    /APIs autenticadas[\s\S]+RLS do Supabase/i.test(documentation) &&
      /uma etapa por vez em uma coluna compacta/i.test(documentation),
    "A documentação precisa registrar segurança e responsividade.",
  );
  assert(
    /### Fase 53[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 53.",
  );

  return {
    phase: 53,
    status: registry.status,
    checks: 15,
    visibleHeaderMetrics: registry.board.visibleHeaderMetrics.length,
    preservedCardContext: registry.board.preservedCardContext.length,
    mobileColumns: registry.board.mobileColumns,
    governedMovement: registry.board.governedMovement.length,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadDecisionKanbanRegistry(root, registryPath);
  const summary = validateDecisionKanban({ root, registry });
  process.stdout.write(
    `V3000 phase 53 decision kanban: ${summary.checks}/${summary.checks} checks passed.\n`,
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 53 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

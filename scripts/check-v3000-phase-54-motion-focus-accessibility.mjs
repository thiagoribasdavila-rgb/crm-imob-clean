import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-54-motion-focus-accessibility.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadMotionFocusAccessibilityRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateMotionFocusAccessibility({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 54, "O contrato precisa representar a Fase 54.");
  assert(
    registry.status === "motion-focus-accessibility-adopted",
    "A Fase 54 precisa estar motion-focus-accessibility-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 53 &&
      registry.previousPhase?.status === "decision-kanban-adopted",
    "A Fase 54 precisa preservar o Kanban decisivo da Fase 53.",
  );
  assert(
    registry.accessibility?.wcagTarget === "AA" &&
      registry.accessibility?.minimumTextContrast === 4.5,
    "Os componentes críticos precisam declarar alvo WCAG AA e contraste 4,5:1.",
  );
  assert(
    registry.accessibility?.minimumTargetSize === 24 &&
      registry.accessibility?.primaryTargetSize === 44,
    "Os alvos precisam preservar 24px no mínimo e 44px nas ações primárias.",
  );
  assert(
    JSON.stringify(registry.accessibility?.keyboardMovement) ===
      JSON.stringify(["Alt+ArrowLeft", "Alt+ArrowRight"]),
    "O movimento por teclado precisa preservar Alt+ArrowLeft e Alt+ArrowRight.",
  );
  assert(
    JSON.stringify(registry.accessibility?.motionPurposes) ===
      JSON.stringify(["state-change", "data-arrival", "disclosure"]),
    "Motion só pode comunicar mudança de estado, chegada de dado ou expansão.",
  );
  assert(
    registry.accessibility?.liveRegion === "polite" &&
      registry.accessibility?.reducedMotion === true &&
      registry.accessibility?.textAlternative === true &&
      registry.accessibility?.forcedColors === true,
    "A fase precisa preservar anúncio, alternativa textual, movimento reduzido e cores forçadas.",
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
  const helper = readText(root, "lib/atlas/kanban-accessibility.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_54_MOTION_FOCUS_ACCESSIBILITY.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildKanbanCardAccessibility",
    'data-v3000-accessibility-phase="54-motion-focus-accessibility"',
    "aria-keyshortcuts={",
    'aria-atomic="true"',
    'data-v3000-accessibility="wcag-aa keyboard-movement live-status reduced-motion"',
    'data-motion-purpose="disclosure"',
    "moveByKeyboard(lead, -1)",
    "moveByKeyboard(lead, 1)",
  ]) {
    assert(
      pipeline.includes(marker),
      `Contrato acessível ausente no Kanban: ${marker}`,
    );
  }

  for (const marker of [
    "KANBAN_ACCESSIBILITY_CONTRACT",
    'wcagTarget: "AA"',
    "minimumTextContrast: 4.5",
    "minimumTargetSize: 24",
    "primaryTargetSize: 44",
    'keyShortcuts: "Alt+ArrowLeft Alt+ArrowRight"',
    'readable(input.projectName, "Projeto não informado")',
    "movementAvailable",
  ]) {
    assert(helper.includes(marker), `Regra acessível ausente: ${marker}`);
  }

  for (const marker of [
    "V3000 Fase 054",
    ":focus-visible",
    "min-width: 24px",
    "min-height: 44px",
    "@media (prefers-contrast: more)",
    "@media (forced-colors: active)",
    "@media (prefers-reduced-motion: reduce)",
    "transition-duration: 0.01ms !important",
  ]) {
    assert(css.includes(marker), `Estilo acessível ausente: ${marker}`);
  }

  assert(
    /WCAG 2\.2 nível AA[\s\S]+contraste textual mínimo de 4,5:1[\s\S]+44px/i.test(
      documentation,
    ),
    "A documentação precisa registrar o alvo AA, o contraste e os alvos críticos.",
  );
  assert(
    /Alt \+ ←[\s\S]+Alt \+ →[\s\S]+aria-live="polite"/i.test(documentation) &&
      /prefers-reduced-motion: reduce/i.test(documentation),
    "A documentação precisa registrar teclado, anúncio e movimento reduzido.",
  );
  assert(
    /mesmo fluxo governado de `moveLead`/i.test(documentation) &&
      /não cria migration[\s\S]+não chama\s+IA/i.test(documentation),
    "A documentação precisa preservar governança, banco e ausência de chamadas IA.",
  );
  assert(
    /### Fase 54[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 54.",
  );

  return {
    phase: 54,
    status: registry.status,
    checks: 16,
    wcagTarget: registry.accessibility.wcagTarget,
    motionPurposes: registry.accessibility.motionPurposes.length,
    keyboardShortcuts: registry.accessibility.keyboardMovement.length,
    minimumTargetSize: registry.accessibility.minimumTargetSize,
    primaryTargetSize: registry.accessibility.primaryTargetSize,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadMotionFocusAccessibilityRegistry(root, registryPath);
  const summary = validateMotionFocusAccessibility({ root, registry });
  process.stdout.write(
    `V3000 phase 54 motion, focus and accessibility: ${summary.checks}/${summary.checks} checks passed.\n`,
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
      `Fase 54 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

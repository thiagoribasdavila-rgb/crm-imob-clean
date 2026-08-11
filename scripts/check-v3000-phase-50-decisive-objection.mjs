import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-50-decisive-objection.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadDecisiveObjectionRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateDecisiveObjection({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 50, "O contrato precisa representar a Fase 50.");
  assert(
    registry.status === "decisive-objection-adopted",
    "A Fase 50 precisa estar decisive-objection-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 49 &&
      registry.previousPhase?.status === "opportunity-attribution-adopted",
    "A Fase 50 precisa preservar o rastro factual da Fase 49.",
  );
  assert(
    JSON.stringify(registry.scope?.allowedKinds) ===
      JSON.stringify([
        "price",
        "credit",
        "deadline",
        "region",
        "typology",
        "no-return",
      ]),
    "A fase deve limitar os seis bloqueios comerciais previstos.",
  );
  assert(
    JSON.stringify(registry.scope?.evidencePriority) ===
      JSON.stringify([
        "explicit-objection",
        "project-mismatch",
        "no-return",
        "missing-qualification",
      ]),
    "A prioridade de evidência precisa ser explícita e determinística.",
  );
  assert(
    registry.scope?.maxVisible === 1 &&
      registry.scope?.registeredFactsOnly === true &&
      registry.scope?.freeTextNotesAreEvidence === false &&
      registry.scope?.objectiveActionRequired === true,
    "O card deve mostrar um único fato com ação objetiva, sem usar notas livres.",
  );
  assert(
    registry.constraints?.databaseMigration === false &&
      registry.constraints?.businessMutation === false &&
      registry.constraints?.aiCall === false &&
      registry.constraints?.freeTextInference === false,
    "A Fase 50 não pode alterar banco, negócio, chamar IA ou inferir texto livre.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const helper = readText(root, "lib/atlas/decisive-objection.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_50_DECISIVE_OBJECTION.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildDecisiveObjection",
    'data-v3000-phase="50-decisive-objection"',
    "Objeção ou lacuna decisiva",
    "Pergunta objetiva",
  ]) {
    assert(pipeline.includes(marker), `Marcador visual ausente: ${marker}`);
  }

  for (const marker of [
    "freeTextNotesAreEvidence: false",
    "EXPLICIT_OBJECTION_KEYS",
    "projectCompatibility",
    'signal.kind === "silence"',
    '"qualification_gap"',
    "maxVisible: 1",
  ]) {
    assert(helper.includes(marker), `Regra factual ausente: ${marker}`);
  }

  for (const marker of [
    "V3000 Fase 050",
    ".atlas-kanban-decisive-objection",
    ".atlas-kanban-decisive-objection-question",
    '[data-tone="danger"]',
  ]) {
    assert(css.includes(marker), `Estilo decisivo ausente: ${marker}`);
  }

  assert(
    /Notas livres[\s\S]+não são evidência de\s+objeção/i.test(documentation),
    "A documentação precisa proibir inferência por notas livres.",
  );
  assert(
    /exibe no máximo um bloqueio[\s\S]+objeção ativa registrada/i.test(
      documentation,
    ),
    "A documentação precisa registrar a seleção de um único bloqueio.",
  );
  assert(
    /### Fase 50[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 50.",
  );

  return {
    phase: 50,
    status: registry.status,
    checks: 12,
    allowedKinds: registry.scope.allowedKinds,
    maxVisible: registry.scope.maxVisible,
    registeredFactsOnly: true,
    freeTextNotesAreEvidence: false,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadDecisiveObjectionRegistry(root, registryPath);
  const summary = validateDecisiveObjection({ root, registry });
  process.stdout.write(
    `V3000 phase 50 decisive objection: ${summary.checks}/${summary.checks} checks passed.\n`,
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 50 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

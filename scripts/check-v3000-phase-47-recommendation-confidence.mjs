import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-47-recommendation-confidence.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadRecommendationConfidenceRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateRecommendationConfidence({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 47, "O contrato precisa representar a Fase 47.");
  assert(
    registry.status === "recommendation-confidence-adopted",
    "A Fase 47 precisa estar recommendation-confidence-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 46 &&
      registry.previousPhase?.status === "project-compatibility-adopted",
    "A Fase 47 precisa preservar a compatibilidade comprovada da Fase 46.",
  );
  assert(
    registry.scope?.separatesScorePriorityAndConfidence === true,
    "Score, prioridade e confiança precisam permanecer separados.",
  );
  assert(
    registry.scope?.qualitativeEvidenceOnly === true,
    "A confiança precisa permanecer qualitativa.",
  );
  assert(
    registry.scope?.aiConfidenceMeasured === false,
    "A Fase 47 não possui amostra para afirmar confiança da IA.",
  );
  assert(
    registry.scope?.salesProbabilityDisplayed === false,
    "A Fase 47 não pode apresentar porcentagem como chance de venda.",
  );
  assert(
    registry.scope?.evaluatedAtVisible === true,
    "O momento da avaliação precisa permanecer visível.",
  );
  assert(
    registry.scope?.readOnly === true,
    "A leitura precisa ser somente leitura.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const helper = readText(root, "lib/atlas/recommendation-confidence.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_47_RECOMMENDATION_CONFIDENCE.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildRecommendationEvidence",
    'data-v3000-phase="47-recommendation-confidence"',
    "Por que está na fila?",
    "Score cadastrado",
    "Prioridade operacional",
    "Confiança da recomendação",
    "Confiança IA",
    "Base considerada até",
    "peso do forecast",
  ]) {
    assert(
      pipeline
        .toLocaleLowerCase("pt-BR")
        .includes(marker.toLocaleLowerCase("pt-BR")),
      `Marcador visual ausente: ${marker}`,
    );
  }

  const explanationStart = pipeline.indexOf(
    'data-v3000-phase="47-recommendation-confidence"',
  );
  const explanationEnd = pipeline.indexOf(
    'className="atlas-kanban-v30-card-context"',
    explanationStart,
  );
  assert(
    explanationStart >= 0 && explanationEnd > explanationStart,
    "O bloco progressivo de explicação está ausente.",
  );
  const explanationBlock = pipeline.slice(explanationStart, explanationEnd);
  assert(
    !/chance de venda|probabilidade de venda|\d+\s*%\s*(?:de\s+)?chance/i.test(
      explanationBlock,
    ),
    "A explicação não pode declarar probabilidade de venda sem método comprovado.",
  );

  for (const marker of [
    'label: "Não aferida"',
    'status: "not-measured"',
    'disclaimer: "Não representa probabilidade de venda."',
    "salesProbabilityClaimAllowed: false",
    'methodLabel: "Regras operacionais explicáveis"',
    'originLabel: "Dados registrados no CRM"',
    'evidenceCount >= 7 ? "high"',
    'evidenceCount >= 4 ? "medium"',
  ]) {
    assert(helper.includes(marker), `Regra de evidência ausente: ${marker}`);
  }

  for (const marker of [
    ".atlas-kanban-recommendation-explanation",
    '[data-evidence-level="medium"]',
    '[data-evidence-level="high"]',
    ".atlas-kanban-recommendation-provenance",
  ]) {
    assert(css.includes(marker), `Estilo de confiança ausente: ${marker}`);
  }

  assert(
    /score cadastrado[\s\S]+prioridade operacional[\s\S]+confiança da IA/i.test(
      documentation,
    ),
    "A documentação precisa separar score, prioridade e confiança da IA.",
  );
  assert(
    /não representa probabilidade de venda|nenhuma porcentagem/i.test(
      documentation,
    ),
    "A documentação precisa registrar o limite de probabilidade.",
  );
  assert(
    /### Fase 47[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 47.",
  );

  return {
    phase: 47,
    status: registry.status,
    checks: 12,
    scorePriorityConfidenceSeparated: true,
    qualitativeEvidenceOnly: true,
    aiConfidenceMeasured: false,
    salesProbabilityDisplayed: false,
    evaluatedAtVisible: true,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadRecommendationConfidenceRegistry(root, registryPath);
  const summary = validateRecommendationConfidence({ root, registry });
  process.stdout.write(
    `V3000 phase 47 recommendation confidence: ${summary.checks}/${summary.checks} checks passed.\n`,
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
      `Fase 47 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-48-behavioral-signals.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadBehavioralSignalsRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateBehavioralSignals({ root = process.cwd(), registry }) {
  assert(registry.phase === 48, "O contrato precisa representar a Fase 48.");
  assert(
    registry.status === "behavioral-signals-adopted",
    "A Fase 48 precisa estar behavioral-signals-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 47 &&
      registry.previousPhase?.status === "recommendation-confidence-adopted",
    "A Fase 48 precisa preservar a explicação comprovada da Fase 47.",
  );
  assert(
    registry.scope?.maxSignals === 3,
    "O card precisa permanecer limitado a três sinais.",
  );
  assert(
    registry.scope?.registeredFactsOnly === true,
    "Sinais precisam vir somente de fatos registrados.",
  );
  assert(
    registry.scope?.timelineInCard === false,
    "O card não pode se transformar em timeline.",
  );
  assert(
    registry.scope?.fullHistoryRoute === "/leads/[id]",
    "O histórico completo precisa permanecer no Lead 360.",
  );
  assert(
    registry.scope?.progressiveDisclosure === true &&
      registry.scope?.readOnly === true,
    "A leitura precisa ser progressiva e somente leitura.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const helper = readText(root, "lib/atlas/behavioral-signals.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_48_BEHAVIORAL_SIGNALS.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildBehavioralSignals",
    'data-v3000-phase="48-behavioral-signals"',
    "Sinais que mudam a decisão",
    "behavioralSignals.length}/3",
    "Ver histórico completo no Lead 360",
  ]) {
    assert(pipeline.includes(marker), `Marcador visual ausente: ${marker}`);
  }

  for (const marker of [
    "const MAX_SIGNALS = 3 as const",
    "const SILENCE_THRESHOLD_HOURS = 72 as const",
    'continuity.responseState === "customer_replied"',
    'continuity?.responseState !== "customer_replied"',
    'label: "Etapa de visita"',
    "conclusão não presumida",
    ".slice(0, MAX_SIGNALS)",
    'source: "registered-crm-facts-only"',
    "timelineInCard: false",
  ]) {
    assert(helper.includes(marker), `Regra factual ausente: ${marker}`);
  }

  for (const marker of [
    "V3000 Fase 048",
    ".atlas-kanban-behavioral-signals",
    ".atlas-kanban-behavioral-signals-body",
    '[data-tone="danger"]',
  ]) {
    assert(css.includes(marker), `Estilo comportamental ausente: ${marker}`);
  }

  assert(
    /no máximo três sinais|até três sinais/i.test(documentation),
    "A documentação precisa registrar o limite de três sinais.",
  );
  assert(
    /nenhum sinal é criado[\s\S]+suposição da IA/i.test(documentation),
    "A documentação precisa proibir inferência sem fato registrado.",
  );
  assert(
    /histórico completo continua no Lead 360|histórico integral continua no Lead 360/i.test(
      documentation,
    ),
    "A documentação precisa manter o histórico no Lead 360.",
  );
  assert(
    /### Fase 48[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 48.",
  );

  return {
    phase: 48,
    status: registry.status,
    checks: 12,
    maxSignals: registry.scope.maxSignals,
    registeredFactsOnly: true,
    timelineInCard: false,
    fullHistoryRoute: registry.scope.fullHistoryRoute,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadBehavioralSignalsRegistry(root, registryPath);
  const summary = validateBehavioralSignals({ root, registry });
  process.stdout.write(
    `V3000 phase 48 behavioral signals: ${summary.checks}/${summary.checks} checks passed.\n`,
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 48 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

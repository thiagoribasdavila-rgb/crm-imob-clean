import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-55-decision-performance.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadDecisionPerformanceRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateDecisionPerformance({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 55, "O contrato precisa representar a Fase 55.");
  assert(
    registry.status === "decision-performance-adopted",
    "A Fase 55 precisa estar decision-performance-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 54 &&
      registry.previousPhase?.status === "motion-focus-accessibility-adopted",
    "A Fase 55 precisa preservar o contrato acessível da Fase 54.",
  );
  assert(
    registry.budgets?.interactionFeedbackMs === 100 &&
      registry.budgets?.telemetryPayloadBytes === 1024 &&
      registry.budgets?.operationalLeadLimit === 500,
    "Os três orçamentos de performance precisam estar definidos.",
  );

  const fixture = registry.comparisonFixture;
  assert(
    fixture?.previousComparisons === fixture?.leadCount * fixture?.stageCount &&
      fixture?.optimizedOperations ===
        fixture?.leadCount + fixture?.stageCount &&
      fixture?.reductionPercent === 85.51,
    "A comparação controlada precisa demonstrar a redução de 85,51%.",
  );
  assert(
    registry.decisionEvents?.length === 4 &&
      registry.decisionEvents.every((event) =>
        event.startsWith("atlas.pipeline_"),
      ),
    "Os quatro momentos do percurso decisório precisam estar declarados.",
  );
  assert(
    registry.privacy?.personalContent === false &&
      registry.privacy?.leadIdentity === false &&
      registry.privacy?.contactData === false &&
      registry.privacy?.conversationContent === false,
    "A telemetria não pode coletar identidade, contato ou conversa.",
  );
  assert(
    registry.constraints?.databaseMigration === false &&
      registry.constraints?.businessMutation === false &&
      registry.constraints?.aiCall === false &&
      registry.constraints?.visibilityExpansion === false &&
      registry.constraints?.syntheticBusinessData === false,
    "A fase não pode migrar banco, mudar regra, chamar IA ou inventar dados.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const helper = readText(root, "lib/atlas/decision-performance.ts");
  const endpoint = readText(root, "app/api/v3/events/ingest/route.ts");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_55_DECISION_PERFORMANCE.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "groupRecordsByStage(visibleLeads)",
    "const leadById = useMemo",
    "const stageByKey = useMemo",
    "const stageIndexByKey = useMemo",
    'emitDecisionPerformance("priorityIdentified"',
    'emitDecisionPerformance("opportunityOpened"',
    'emitDecisionPerformance("actionStarted"',
    'emitDecisionPerformance("resultRegistered"',
    'authenticatedFetch("/api/v3/events/ingest"',
    "keepalive: true",
    "Telemetria nunca bloqueia a operação comercial",
  ]) {
    assert(
      pipeline.includes(marker),
      `Contrato operacional ausente: ${marker}`,
    );
  }
  assert(
    !pipeline.includes("stages.findIndex("),
    "O Pipeline ainda possui busca linear repetida de etapa.",
  );

  for (const marker of [
    'version: "v3000-phase-55"',
    "telemetryPayloadBytes: 1024",
    "ALLOWED_PAYLOAD_KEYS",
    "sanitizeDecisionPerformancePayload",
    "buildDecisionPerformanceEvent",
    "decisionGroupingComplexity",
    "previousComparisons",
    "optimizedOperations",
  ]) {
    assert(
      helper.includes(marker),
      `Contrato de performance ausente: ${marker}`,
    );
  }
  assert(
    endpoint.includes("requireApiIdentity") &&
      endpoint.includes('from("atlas_events")'),
    "A telemetria precisa reutilizar o endpoint autenticado e atlas_events.",
  );
  assert(
    /O\(leads × etapas\)[\s\S]+O\(leads \+ etapas\)[\s\S]+85,51%/.test(
      documentation,
    ),
    "A documentação precisa apresentar a comparação mensurável.",
  );
  assert(
    /nome, telefone, e-mail, mensagem[\s\S]+descartados/i.test(documentation),
    "A documentação precisa registrar a minimização de dados pessoais.",
  );
  assert(
    /### Fase 55[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 55.",
  );

  return {
    phase: 55,
    status: registry.status,
    checks: 16,
    previousComparisons: fixture.previousComparisons,
    optimizedOperations: fixture.optimizedOperations,
    reductionPercent: fixture.reductionPercent,
    decisionEvents: registry.decisionEvents.length,
    telemetryPayloadBytes: registry.budgets.telemetryPayloadBytes,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadDecisionPerformanceRegistry(root, registryPath);
  const summary = validateDecisionPerformance({ root, registry });
  process.stdout.write(
    `V3000 phase 55 decision performance: ${summary.checks}/${summary.checks} checks passed.\n`,
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
      `Fase 55 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

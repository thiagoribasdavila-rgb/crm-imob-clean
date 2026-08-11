import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-52-command-center-exceptions.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

function countOccurrences(source, marker) {
  return source.split(marker).length - 1;
}

export function loadCommandCenterExceptionsRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateCommandCenterExceptions({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 52, "O contrato precisa representar a Fase 52.");
  assert(
    registry.status === "command-center-exceptions-adopted",
    "A Fase 52 precisa estar command-center-exceptions-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 51 &&
      registry.previousPhase?.status === "role-oriented-cards-adopted",
    "A Fase 52 precisa preservar o rastro factual da Fase 51.",
  );
  assert(
    registry.composition?.primaryDecisions === 1 &&
      registry.composition?.exceptionQueueLimit === 3 &&
      registry.composition?.supportIndicatorLimit === 3 &&
      registry.composition?.maxClicksToOpportunity === 2 &&
      registry.composition?.deduplicateBy === "normalized-title-and-href",
    "A composição precisa limitar a leitura a uma decisão, três exceções e três sinais em até dois cliques.",
  );
  assert(
    registry.sources?.primary === "existing-command-decision" &&
      registry.sources?.exceptions?.includes("authenticated-role-priorities") &&
      registry.sources?.exceptions?.includes("module-health") &&
      registry.sources?.support?.includes("authenticated-scope-aggregates"),
    "A fase precisa reutilizar decisão, prioridades e agregados autenticados existentes.",
  );
  assert(
    registry.constraints?.databaseMigration === false &&
      registry.constraints?.businessMutation === false &&
      registry.constraints?.aiCall === false &&
      registry.constraints?.visibilityExpansion === false &&
      registry.constraints?.syntheticData === false,
    "A fase não pode migrar banco, mutar negócio, chamar IA, ampliar visibilidade ou inventar dados.",
  );

  const dashboard = readText(root, "app/(crm)/dashboard/page.tsx");
  const helper = readText(root, "lib/atlas/command-center-exceptions.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_52_COMMAND_CENTER_EXCEPTIONS.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildCommandCenterExceptionQueue",
    "commandExceptionQueue",
    'data-v3000-phase="52-command-center-exceptions"',
    "atlas-command-exception-queue",
    "atlas-command-support-grid",
  ]) {
    assert(dashboard.includes(marker), `Marcador visual ausente: ${marker}`);
  }
  assert(
    countOccurrences(dashboard, "<strong>{commandDecision.title}</strong>") ===
      1 && countOccurrences(dashboard, "<p>{commandDecision.detail}</p>") === 1,
    "A decisão principal precisa aparecer uma única vez na interface.",
  );
  assert(
    !dashboard.includes("<DecisionContractStrip") &&
      !dashboard.includes("atlas-command-decision-layer") &&
      !dashboard.includes("v30Cockpit.cards.map") &&
      !dashboard.includes('className="atlas-command-pulse-grid"'),
    "Blocos antigos não podem repetir a decisão ou os mesmos totais.",
  );

  for (const marker of [
    "primaryDecisionCount: 1",
    "exceptionQueueLimit: 3",
    "supportIndicatorLimit: 3",
    "maxClicksToOpportunity: 2",
    'deduplicateBy: "normalized-title-and-href"',
    "key === primaryKey || seen.has(key)",
  ]) {
    assert(helper.includes(marker), `Regra de composição ausente: ${marker}`);
  }

  for (const marker of [
    "V3000 Fase 052",
    ".atlas-command-exception-queue",
    ".atlas-command-exception-item",
    ".atlas-command-support-grid",
  ]) {
    assert(css.includes(marker), `Estilo por exceção ausente: ${marker}`);
  }

  assert(
    /uma decisão principal[\s\S]+até três exceções[\s\S]+três indicadores/i.test(
      documentation,
    ),
    "A documentação precisa registrar a hierarquia curta da decisão.",
  );
  assert(
    /APIs autenticadas[\s\S]+RLS do Supabase/i.test(documentation) &&
      /dois cliques/i.test(documentation),
    "A documentação precisa registrar segurança autenticada e o caminho de até dois cliques.",
  );
  assert(
    /### Fase 52[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 52.",
  );

  return {
    phase: 52,
    status: registry.status,
    checks: 13,
    primaryDecisions: registry.composition.primaryDecisions,
    exceptionQueueLimit: registry.composition.exceptionQueueLimit,
    supportIndicatorLimit: registry.composition.supportIndicatorLimit,
    maxClicksToOpportunity: registry.composition.maxClicksToOpportunity,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadCommandCenterExceptionsRegistry(root, registryPath);
  const summary = validateCommandCenterExceptions({ root, registry });
  process.stdout.write(
    `V3000 phase 52 command center exceptions: ${summary.checks}/${summary.checks} checks passed.\n`,
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
      `Fase 52 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

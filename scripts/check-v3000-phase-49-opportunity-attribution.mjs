import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-49-opportunity-attribution.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadOpportunityAttributionRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateOpportunityAttribution({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 49, "O contrato precisa representar a Fase 49.");
  assert(
    registry.status === "opportunity-attribution-adopted",
    "A Fase 49 precisa estar opportunity-attribution-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 48 &&
      registry.previousPhase?.status === "behavioral-signals-adopted",
    "A Fase 49 precisa preservar os sinais factuais da Fase 48.",
  );
  assert(
    JSON.stringify(registry.scope?.path) ===
      JSON.stringify(["campaign", "lead", "broker", "stage"]),
    "O rastro precisa seguir campanha, lead, corretor e etapa.",
  );
  assert(
    JSON.stringify(registry.scope?.contexts) ===
      JSON.stringify(["source", "project", "developer"]),
    "Origem, projeto e incorporadora precisam permanecer explícitos.",
  );
  assert(
    registry.scope?.registeredFactsOnly === true &&
      registry.scope?.perOpportunity === true &&
      registry.scope?.progressiveDisclosure === true,
    "A atribuição precisa ser factual, individual e progressiva.",
  );
  assert(
    registry.financialGuard?.requiresCompleteAttribution === true &&
      registry.financialGuard?.requiresValidPeriod === true &&
      registry.financialGuard?.requiresExplicitNonNegativeValues === true,
    "Valores financeiros precisam permanecer protegidos pelo rastro e período.",
  );
  assert(
    registry.constraints?.databaseMigration === false &&
      registry.constraints?.businessMutation === false &&
      registry.constraints?.aiCall === false &&
      registry.constraints?.aggregation === false,
    "A Fase 49 não pode alterar banco, negócio, IA ou agregações.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const helper = readText(root, "lib/atlas/opportunity-attribution.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_49_OPPORTUNITY_ATTRIBUTION.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildOpportunityAttribution",
    'data-v3000-phase="49-opportunity-attribution"',
    "Rastro da oportunidade",
    "Campanha até etapa comercial",
    "Custos e receita permanecem ocultos",
  ]) {
    assert(pipeline.includes(marker), `Marcador visual ausente: ${marker}`);
  }

  for (const marker of [
    "developerConflict",
    'status === "complete"',
    "validPeriod",
    "attributedCost !== null",
    "attributedRevenue !== null",
    'aggregation: "none-per-opportunity"',
    "registeredFactsOnly: true",
  ]) {
    assert(helper.includes(marker), `Regra factual ausente: ${marker}`);
  }

  for (const marker of [
    "V3000 Fase 049",
    ".atlas-kanban-opportunity-attribution",
    ".atlas-kanban-opportunity-attribution-body",
    '[data-status="conflict"]',
  ]) {
    assert(css.includes(marker), `Estilo de atribuição ausente: ${marker}`);
  }

  assert(
    /nenhum vínculo é criado[\s\S]+sugestão da\s+IA/i.test(documentation),
    "A documentação precisa proibir atribuição inferida.",
  );
  assert(
    /não soma leads, custos ou[\s\S]+não cria uma segunda contagem/i.test(
      documentation,
    ),
    "A documentação precisa proibir contagem duplicada.",
  );
  assert(
    /### Fase 49[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 49.",
  );

  return {
    phase: 49,
    status: registry.status,
    checks: 12,
    path: registry.scope.path,
    registeredFactsOnly: true,
    perOpportunity: true,
    financialVisibility:
      "valid-period-and-complete-attribution-only",
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadOpportunityAttributionRegistry(root, registryPath);
  const summary = validateOpportunityAttribution({ root, registry });
  process.stdout.write(
    `V3000 phase 49 opportunity attribution: ${summary.checks}/${summary.checks} checks passed.\n`,
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 49 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

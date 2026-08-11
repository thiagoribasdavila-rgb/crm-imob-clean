import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-46-project-compatibility.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadProjectCompatibilityRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateProjectCompatibility({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 46, "O contrato precisa representar a Fase 46.");
  assert(
    registry.status === "project-compatibility-adopted",
    "A Fase 46 precisa estar project-compatibility-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 45 &&
      registry.previousPhase?.status === "conversation-continuity-adopted",
    "A Fase 46 precisa preservar a continuidade comprovada da Fase 45.",
  );
  assert(registry.scope?.evidenceOnly === true, "A leitura precisa ser factual.");
  assert(registry.scope?.tenantScoped === true, "A leitura precisa respeitar o tenant.");
  assert(registry.scope?.readOnly === true, "A leitura não pode alterar o negócio.");
  assert(
    registry.scope?.missingDataBecomesQuestion === true,
    "Dado ausente precisa virar pergunta de qualificação.",
  );
  assert(
    registry.scope?.aiProbabilityDisplayed === false,
    "A Fase 46 não pode inventar probabilidade de compatibilidade.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const api = readText(root, "app/api/v1/pipeline/route.ts");
  const helper = readText(root, "lib/atlas/project-compatibility.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_46_PROJECT_COMPATIBILITY.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "type ProjectCompatibility =",
    "project_compatibility?:",
    'data-v3000-phase="46-project-compatibility"',
    "Cliente × projeto",
    "Pergunta que destrava",
  ]) {
    assert(pipeline.includes(marker), `Marcador visual ausente: ${marker}`);
  }

  const compatibilityBlock =
    pipeline.match(
      /data-v3000-phase="46-project-compatibility"([\s\S]*?)data-v3000-phase="44-single-primary-action"/,
    )?.[1] ?? "";
  assert(compatibilityBlock, "O bloco progressivo de compatibilidade está ausente.");
  assert(
    !/probabilidade|chance de venda|%/i.test(compatibilityBlock),
    "O card não pode apresentar probabilidade ou percentual sem método comprovado.",
  );

  for (const marker of [
    "readProjectCompatibility",
    '.from("developments")',
    '.from("crm_projects")',
    '.from("lead_qualification_profiles")',
    "buildProjectCompatibility",
    "project_compatibility:",
    "missingDataIsNotLowCompatibility: true",
    "aiCost: false",
    '.eq("organization_id", identity.organizationId)',
  ]) {
    assert(api.includes(marker), `Marcador da API ausente: ${marker}`);
  }

  for (const marker of [
    "rangesOverlap(",
    'status: missing.length ? "needs_qualification" : "evidence_available"',
    "evaluated_without_ai: true",
    "Qual faixa de investimento fica confortável",
    "O imóvel é para morar ou investir?",
  ]) {
    assert(helper.includes(marker), `Regra factual ausente: ${marker}`);
  }

  for (const marker of [
    ".atlas-kanban-project-compatibility",
    '[data-state="aligned"]',
    '[data-state="attention"]',
    ".atlas-kanban-project-compatibility-question",
  ]) {
    assert(css.includes(marker), `Estilo de compatibilidade ausente: ${marker}`);
  }

  assert(
    /sem score|sem percentual|probabilidade/i.test(documentation) &&
      /dado ausente/i.test(documentation),
    "A documentação precisa registrar explicabilidade e tratamento de ausências.",
  );
  assert(
    /### Fase 46[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 46.",
  );

  return {
    phase: 46,
    status: registry.status,
    checks: 9,
    evidenceOnly: true,
    tenantScoped: true,
    missingDataBecomesQuestion: true,
    aiProbabilityDisplayed: false,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadProjectCompatibilityRegistry(root, registryPath);
  const summary = validateProjectCompatibility({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 46 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

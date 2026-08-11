import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-51-role-oriented-cards.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadRoleOrientedCardsRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateRoleOrientedCards({ root = process.cwd(), registry }) {
  assert(registry.phase === 51, "O contrato precisa representar a Fase 51.");
  assert(
    registry.status === "role-oriented-cards-adopted",
    "A Fase 51 precisa estar role-oriented-cards-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 50 &&
      registry.previousPhase?.status === "decisive-objection-adopted",
    "A Fase 51 precisa preservar o rastro factual da Fase 50.",
  );
  assert(
    registry.identity?.roleSource === "authenticated-profile" &&
      registry.identity?.visibilitySource === "authenticated-api-and-rls" &&
      registry.identity?.manualLensChangesVisibility === false,
    "Papel e visibilidade precisam permanecer autenticados e a lente manual não pode ampliar acesso.",
  );
  assert(
    registry.readings?.broker?.mode === "execution" &&
      registry.readings?.broker?.scope === "own-portfolio" &&
      registry.readings?.broker?.ownerDisclosure === false,
    "O corretor precisa receber execução da própria carteira sem exposição de responsável.",
  );
  assert(
    registry.readings?.manager?.mode === "intervention" &&
      registry.readings?.manager?.scope === "own-structure" &&
      registry.readings?.manager?.ownerDisclosure === true,
    "O gerente precisa receber intervenção limitada à própria estrutura.",
  );
  assert(
    registry.readings?.director?.mode === "impact" &&
      registry.readings?.director?.scope === "organization" &&
      registry.readings?.director?.aggregatesAndProvenExceptionsOnly === true,
    "A direção precisa receber impacto, agregados e exceções comprovadas.",
  );
  assert(
    registry.constraints?.databaseMigration === false &&
      registry.constraints?.businessMutation === false &&
      registry.constraints?.aiCall === false &&
      registry.constraints?.clientSideVisibilityExpansion === false,
    "A fase não pode migrar banco, mutar negócio, chamar IA ou expandir visibilidade no cliente.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const api = readText(root, "app/api/v1/pipeline/route.ts");
  const repository = readText(
    root,
    "lib/atlas/core-v2/live-repositories.ts",
  );
  const helper = readText(root, "lib/atlas/role-oriented-card.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_51_ROLE_ORIENTED_CARDS.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "buildRoleOrientedCard",
    "role: identityLens",
    'data-role-visibility="authenticated-api-and-rls"',
    'data-v3000-phase="51-role-oriented-card"',
  ]) {
    assert(pipeline.includes(marker), `Marcador visual ausente: ${marker}`);
  }

  for (const marker of [
    'roleSource: "authenticated-profile"',
    'visibilitySource: "authenticated-api-and-rls"',
    "manuallySelectedLensChangesVisibility: false",
    'input.role === "broker"',
    'input.role === "manager"',
    'mode: "impact"',
  ]) {
    assert(helper.includes(marker), `Regra de papel ausente: ${marker}`);
  }

  for (const marker of [
    "requireApiIdentity(request)",
    "readCompatiblePipeline(identity.supabase",
    "organizationId: identity.organizationId",
  ]) {
    assert(api.includes(marker), `Proteção autenticada ausente: ${marker}`);
  }
  assert(
    repository.includes('.eq("organization_id", organizationId)'),
    "O repositório precisa limitar a consulta à organização autenticada.",
  );

  for (const marker of [
    "V3000 Fase 051",
    ".atlas-kanban-role-orientation",
    '[data-mode="execution"]',
    '[data-mode="intervention"]',
    '[data-mode="impact"]',
  ]) {
    assert(css.includes(marker), `Estilo orientado por papel ausente: ${marker}`);
  }

  assert(
    /lente manual[\s\S]+não altera visibilidade/i.test(documentation),
    "A documentação precisa impedir que a lente manual amplie visibilidade.",
  );
  assert(
    /visibilidade[\s\S]+servidor[\s\S]+RLS do Supabase/i.test(documentation),
    "A documentação precisa registrar a aplicação de API autenticada e RLS.",
  );
  assert(
    /### Fase 51[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 51.",
  );

  return {
    phase: 51,
    status: registry.status,
    checks: 13,
    roleSource: registry.identity.roleSource,
    visibilitySource: registry.identity.visibilitySource,
    manualLensChangesVisibility: false,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadRoleOrientedCardsRegistry(root, registryPath);
  const summary = validateRoleOrientedCards({ root, registry });
  process.stdout.write(
    `V3000 phase 51 role-oriented cards: ${summary.checks}/${summary.checks} checks passed.\n`,
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 51 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

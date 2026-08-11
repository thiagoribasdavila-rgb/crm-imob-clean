import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-56-commercial-homologation.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadCommercialHomologationRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateCommercialHomologation({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 56, "O contrato precisa representar a Fase 56.");
  assert(
    registry.status === "commercial-release-gate-enforced",
    "A Fase 56 precisa impor o gate de release comercial.",
  );
  assert(
    registry.previousPhase?.phase === 55 &&
      registry.previousPhase?.status === "decision-performance-adopted",
    "A Fase 56 precisa preservar a performance decisória da Fase 55.",
  );

  const expectedGateIds = [
    "contracts",
    "typecheck",
    "lint",
    "build",
    "smoke",
    "rbac",
    "tenant-isolation",
    "desktop",
    "mobile",
    "package-verification",
  ];
  assert(
    JSON.stringify(registry.automatedGates?.map((gate) => gate.id)) ===
      JSON.stringify(expectedGateIds),
    "Os dez gates automatizados precisam estar declarados em ordem estável.",
  );
  assert(
    JSON.stringify(registry.requiredHumanApprovals) ===
      JSON.stringify(["director", "manager", "broker"]),
    "Diretor, gerente e corretor precisam aprovar a release.",
  );
  assert(
    JSON.stringify(registry.releaseOutcomes) ===
      JSON.stringify(["passed", "pending-human", "blocked"]),
    "O gate precisa distinguir aprovação, pendência humana e bloqueio.",
  );
  assert(
    registry.acceptance?.openP0 === 0 &&
      registry.acceptance?.openP1 === 0 &&
      registry.acceptance?.criticalActionsPersist === true &&
      registry.acceptance?.metricsDoNotDuplicate === true &&
      registry.acceptance?.humanApprovalRequired === true,
    "O aceite precisa exigir zero P0/P1, persistência e não duplicação.",
  );
  assert(
    Object.values(registry.constraints ?? {}).every((value) => value === false),
    "A fase não pode migrar banco, inventar dados ou promover automaticamente.",
  );

  const helper = readText(root, "lib/atlas/commercial-release-gate.ts");
  const playwright = readText(root, "playwright.config.mjs");
  const journey = readText(root, "tests/e2e/authenticated-journeys.spec.mjs");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_56_COMMERCIAL_HOMOLOGATION.md",
  );
  const evidence = JSON.parse(
    readText(root, "docs/evidence/V3000_PHASE_56_RELEASE_GATE.json"),
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );
  const packageJson = JSON.parse(readText(root, "package.json"));

  for (const marker of [
    '"passed"',
    '"pending-human"',
    '"blocked"',
    "hasCriticalRegression",
    "failedGateIds.length > 0",
    "pendingGateIds.length > 0",
    "pendingRoles.length > 0",
    "releaseAllowed: true",
  ]) {
    assert(helper.includes(marker), `Decisão de release ausente: ${marker}`);
  }
  for (const marker of [
    'name: "desktop-chromium"',
    'devices["Desktop Chrome"]',
    'name: "mobile-chromium"',
    'devices["Pixel 7"]',
  ]) {
    assert(playwright.includes(marker), `Projeto visual ausente: ${marker}`);
  }
  for (const marker of [
    'label: "ADMIN"',
    'label: "DIRETOR"',
    'label: "GERENTE"',
    'label: "CORRETOR"',
    '"/dashboard"',
    '"/pipeline"',
    '"/developments"',
    'page.request.get("/api/v1/auth/me")',
  ]) {
    assert(journey.includes(marker), `Jornada autenticada ausente: ${marker}`);
  }
  assert(
    /Somente `passed` permite promover a release/.test(documentation) &&
      /não é convertida em aprovação/.test(documentation),
    "A documentação não pode tratar ausência de prova como aprovação.",
  );
  assert(
    evidence.phase === 56 &&
      evidence.status === "pending-human" &&
      evidence.releaseAllowed === false &&
      evidence.humanApprovals?.length === 3,
    "A evidência inicial precisa permanecer pendente e impedir promoção.",
  );
  assert(
    /### Fase 56[\s\S]+Status:\*\* gate implementado e validado tecnicamente em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra o gate técnico da Fase 56.",
  );
  assert(
    packageJson.scripts?.["check:v3000:phase56"] &&
      packageJson.scripts?.["test:v3000:phase56"],
    "Os comandos repetíveis da Fase 56 precisam estar no package.json.",
  );

  return {
    phase: 56,
    status: registry.status,
    checks: 18,
    automatedGates: registry.automatedGates.length,
    requiredHumanApprovals: registry.requiredHumanApprovals.length,
    releaseAllowed: evidence.releaseAllowed,
    currentOutcome: evidence.status,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadCommercialHomologationRegistry(root, registryPath);
  const summary = validateCommercialHomologation({ root, registry });
  process.stdout.write(
    `V3000 phase 56 commercial homologation: ${summary.checks}/${summary.checks} checks passed.\n`,
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
      `Fase 56 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-39-progressive-card-hierarchy.json";
const EXPECTED_READING_LAYERS = [
  "decision-in-3s",
  "context-on-demand",
  "history-in-lead-360",
];
const EXPECTED_SIGNAL_COMPOSITION = [
  "relevance",
  "urgency",
  "primary-evidence",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadProgressiveCardRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateProgressiveCardHierarchy({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 39, "O contrato precisa representar a Fase 39.");
  assert(
    registry.status === "hierarchy-adopted",
    "A Fase 39 precisa estar hierarchy-adopted.",
  );
  assert(
    registry.businessRuntimeMutationAllowed === false,
    "A Fase 39 não autoriza mudança de regra operacional.",
  );
  assert(
    registry.presentationContractMutationAllowed === true,
    "A Fase 39 precisa autorizar a hierarquia de apresentação.",
  );
  assert(
    registry.databaseMutationAllowed === false,
    "A Fase 39 não autoriza alteração de banco.",
  );

  readText(root, registry.previousPhaseRegistry);

  assert(
    JSON.stringify(registry.readingLayers) ===
      JSON.stringify(EXPECTED_READING_LAYERS),
    "As três camadas de leitura progressiva precisam permanecer completas e na ordem canônica.",
  );

  const quickDecision = registry.quickDecision;
  assert(
    quickDecision?.maximumMainMessages === 1,
    "A leitura imediata permite somente uma mensagem principal.",
  );
  assert(
    quickDecision.maximumSignals === 3,
    "A leitura imediata permite no máximo três sinais.",
  );
  assert(
    quickDecision.maximumPrimaryActions === 1,
    "A leitura imediata permite somente uma ação primária.",
  );
  assert(
    JSON.stringify(quickDecision.signalComposition) ===
      JSON.stringify(EXPECTED_SIGNAL_COMPOSITION),
    "A composição rápida precisa ser relevância, urgência e evidência principal.",
  );
  assert(
    quickDecision.detailsMovedBehindDisclosure?.length === 4,
    "Os quatro grupos de contexto precisam ficar sob demanda.",
  );

  const primitive = registry.canonicalPrimitive;
  assert(primitive?.file, "Primitiva canônica ausente.");
  const primitiveSource = readText(root, primitive.file);

  for (const exportedName of primitive.requiredExports ?? []) {
    assert(
      primitiveSource.includes(exportedName),
      `Exportação progressiva ausente: ${exportedName}`,
    );
  }
  for (const marker of primitive.requiredMarkers ?? []) {
    assert(
      primitiveSource.includes(marker),
      `Marcador progressivo ausente em ${primitive.file}: ${marker}`,
    );
  }
  for (const forbiddenToken of primitive.forbiddenTokens ?? []) {
    assert(
      !primitiveSource.includes(forbiddenToken),
      `A primitiva deixou de ser server-safe: ${forbiddenToken}`,
    );
  }

  assert(
    primitiveSource.includes(
      "Math.min(3, evidence.length + 2)",
    ),
    "O limite visual de três sinais deixou de ser explícito.",
  );

  const primaryActionIndex = primitiveSource.indexOf(
    'data-decision-layer="primary-action"',
  );
  const disclosureIndex = primitiveSource.indexOf("<details");
  assert(
    primaryActionIndex >= 0 &&
      disclosureIndex >= 0 &&
      primaryActionIndex < disclosureIndex,
    "A ação primária precisa aparecer antes da expansão de contexto.",
  );

  for (const deferredMarker of [
    "identity.description",
    "additionalEvidence.length",
    'data-decision-layer="explanation"',
    'data-decision-layer="updated-at"',
  ]) {
    assert(
      primitiveSource.indexOf(deferredMarker) > disclosureIndex,
      `Detalhe não está sob demanda: ${deferredMarker}`,
    );
  }

  assert(
    registry.adoptionSurfaces?.length === 3,
    "A Fase 39 precisa adotar exatamente as três superfícies prioritárias.",
  );
  const routeSet = new Set();
  for (const surface of registry.adoptionSurfaces) {
    assert(!routeSet.has(surface.route), `Rota duplicada: ${surface.route}`);
    routeSet.add(surface.route);
    const source = readText(root, surface.source);
    for (const marker of surface.requiredMarkers ?? []) {
      assert(
        source.includes(marker),
        `Adoção progressiva ausente em ${surface.source}: ${marker}`,
      );
    }
  }

  assert(
    registry.acceptanceCriteria?.length >= 8,
    "Critérios de aceite insuficientes.",
  );

  return {
    phase: registry.phase,
    ok: true,
    layers: registry.readingLayers.length,
    surfaces: registry.adoptionSurfaces.length,
    maximumSignals: quickDecision.maximumSignals,
    nativeDisclosure: true,
    serverSafe: true,
    businessRuntimeMutationAllowed:
      registry.businessRuntimeMutationAllowed,
    databaseMutationAllowed: registry.databaseMutationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadProgressiveCardRegistry(root, registryPath);
  const summary = validateProgressiveCardHierarchy({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 39 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

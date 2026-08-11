import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-38-decision-card-contract.json";
const EXPECTED_LAYERS = [
  "identity",
  "evidence",
  "relevance",
  "urgency",
  "primary-action",
  "explanation",
  "updated-at",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadDecisionCardRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateDecisionCardContract({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 38, "O contrato precisa representar a Fase 38.");
  assert(
    registry.status === "contract-adopted",
    "A Fase 38 precisa estar contract-adopted.",
  );
  assert(
    registry.businessRuntimeMutationAllowed === false,
    "A Fase 38 não autoriza mudança de regra operacional.",
  );
  assert(
    registry.presentationContractMutationAllowed === true,
    "A Fase 38 precisa autorizar o contrato de apresentação.",
  );
  assert(
    registry.databaseMutationAllowed === false,
    "A Fase 38 não autoriza alteração de banco.",
  );

  assert(
    JSON.stringify(registry.layers) === JSON.stringify(EXPECTED_LAYERS),
    "As sete camadas do card de decisão precisam permanecer completas e na ordem canônica.",
  );

  readText(root, registry.previousPhaseRegistry);

  const primitive = registry.canonicalPrimitive;
  assert(primitive?.file, "Primitiva canônica ausente.");
  const primitiveSource = readText(root, primitive.file);

  for (const exportedName of primitive.requiredExports ?? []) {
    assert(
      primitiveSource.includes(exportedName),
      `Exportação canônica ausente: ${exportedName}`,
    );
  }
  for (const marker of primitive.requiredMarkers ?? []) {
    assert(
      primitiveSource.includes(marker),
      `Marcador canônico ausente em ${primitive.file}: ${marker}`,
    );
  }
  for (const layer of EXPECTED_LAYERS) {
    assert(
      primitiveSource.includes(`data-decision-layer=\"${layer}\"`),
      `Camada sem representação na primitiva: ${layer}`,
    );
  }
  for (const forbiddenToken of primitive.forbiddenTokens ?? []) {
    assert(
      !primitiveSource.includes(forbiddenToken),
      `A primitiva deixou de ser server-safe: ${forbiddenToken}`,
    );
  }

  assert(
    registry.adoptionSurfaces?.length === 3,
    "A Fase 38 precisa adotar exatamente as três superfícies prioritárias.",
  );
  const routeSet = new Set();
  for (const surface of registry.adoptionSurfaces) {
    assert(!routeSet.has(surface.route), `Rota duplicada: ${surface.route}`);
    routeSet.add(surface.route);
    const source = readText(root, surface.source);
    for (const marker of surface.requiredMarkers ?? []) {
      assert(
        source.includes(marker),
        `Adoção ausente em ${surface.source}: ${marker}`,
      );
    }
  }

  assert(
    registry.acceptanceCriteria?.length >= 7,
    "Critérios de aceite insuficientes.",
  );

  return {
    phase: registry.phase,
    ok: true,
    layers: registry.layers.length,
    surfaces: registry.adoptionSurfaces.length,
    serverSafe: true,
    businessRuntimeMutationAllowed:
      registry.businessRuntimeMutationAllowed,
    databaseMutationAllowed: registry.databaseMutationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadDecisionCardRegistry(root, registryPath);
  const summary = validateDecisionCardContract({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 38 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-41-reliable-states.json";
const EXPECTED_STATES = [
  "loading",
  "empty",
  "partial",
  "stale",
  "recoverable-error",
  "permission-blocked",
  "success",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadReliableStatesRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateReliableStates({ root = process.cwd(), registry }) {
  assert(registry.phase === 41, "O contrato precisa representar a Fase 41.");
  assert(
    registry.status === "reliable-states-adopted",
    "A Fase 41 precisa estar reliable-states-adopted.",
  );
  readText(root, registry.previousPhaseRegistry);

  for (const [flag, message] of [
    [registry.businessRuntimeMutationAllowed, "mutação operacional"],
    [registry.databaseMutationAllowed, "alteração de banco"],
    [registry.apiDuplicationAllowed, "duplicação de API"],
    [registry.ruleDuplicationAllowed, "duplicação de regra"],
    [registry.inventedMetricsAllowed, "métrica inventada"],
    [registry.technicalErrorsMayReachUser, "erro técnico na interface"],
    [registry.ambiguousZeroAllowed, "zero ambíguo"],
  ]) {
    assert(flag === false, `A Fase 41 não autoriza ${message}.`);
  }

  assert(
    JSON.stringify(registry.stateKinds) === JSON.stringify(EXPECTED_STATES),
    "Os sete estados operacionais canônicos foram alterados.",
  );

  const invariants = registry.invariants ?? {};
  for (const invariant of [
    "zeroIsVerifiedEmpty",
    "failureNeverRendersAsZero",
    "noInventedMetrics",
    "technicalErrorsHidden",
    "nanForbidden",
    "permissionIsNotSystemFailure",
    "recoverableErrorRequiresAction",
  ]) {
    assert(
      invariants[invariant] === true,
      `Invariante de confiabilidade ausente: ${invariant}`,
    );
  }

  const primitive = registry.canonicalPrimitive;
  const primitiveSource = readText(root, primitive.file);
  for (const marker of [
    ...(primitive.requiredExports ?? []),
    ...(primitive.requiredMarkers ?? []),
  ]) {
    assert(
      primitiveSource.includes(marker),
      `Marcador confiável ausente na primitiva: ${marker}`,
    );
  }
  for (const forbiddenToken of primitive.forbiddenTokens ?? []) {
    assert(
      !primitiveSource.includes(forbiddenToken),
      `A primitiva deixou de ser server-safe: ${forbiddenToken}`,
    );
  }

  assert(
    /kind === "empty"[\s\S]+zeroMeaning \?\? "verified-empty"/.test(
      primitiveSource,
    ),
    "O estado vazio precisa declarar zero verificado.",
  );
  assert(
    /isError[\s\S]+action \? "available" : "required"/.test(primitiveSource),
    "Erro recuperável precisa declarar a disponibilidade da recuperação.",
  );

  assert(
    registry.legacyAdapters?.length === 3,
    "Os três adapters legados precisam convergir para a primitiva canônica.",
  );
  for (const adapter of registry.legacyAdapters) {
    const source = readText(root, adapter.file);
    for (const marker of adapter.requiredMarkers ?? []) {
      assert(
        source.includes(marker),
        `Adapter sem contrato confiável em ${adapter.file}: ${marker}`,
      );
    }
  }

  const templateSource = readText(root, registry.template.file);
  for (const marker of registry.template.requiredMarkers ?? []) {
    assert(
      templateSource.includes(marker),
      `Template sem contrato confiável: ${marker}`,
    );
  }

  const cssSource = readText(root, registry.presentation.file);
  for (const marker of registry.presentation.requiredMarkers ?? []) {
    assert(
      cssSource.includes(marker),
      `Regra visual de estado ausente: ${marker}`,
    );
  }

  assert(
    registry.adoptionSurfaces?.length === 3,
    "A Fase 41 precisa adotar exatamente três superfícies prioritárias.",
  );
  const routes = new Set();
  for (const surface of registry.adoptionSurfaces) {
    assert(!routes.has(surface.route), `Rota duplicada: ${surface.route}`);
    routes.add(surface.route);
    const source = readText(root, surface.source);
    for (const marker of surface.requiredMarkers ?? []) {
      assert(
        source.includes(marker),
        `Adoção confiável ausente em ${surface.source}: ${marker}`,
      );
    }
  }

  assert(
    registry.acceptanceCriteria?.length >= 10,
    "Critérios de aceite insuficientes.",
  );

  return {
    phase: 41,
    ok: true,
    states: registry.stateKinds.length,
    surfaces: registry.adoptionSurfaces.length,
    invariants: Object.keys(invariants).length,
    technicalErrorsHidden: invariants.technicalErrorsHidden,
    zeroSemanticsProtected:
      invariants.zeroIsVerifiedEmpty && invariants.failureNeverRendersAsZero,
    recoverableErrorRequiresAction: invariants.recoverableErrorRequiresAction,
    businessRuntimeMutationAllowed: registry.businessRuntimeMutationAllowed,
    databaseMutationAllowed: registry.databaseMutationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadReliableStatesRegistry(root, registryPath);
  const summary = validateReliableStates({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 41 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

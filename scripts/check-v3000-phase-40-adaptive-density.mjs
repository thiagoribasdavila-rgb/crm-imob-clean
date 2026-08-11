import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-40-adaptive-density.json";
const EXPECTED_MODES = ["compact", "comfortable", "executive"];
const EXPECTED_PROFILES = [
  ["execution", ["broker"]],
  ["exceptions", ["manager", "superintendent"]],
  ["executive", ["director", "admin", "director_decisor"]],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadAdaptiveDensityRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateAdaptiveDensity({ root = process.cwd(), registry }) {
  assert(registry.phase === 40, "O contrato precisa representar a Fase 40.");
  assert(
    registry.status === "adaptive-density-adopted",
    "A Fase 40 precisa estar adaptive-density-adopted.",
  );
  readText(root, registry.previousPhaseRegistry);

  for (const [flag, message] of [
    [registry.businessRuntimeMutationAllowed, "regra operacional"],
    [registry.databaseMutationAllowed, "banco"],
    [registry.apiDuplicationAllowed, "duplicação de API"],
    [registry.ruleDuplicationAllowed, "duplicação de regra"],
    [registry.primaryActionMayBeHidden, "ocultar a ação primária"],
  ]) {
    assert(flag === false, `A Fase 40 não autoriza ${message}.`);
  }

  assert(
    JSON.stringify(registry.densityModes) === JSON.stringify(EXPECTED_MODES),
    "Os modos compacto, confortável e executivo precisam permanecer canônicos.",
  );
  assert(
    JSON.stringify(
      registry.roleProfiles.map(({ profile, roles }) => [profile, roles]),
    ) === JSON.stringify(EXPECTED_PROFILES),
    "O mapa de densidade por papel foi alterado.",
  );

  const sharedData = registry.sharedDataContract;
  assert(
    sharedData?.sameDom === true && sharedData.cssOnlyReordering === true,
    "Todos os perfis precisam compartilhar a mesma árvore de dados com reordenação CSS.",
  );
  assert(
    sharedData.duplicatedApis === false && sharedData.duplicatedRules === false,
    "O contrato não permite API ou regra duplicada.",
  );

  const shellSource = readText(root, registry.shell.file);
  const resolverSource = readText(root, registry.shell.roleResolverFile);
  for (const marker of registry.shell.requiredMarkers ?? []) {
    assert(
      shellSource.includes(marker) || resolverSource.includes(marker),
      `Marcador adaptativo ausente no shell: ${marker}`,
    );
  }
  for (const [profile, roles] of EXPECTED_PROFILES) {
    assert(
      resolverSource.includes(`return \"${profile}\"`) || profile === "exceptions",
      `Perfil não resolvido no shell: ${profile}`,
    );
    for (const role of roles) {
      assert(
        resolverSource.includes(`\"${role}\"`),
        `Papel não resolvido no shell: ${role}`,
      );
    }
  }

  const primitive = registry.canonicalPrimitive;
  const primitiveSource = readText(root, primitive.file);
  for (const marker of [
    ...(primitive.requiredExports ?? []),
    ...(primitive.requiredMarkers ?? []),
  ]) {
    assert(
      primitiveSource.includes(marker),
      `Marcador adaptativo ausente na primitiva: ${marker}`,
    );
  }
  for (const forbiddenToken of primitive.forbiddenTokens ?? []) {
    assert(
      !primitiveSource.includes(forbiddenToken),
      `A primitiva deixou de ser server-safe: ${forbiddenToken}`,
    );
  }
  const actionIndex = primitiveSource.indexOf(
    'data-density-anchor="primary-action"',
  );
  const detailsIndex = primitiveSource.indexOf("<details");
  assert(
    actionIndex >= 0 && detailsIndex > actionIndex,
    "A ação primária precisa permanecer visível antes do contexto sob demanda.",
  );

  const cssSource = readText(root, registry.presentation.cssFile);
  for (const marker of registry.presentation.requiredMarkers ?? []) {
    assert(
      cssSource.includes(marker),
      `Regra de apresentação adaptativa ausente: ${marker}`,
    );
  }
  const phaseCss = cssSource.slice(cssSource.indexOf("V3000 Fase 040"));
  assert(
    !/data-density-anchor[^}]+display\s*:\s*none/s.test(phaseCss),
    "A ação primária não pode ser escondida pela densidade adaptativa.",
  );

  assert(
    registry.adoptionSurfaces?.length === 3,
    "A Fase 40 precisa adotar exatamente três superfícies prioritárias.",
  );
  const routes = new Set();
  for (const surface of registry.adoptionSurfaces) {
    assert(!routes.has(surface.route), `Rota duplicada: ${surface.route}`);
    routes.add(surface.route);
    const source = readText(root, surface.source);
    for (const marker of [
      "ATLAS_ADAPTIVE_DENSITY_CONTRACT",
      'data-adaptive-density="role-and-device"',
      "data-adaptive-density-contract={ATLAS_ADAPTIVE_DENSITY_CONTRACT}",
    ]) {
      assert(
        source.includes(marker),
        `Adoção adaptativa ausente em ${surface.source}: ${marker}`,
      );
    }
  }

  assert(
    registry.acceptanceCriteria?.length >= 9,
    "Critérios de aceite insuficientes.",
  );

  return {
    phase: 40,
    ok: true,
    modes: registry.densityModes.length,
    profiles: registry.roleProfiles.length,
    surfaces: registry.adoptionSurfaces.length,
    sharedDom: sharedData.sameDom,
    cssOnlyReordering: sharedData.cssOnlyReordering,
    primaryActionAlwaysVisible: !registry.primaryActionMayBeHidden,
    businessRuntimeMutationAllowed: registry.businessRuntimeMutationAllowed,
    databaseMutationAllowed: registry.databaseMutationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadAdaptiveDensityRegistry(root, registryPath);
  const summary = validateAdaptiveDensity({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 40 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-42-commercial-identity.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadCommercialIdentityRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateCommercialIdentity({ root = process.cwd(), registry }) {
  assert(registry.phase === 42, "O contrato precisa representar a Fase 42.");
  assert(
    registry.status === "commercial-identity-adopted",
    "A Fase 42 precisa estar commercial-identity-adopted.",
  );
  readText(root, registry.previousPhaseRegistry);

  for (const [flag, label] of [
    [registry.databaseMutationAllowed, "alteração de banco"],
    [registry.apiDuplicationAllowed, "duplicação de API"],
    [registry.businessRuleMutationAllowed, "alteração de regra comercial"],
  ]) {
    assert(flag === false, `A Fase 42 não autoriza ${label}.`);
  }

  const requiredSignals = new Set(registry.requiredSignals ?? []);
  for (const signal of [
    "name",
    "project",
    "stage",
    "source",
    "responsible",
    "lastInteraction",
  ]) {
    assert(requiredSignals.has(signal), `Sinal comercial ausente: ${signal}`);
  }

  for (const surface of [
    registry.pipelineSurface,
    registry.pipelineApi,
    registry.presentation,
  ]) {
    const source = readText(root, surface.file);
    for (const marker of surface.requiredMarkers ?? []) {
      assert(
        source.includes(marker),
        `Marcador comercial ausente em ${surface.file}: ${marker}`,
      );
    }
  }

  const apiSource = readText(root, registry.pipelineApi.file);
  assert(
    /from\("profiles"\)[\s\S]+\.eq\("organization_id", identity\.organizationId\)/.test(
      apiSource,
    ),
    "Responsáveis precisam ser resolvidos dentro da organização autenticada.",
  );
  assert(
    /assignedProfilesResult\.error[\s\S]+pipeline\.assigned_profiles_unavailable/.test(
      apiSource,
    ),
    "A referência auxiliar precisa falhar de forma degradada e observável.",
  );
  assert(
    registry.acceptanceCriteria?.length >= 7,
    "Critérios de aceite insuficientes.",
  );

  return {
    phase: 42,
    ok: true,
    signals: requiredSignals.size,
    surfaces: 3,
    tenantScopedOwnerResolution: true,
    degradedOwnerFallback: true,
    databaseMutationAllowed: registry.databaseMutationAllowed,
    apiDuplicationAllowed: registry.apiDuplicationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadCommercialIdentityRegistry(root, registryPath);
  const summary = validateCommercialIdentity({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 42 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

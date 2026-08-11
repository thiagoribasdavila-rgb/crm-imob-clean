import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-43-commercial-clock.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadCommercialClockRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateCommercialClock({ root = process.cwd(), registry }) {
  assert(registry.phase === 43, "O contrato precisa representar a Fase 43.");
  assert(
    registry.status === "commercial-clock-adopted",
    "A Fase 43 precisa estar commercial-clock-adopted.",
  );
  readText(root, registry.previousPhaseRegistry);

  for (const [flag, label] of [
    [registry.databaseMutationAllowed, "alteração de banco"],
    [registry.apiDuplicationAllowed, "duplicação de API"],
    [registry.businessRuleMutationAllowed, "alteração de regra comercial"],
  ]) {
    assert(flag === false, `A Fase 43 não autoriza ${label}.`);
  }

  const dimensions = new Set(registry.requiredDimensions ?? []);
  for (const dimension of ["deadline", "cause", "impact", "action"]) {
    assert(
      dimensions.has(dimension),
      `Dimensão temporal ausente: ${dimension}`,
    );
  }

  const states = new Set(registry.requiredStates ?? []);
  for (const state of [
    "closed",
    "overdue",
    "due_soon",
    "scheduled",
    "unplanned",
  ]) {
    assert(states.has(state), `Estado temporal ausente: ${state}`);
  }

  for (const surface of [registry.pipelineSurface, registry.presentation]) {
    const source = readText(root, surface.file);
    for (const marker of surface.requiredMarkers ?? []) {
      assert(
        source.includes(marker),
        `Marcador temporal ausente em ${surface.file}: ${marker}`,
      );
    }
  }

  const pipelineSource = readText(root, registry.pipelineSurface.file);
  assert(
    /function commercialClock\([\s\S]+const sla = firstContactSla\(lead\)/.test(
      pipelineSource,
    ),
    "O relógio precisa derivar do cálculo de SLA já existente.",
  );
  assert(
    /isNextActionOverdue\(lead\)[\s\S]+Venceu em/.test(pipelineSource),
    "Compromisso vencido precisa manter a próxima ação como fonte.",
  );
  assert(
    /aria-label=\{`Relógio comercial:[\s\S]+Causa:[\s\S]+Ação:/.test(
      pipelineSource,
    ),
    "O estado temporal precisa ser compreensível sem depender de cor.",
  );
  assert(
    registry.acceptanceCriteria?.length >= 8,
    "Critérios de aceite insuficientes.",
  );

  return {
    phase: 43,
    ok: true,
    dimensions: dimensions.size,
    states: states.size,
    surfaces: 2,
    preservesSlaCalculation: true,
    textSemantic: true,
    databaseMutationAllowed: registry.databaseMutationAllowed,
    apiDuplicationAllowed: registry.apiDuplicationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadCommercialClockRegistry(root, registryPath);
  const summary = validateCommercialClock({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 43 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

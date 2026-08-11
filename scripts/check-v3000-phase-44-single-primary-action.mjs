import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY = "config/v3000-phase-44-single-primary-action.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadSinglePrimaryActionRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateSinglePrimaryAction({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 44, "O contrato precisa representar a Fase 44.");
  assert(
    registry.status === "single-primary-action-adopted",
    "A Fase 44 precisa estar single-primary-action-adopted.",
  );
  readText(root, registry.previousPhaseRegistry);

  for (const [flag, label] of [
    [registry.databaseMutationAllowed, "alteração de banco"],
    [registry.apiDuplicationAllowed, "duplicação de API"],
    [registry.businessRuleMutationAllowed, "alteração de regra comercial"],
  ]) {
    assert(flag === false, `A Fase 44 não autoriza ${label}.`);
  }

  const actionKinds = new Set(registry.requiredActionKinds ?? []);
  for (const actionKind of [
    "contact",
    "schedule",
    "material",
    "record",
    "advance",
  ]) {
    assert(actionKinds.has(actionKind), `Ação primária ausente: ${actionKind}`);
  }

  for (const surface of [registry.pipelineSurface, registry.presentation]) {
    const source = readText(root, surface.file);
    const compactSource = source.replace(/\s+/g, "");
    for (const marker of surface.requiredMarkers ?? []) {
      assert(
        source.includes(marker) ||
          compactSource.includes(marker.replace(/\s+/g, "")),
        `Marcador de ação única ausente em ${surface.file}: ${marker}`,
      );
    }
  }

  const pipelineSource = readText(root, registry.pipelineSurface.file);
  assert(
    /function kanbanV30PrimaryAction\([\s\S]+const sla = firstContactSla\(lead\)[\s\S]+const nextActionOverdue = isNextActionOverdue\(lead\)/.test(
      pipelineSource,
    ),
    "A ação primária precisa preservar SLA e compromisso como evidências.",
  );
  assert(
    /if \(sla\?\.overdue && contact\)[\s\S]+kind: "contact"/.test(
      pipelineSource,
    ),
    "Primeiro contato vencido precisa priorizar contato.",
  );
  assert(
    /if \(!lead\.next_action_at\)[\s\S]+kind: "record"/.test(pipelineSource),
    "Oportunidade sem compromisso precisa priorizar registro.",
  );
  assert(
    /status === "proposta"[\s\S]+kind: "material"[\s\S]+status === "visita"[\s\S]+kind: "schedule"/.test(
      pipelineSource,
    ),
    "Proposta e visita precisam selecionar comandos contextuais próprios.",
  );
  assert(
    /score >= 70\) && nextStage\)[\s\S]+kind: "advance"[\s\S]+targetStage: nextStage\.key/.test(
      pipelineSource,
    ),
    "Oportunidade quente precisa permitir avanço direto de etapa.",
  );
  assert(
    (pipelineSource.match(/data-primary-action-count="1"/g) ?? []).length >= 3,
    "Card, mobile e preview precisam declarar uma única ação primária.",
  );
  assert(
    (pipelineSource.match(/data-secondary-actions="context-only"/g) ?? [])
      .length >= 3,
    "Ações secundárias precisam permanecer sob contexto nas três superfícies.",
  );
  assert(
    registry.acceptanceCriteria?.length >= 10,
    "Critérios de aceite insuficientes.",
  );

  return {
    phase: 44,
    ok: true,
    actions: actionKinds.size,
    surfaces: 3,
    singlePrimaryAction: true,
    contextualSecondaryActions: true,
    databaseMutationAllowed: registry.databaseMutationAllowed,
    apiDuplicationAllowed: registry.apiDuplicationAllowed,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadSinglePrimaryActionRegistry(root, registryPath);
  const summary = validateSinglePrimaryAction({ root, registry });
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
      `Fase 44 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

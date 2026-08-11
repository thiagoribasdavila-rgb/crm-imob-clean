import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_REGISTRY =
  "config/v3000-phase-45-conversation-continuity.json";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  assert(fs.existsSync(absolutePath), `Arquivo ausente: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
}

export function loadConversationContinuityRegistry(
  root = process.cwd(),
  registryPath = DEFAULT_REGISTRY,
) {
  return JSON.parse(readText(root, registryPath));
}

export function validateConversationContinuity({
  root = process.cwd(),
  registry,
}) {
  assert(registry.phase === 45, "O contrato precisa representar a Fase 45.");
  assert(
    registry.status === "conversation-continuity-adopted",
    "A Fase 45 precisa estar conversation-continuity-adopted.",
  );
  assert(
    registry.previousPhase?.phase === 44 &&
      registry.previousPhase?.status === "single-primary-action-adopted",
    "A Fase 45 precisa preservar a ação primária única da Fase 44.",
  );
  assert(registry.scope?.readOnly === true, "A leitura precisa ser somente leitura.");
  assert(registry.scope?.tenantScoped === true, "A leitura precisa respeitar o tenant.");
  assert(
    registry.scope?.messageContentExposed === false,
    "Conteúdo de mensagem não pode ser exposto no Kanban.",
  );
  assert(
    registry.scope?.channelEvidenceRequired === true,
    "O canal precisa exigir evidência de entrega ou recebimento.",
  );

  const pipeline = readText(root, "app/(crm)/pipeline/page.tsx");
  const api = readText(root, "app/api/v1/pipeline/route.ts");
  const css = readText(root, "app/globals.css");
  const documentation = readText(
    root,
    "docs/V3000_PHASE_45_CONVERSATION_CONTINUITY.md",
  );
  const plan = readText(
    root,
    "docs/V3000_PHASES_37_56_CONVERSION_CARD_EVOLUTION_PLAN.md",
  );

  for (const marker of [
    "type ConversationContinuity =",
    "function kanbanV30ConversationContinuity(",
    'data-v3000-phase="45-conversation-continuity"',
    "data-channel-confirmed=",
    "Próximo compromisso:",
  ]) {
    assert(pipeline.includes(marker), `Marcador visual ausente: ${marker}`);
  }

  for (const marker of [
    "readConversationContinuity",
    '.from("conversations")',
    '.from("messages")',
    "external_message_id",
    'privacy: "metadata-only"',
    "channelRequiresDeliveryEvidence: true",
    "conversation_continuity:",
    '.eq("organization_id", identity.organizationId)',
  ]) {
    assert(api.includes(marker), `Marcador da API ausente: ${marker}`);
  }

  const messageRead =
    api.match(/\.from\("messages"\)([\s\S]*?)if \(result\.error\)/)?.[1] ?? "";
  assert(messageRead.includes("external_message_id"), "A prova externa da mensagem está ausente.");
  assert(
    !/[\"',]content(?:[\"',]|\b)/.test(messageRead),
    "A consulta do Pipeline não pode ler o conteúdo da mensagem.",
  );
  assert(
    /\["sent", "delivered", "read", "received"\]/.test(api),
    "Os estados que comprovam o canal estão incompletos.",
  );
  assert(
    !/normalized === "whatsapp"[\s\S]{0,120}channelConfirmed: true/.test(
      pipeline,
    ),
    "WhatsApp não pode ser confirmado apenas pelo nome do canal.",
  );

  for (const marker of [
    ".atlas-kanban-v30-conversation-continuity",
    '[data-tone="success"]',
    '[data-tone="warning"]',
    '[data-channel-confirmed="false"]',
  ]) {
    assert(css.includes(marker), `Estilo de continuidade ausente: ${marker}`);
  }
  assert(
    documentation.includes("metadados") &&
      /conteúdo da\s+mensagem/.test(documentation),
    "A documentação precisa registrar privacidade e proveniência.",
  );
  assert(
    /### Fase 45[\s\S]+Status:\*\* implementada e validada em 11\/08\/2026/.test(
      plan,
    ),
    "O plano não registra a conclusão da Fase 45.",
  );

  return {
    phase: 45,
    status: registry.status,
    checks: 8,
    tenantScoped: true,
    metadataOnly: true,
    channelEvidenceRequired: true,
    databaseMigration: registry.constraints.databaseMigration,
  };
}

export function main() {
  const root = process.cwd();
  const registryPath = process.argv[2] || DEFAULT_REGISTRY;
  const registry = loadConversationContinuityRegistry(root, registryPath);
  const summary = validateConversationContinuity({ root, registry });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `Fase 45 inválida: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

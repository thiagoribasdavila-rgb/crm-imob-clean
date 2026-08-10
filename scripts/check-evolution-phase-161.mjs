import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-161-meta-test-event-approval-workspace.json",
  "docs/EVOLUTION_PHASE_161_META_TEST_EVENT_APPROVAL_WORKSPACE.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 161) {
  errors.push(`currentPhase esperado 161, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-161-meta-test-event-approval-workspace.json", "utf8"),
);
if (phase.phase !== 161 || phase.status !== "implemented") {
  errors.push("Configuração da fase 161 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="161-meta-test-event-approval-workspace"',
  "MetaTestPayloadLine",
  "metaTestApprovalChecklist",
  "selectedTestCandidate",
  "metaTestEventPayload",
  "metaTestPayloadLines",
  "metaTestReadiness",
  "copyMetaTestPayload",
  "registerMetaTestReceipt",
  "MetaTestPayloadLineCard",
  "Modo teste Meta",
  "Payload validado antes do disparo real.",
  "Copiar payload de teste",
  "Registrar recibo simulado",
  "test_only_no_delivery",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_161_META_TEST_EVENT_APPROVAL_WORKSPACE.md", "utf8")
  .toLowerCase();
for (const pattern of [
  "fase 161",
  "payload de teste",
  "aprovação do diretor",
  "test_only_no_delivery",
  "não aciona meta api",
  "nenhuma migration",
]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-161:check"]) {
  errors.push("Script evolution:phase-161:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 161 validada: workspace de aprovação de payload teste Meta implementado.");

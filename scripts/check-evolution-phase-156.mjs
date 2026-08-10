import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-156-meta-director-approval-packet.json",
  "docs/EVOLUTION_PHASE_156_META_DIRECTOR_APPROVAL_PACKET.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 156) {
  errors.push(`currentPhase esperado 156, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-156-meta-director-approval-packet.json", "utf8"),
);
if (phase.phase !== 156 || phase.status !== "implemented") {
  errors.push("Configuração da fase 156 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="156-meta-director-approval-packet"',
  "approvalEvidenceItems",
  "copyApprovalPacket",
  "Pacote de decisão antes de escalar",
  "Copiar pacote de aprovação",
  "Checklist auditável",
  "O que precisa existir no teste real",
  "MiniDecisionMetric",
  "rascunho para revisão do diretor",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_156_META_DIRECTOR_APPROVAL_PACKET.md", "utf8")
  .toLowerCase();
for (const pattern of ["fase 156", "aprovação", "meta", "checklist", "lead real", "nenhuma migration"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-156:check"]) {
  errors.push("Script evolution:phase-156:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 156 validada: pacote de aprovação do diretor para campanhas Meta implementado.");

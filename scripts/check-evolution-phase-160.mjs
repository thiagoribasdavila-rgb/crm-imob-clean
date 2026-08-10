import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-160-meta-event-candidate-audit-queue.json",
  "docs/EVOLUTION_PHASE_160_META_EVENT_CANDIDATE_AUDIT_QUEUE.md",
  "app/(crm)/marketing/campaigns/page.tsx",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 160) {
  errors.push(`currentPhase esperado 160, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(
  fs.readFileSync("config/evolution-phase-160-meta-event-candidate-audit-queue.json", "utf8"),
);
if (phase.phase !== 160 || phase.status !== "implemented") {
  errors.push("Configuração da fase 160 não está implementada corretamente.");
}

const page = fs.readFileSync("app/(crm)/marketing/campaigns/page.tsx", "utf8");
for (const pattern of [
  'data-v30-phase="160-meta-event-candidate-audit-queue"',
  "MetaEventCandidate",
  "eventCandidateRequirements",
  "metaEventCandidateQueue",
  "eventCandidateReadiness",
  "MetaEventCandidateCard",
  "Fila auditável",
  "Eventos candidatos antes do envio real.",
  "deduplicação",
  "consentimento",
  "origem preservada",
  "aprovação humana",
]) {
  if (!page.includes(pattern)) errors.push(`Página de campanhas não contém padrão esperado: ${pattern}`);
}

const docs = fs
  .readFileSync("docs/EVOLUTION_PHASE_160_META_EVENT_CANDIDATE_AUDIT_QUEUE.md", "utf8")
  .toLowerCase();
for (const pattern of [
  "fase 160",
  "fila auditável",
  "deduplicação",
  "consentimento",
  "origem preservada",
  "aprovação humana",
  "nenhuma migration",
]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-160:check"]) {
  errors.push("Script evolution:phase-160:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 160 validada: fila auditável de eventos candidatos Meta implementada.");

import fs from "node:fs";

const requiredFiles = [
  "config/evolution-phase-146-kanban-v30-inline-preview.json",
  "docs/EVOLUTION_PHASE_146_KANBAN_V30_INLINE_PREVIEW.md",
  "app/(crm)/pipeline/page.tsx",
  "app/globals.css",
];

const errors = [];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) errors.push(`Arquivo obrigatório ausente: ${file}`);
}

const program = JSON.parse(fs.readFileSync("config/evolution-program-3000.json", "utf8"));
if (program.currentPhase !== 146) {
  errors.push(`currentPhase esperado 146, recebido ${program.currentPhase}`);
}

const phase = JSON.parse(fs.readFileSync("config/evolution-phase-146-kanban-v30-inline-preview.json", "utf8"));
if (phase.phase !== 146 || phase.status !== "implemented") {
  errors.push("Configuração da fase 146 não está implementada corretamente.");
}

const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
for (const pattern of [
  "type KanbanV30DetailPreview",
  "const [previewLeadId, setPreviewLeadId] = useState<string | null>(null)",
  "const kanbanV30DetailPreview = useMemo<KanbanV30DetailPreview | null>",
  "atlas-kanban-v30-card-command-actions",
  "atlas-kanban-v30-inline-preview",
  'data-v30-phase="146-kanban-v30-inline-preview"',
  "Preview de decisão",
  "setPreviewLeadId(null)",
]) {
  if (!pipeline.includes(pattern)) errors.push(`Pipeline não contém padrão esperado: ${pattern}`);
}

const css = fs.readFileSync("app/globals.css", "utf8");
for (const pattern of [
  "Fase 146 — Kanban V30 Inline Preview Drawer",
  ".atlas-kanban-v30-card-command-actions",
  ".atlas-kanban-v30-inline-preview",
  ".atlas-kanban-v30-inline-preview-grid",
  ".atlas-kanban-v30-inline-preview-playbook",
  ".atlas-kanban-v30-inline-preview-actions",
]) {
  if (!css.includes(pattern)) errors.push(`CSS não contém padrão esperado: ${pattern}`);
}

const docs = fs.readFileSync("docs/EVOLUTION_PHASE_146_KANBAN_V30_INLINE_PREVIEW.md", "utf8").toLowerCase();
for (const pattern of ["fase 146", "preview", "kanban", "copilot", "nenhuma alteração em banco"]) {
  if (!docs.includes(pattern)) errors.push(`Documento não contém padrão esperado: ${pattern}`);
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.scripts?.["evolution:phase-146:check"]) {
  errors.push("Script evolution:phase-146:check não registrado no package.json.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fase 146 validada: Kanban V30 ganhou preview inline de decisão sem troca de tela.");

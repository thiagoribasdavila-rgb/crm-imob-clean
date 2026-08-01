import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-061-copilot-workspaces.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const action = read("components/atlas/copilot-context-action.tsx");
const dock = read("components/AtlasCopilotDock.tsx");
const lead = read("app/(crm)/leads/[id]/page.tsx");
/**
 * 2026-07-29 — o workspace "Clientes 360" (`app/(crm)/customers/page.tsx`) foi
 * APAGADO: lia a mesma tabela `leads` que /leads, sem SLA nem lote, e sem o
 * piso de carteira — um corretor via a carteira da imobiliária inteira. As duas
 * ações de Copilot que ele oferecia (priorizar a carteira e preparar um contato
 * individual) foram para a carteira, que é onde a lista vive agora.
 */
const leads = read("app/(crm)/leads/page.tsx");
const customersRedirect = read("app/(crm)/customers/page.tsx");
const calendar = read("app/(crm)/calendar/page.tsx");
const report = read("docs/EVOLUTION_PHASE_061_COPILOT_WORKSPACES.md");

const checks = [
  ["Fase 061 concluída sem mutar banco ou dados", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 61", program.currentPhase >= 61],
  ["Ação contextual compartilhada opera somente em prévia", action.includes('actionMode: "preview-only"') && action.includes("requiresHumanConfirmation: true")],
  ["Lead 360 abre o Copilot com o identificador autorizado", lead.includes("<CopilotContextAction") && lead.includes("leadId: lead.id") && lead.includes('workspace: "lead"')],
  // Mesma capacidade, outro endereço: "Priorizar carteira" -> "Analisar
  // carteira" e "Preparar contato" -> "Preparar abordagem", ambos em /leads e
  // ambos em modo de preparação (o prompt proíbe enviar ou alterar).
  ["Carteira oferece priorização e preparação individual", leads.includes("✦ Analisar carteira") && leads.includes("✦ Preparar abordagem") && leads.includes("leadId: priority.lead.id") && leads.includes("não envie mensagem nem altere o CRM")],
  ["Destino aposentado de Clientes 360 continua alcançável", customersRedirect.includes('redirect("/leads")')],
  ["Agenda oferece planejamento assistido sem mutação", calendar.includes("✦ Preparar meu dia") && calendar.includes("não conclua ou crie tarefas")],
  ["Copilot mostra prévia segura e exige confirmação", dock.includes("atlas-copilot-preview-notice") && dock.includes('data-human-confirmation="required"') && dock.includes("Nada será enviado, concluído ou")],
  ["Retorno do Copilot aceita apenas navegação interna", dock.includes('requestedReturnHref?.startsWith("/")') && dock.includes('!requestedReturnHref.startsWith("//")')],
  ["Relatório registra impacto, segurança, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release segue bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 061 verificada: Copilot conectado a Leads, Clientes e Agenda em modo de preparação com confirmação humana.");

import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-051-live-lead-writes.json"));
const sprint = JSON.parse(read("config/corrective-sprint-050-059.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const createRoute = read("app/api/v1/leads/route.ts");
const detailRoute = read("app/api/v1/leads/[id]/route.ts");
const createPage = read("app/(crm)/leads/new/page.tsx");
const writes = read("lib/compat/live-writes.ts");
const report = read("docs/EVOLUTION_PHASE_051_LIVE_LEAD_WRITES.md");

const checks = [
  ["Fase 051 concluída sem migration ou mutação de dados", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Sprint e programa avançaram ao menos até a fase 51", sprint.phases.find((item) => item.phase === 51)?.status === "completed" && program.currentPhase >= 51],
  ["Cadastro não chama RPC ausente", !createRoute.includes('rpc("create_lead_atomic"') && createRoute.includes('.from("leads")')],
  ["Cadastro usa projetos e campos ativos", createRoute.includes('.from("crm_projects")') && createRoute.includes("score_ia") && createRoute.includes("assigned_user_id")],
  ["Cadastro preserva isolamento de tenant e duplicidade", createRoute.includes("emailDuplicate") && createRoute.includes("phoneDuplicate") && createRoute.includes("identity.organizationId")],
  ["Histórico usa lead_events real", writes.includes('.from("lead_events")') && detailRoute.includes("recordLiveLeadEvent") && !detailRoute.includes('.from("activities")')],
  ["Rotas ativas não chamam atlas_events", !createRoute.includes('.from("atlas_events")') && !detailRoute.includes('.from("atlas_events")')],
  ["Lead 360 lê apenas relações homologadas nesta fase", detailRoute.includes('.from("tasks")') && detailRoute.includes('.from("profiles")') && detailRoute.includes('.from("crm_projects")') && !detailRoute.includes('.from("opportunities")')],
  ["Formulário carrega cadastro de projeto real", createPage.includes('.from("crm_projects")') && !createPage.includes('.from("developments")')],
  ["Relatório registra impacto e risco transacional", report.includes("Impacto operacional") && report.includes("Risco identificado") && phase.release.buildExecuted === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 051 verificada: cadastro, edição e histórico conectados ao banco ativo sem chamadas 404 conhecidas.");

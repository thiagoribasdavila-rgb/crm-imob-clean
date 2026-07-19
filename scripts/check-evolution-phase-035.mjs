import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-035-dashboard-decision-first.json", "utf8"));
const phaseThirtyFour = JSON.parse(fs.readFileSync("config/evolution-phase-034-navigation-mobile-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const dashboard = fs.readFileSync("app/(crm)/dashboard/page.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_035_DASHBOARD_DECISION_FIRST.md", "utf8");

const checks = [
  ["Fase 035 concluída sem mutação comercial", config.status === "completed" && config.productionDataModified === false && config.dataFetchingChanged === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha para o dashboard", phaseThirtyFour.status === "completed" && phaseThirtyFour.nextPhase.phase === 35],
  ["Dashboard publica o contrato decision-first", dashboard.includes('data-dashboard-layout="decision-first"') && config.dashboardContract.layoutAttribute === "decision-first"],
  ["Fila principal cobre os quatro papéis", dashboard.includes("if (isDirector)") && dashboard.includes("if (isSuperintendent)") && dashboard.includes("if (isManager)") && config.structuralBaseline.roleSpecificPrimaryQueuesAfter === 4],
  ["Decisão principal possui estado, evidência e ação", dashboard.includes("const primaryCommand") && dashboard.includes("primaryCommand.detail") && dashboard.includes("primaryCommand.action") && dashboard.includes("Próxima decisão")],
  ["Contagem identifica prioridades, não desempenho", dashboard.includes("prioridades visíveis") && config.truthPolicy.rolePriorityCountPresentedAsPerformanceMetric === false],
  ["Percentual sintético foi removido", !dashboard.includes("100 - metrics.overdue * 4 - metrics.unassigned * 2") && config.dashboardContract.syntheticHealthScoreRemoved === true],
  ["Foco diário oculta diagnósticos e painéis extensos", dashboard.includes('className="atlas-command-detail') && styles.includes('[data-phase="22-manager-daily"]') && styles.includes('[data-phase="23-superintendent-daily"]') && styles.includes('[data-phase="24-director-command-center"]') && config.focusMode.roleDeepDivesHidden === true],
  ["Análise completa permanece disponível", dashboard.includes('setCommandMode("complete")') && dashboard.includes("Análise completa") && config.dashboardContract.extendedPanelsPreserved === true],
  ["Ação operacional e atualização são acessíveis", dashboard.includes("<Link href={primaryCommand.href}") && dashboard.includes('aria-label="Atualizar dados do Command Center"') && config.accessibility.primaryActionIsNativeLink === true],
  ["Copilot permanece explicativo e supervisionado", dashboard.includes("sem executar nenhuma ação") && config.aiPolicy.explanationOnly === true && config.aiPolicy.automaticExecutionAdded === false],
  ["Relatório registra verdade, segurança e próxima fase", report.includes("percentual sintético") && report.includes("Nenhuma melhoria comportamental") && report.includes("Fase 036")],
  ["RBAC, tenant e gate de homologação permanecem", config.safetyPolicy.rbacPreserved === true && config.safetyPolicy.tenantIsolationPreserved === true && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 035 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 035 aprovada: Command Center orientado à próxima decisão, por papel, sem percentual sintético e com análise completa preservada.");

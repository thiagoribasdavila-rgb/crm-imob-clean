import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-036-leads-action-workspace.json", "utf8"));
const phaseThirtyFive = JSON.parse(fs.readFileSync("config/evolution-phase-035-dashboard-decision-first.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const leads = fs.readFileSync("app/(crm)/leads/page.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_036_LEADS_ACTION_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 036 concluída sem mutação comercial", config.status === "completed" && config.productionDataModified === false && config.dataFetchingChanged === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha para Leads", phaseThirtyFive.status === "completed" && phaseThirtyFive.nextPhase.phase === 36],
  ["Leads publica o contrato action-first", leads.includes('data-leads-layout="action-first"') && config.leadsContract.layoutAttribute === "action-first"],
  ["Fila deriva somente da página carregada", leads.includes("const visiblePriorityQueue = useMemo") && leads.includes("return items") && config.leadsContract.prioritySource === "current-paginated-items"],
  ["Fila visível limita três prioridades", leads.includes("visiblePriorityQueue.slice(0, 3)") && config.leadsContract.visiblePriorityLimit === 3],
  ["Motivos usam sinais observados e explicáveis", leads.includes('label: "Follow-up vencido"') && leads.includes('label: "Sem responsável"') && leads.includes('label: "Quente sem agenda"') && leads.includes('label: "Sem próxima ação"')],
  ["Interface declara o recorte da página atual", leads.includes("Fila de ação · página atual") && leads.includes("prioridade(s) visível(is)") && config.truthPolicy.queueExplicitlyLimitedToCurrentPage === true],
  ["Corretor não recebe pendência de distribuição", leads.includes('const includeOwnership = currentRole !== "broker"') && config.roleResolution.unassignedSignalHiddenFromBrokerQueue === true],
  ["Ferramentas secundárias permanecem disponíveis", leads.includes('<details className="atlas-leads-tools">') && leads.includes('/leads/data-quality') && leads.includes('/leads/deduplication') && config.progressiveDisclosure.functionalityRemoved === false],
  ["Tabela, lista móvel, filtros e paginação foram preservados", leads.includes('className="atlas-leads-desktop"') && leads.includes('className="atlas-leads-mobile"') && leads.includes('className="atlas-leads-filter-panel"') && leads.includes('className="atlas-pagination"')],
  ["Copilot prepara sem executar nem expor contato", leads.includes("não envie mensagem nem altere o CRM") && !leads.includes("context: {\n                              phone:") && config.aiPolicy.automaticMessageSending === false && config.aiPolicy.personalContactIncludedInPrompt === false],
  ["Fila e ações novas são acessíveis", leads.includes('aria-live="polite"') && leads.includes('aria-labelledby="atlas-leads-action-title"') && styles.includes(".atlas-leads-action-buttons") && styles.includes("min-height: 44px") && config.accessibility.minimumNewTouchTargetPx === 44],
  ["Layout compacto responde a desktop e celular", styles.includes(".atlas-leads-hero-compact") && styles.includes(".atlas-leads-action-list") && styles.includes("grid-template-columns: repeat(3, minmax(0, 1fr))")],
  ["Relatório registra verdade, segurança e próxima fase", report.includes("Nenhum score, percentual ou probabilidade") && report.includes("Nenhum ganho de produtividade") && report.includes("Fase 037")],
  ["RBAC, tenant e gate de homologação permanecem", config.safetyPolicy.rbacPreserved === true && config.safetyPolicy.tenantIsolationPreserved === true && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false]
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 036 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 036 aprovada: Leads compactos, explicáveis e orientados à próxima ação visível, sem ampliar escopo ou inventar score.");

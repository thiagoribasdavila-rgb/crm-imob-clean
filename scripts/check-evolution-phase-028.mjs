import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-028-navigation-primary-action-standard.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentySeven = JSON.parse(fs.readFileSync("config/evolution-phase-027-navigation-task-step-reduction.json", "utf8"));
const actionLink = fs.readFileSync("components/atlas/action-link.tsx", "utf8");
const pageHeader = fs.readFileSync("components/atlas/page-header.tsx", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const dashboard = fs.readFileSync("app/(crm)/dashboard/page.tsx", "utf8");
const customers = fs.readFileSync("app/(crm)/customers/page.tsx", "utf8");
const sales = fs.readFileSync("app/(crm)/sales/page.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_028_NAVIGATION_PRIMARY_ACTION_STANDARD.md", "utf8");

const consumers = [dashboard, customers, sales].join("\n");
const standardizedHeaderActions = (consumers.match(/action=\{\{/g) || []).length;
const customCustomerPrimaryAction = customers.includes("atlas-customer-hero-actions") && customers.includes('<Link href="/leads/new" className="atlas-button-primary">Novo cliente</Link>') ? 1 : 0;
const manualHeaderActions = (consumers.match(/actions=\{/g) || []).length;
const secondaryHeaderActions = (consumers.match(/priority: "secondary"/g) || []).length;

const checks = [
  ["Fase 028 concluída sem mutação de dados", config.status === "completed" && config.runtimePresentationChanged === true && config.productionDataModified === false],
  ["Fase anterior permanece concluída", phaseTwentySeven.status === "completed" && phaseTwentySeven.exitCriteria.parallelWorkflowCreated === false],
  ["Contrato aceita somente prioridades explícitas", actionLink.includes('export type AtlasActionPriority = "primary" | "secondary"') && actionLink.includes('priority = "primary"')],
  ["A prioridade fica inspecionável", actionLink.includes("data-atlas-action-priority={priority}") && config.sharedContract.priorityValues.length === 2],
  ["PageHeader limita a declaração a uma ação", pageHeader.includes("action?: PageHeaderAction") && !pageHeader.includes("actions?: ReactNode") && config.sharedContract.maximumActionsPerPageHeader === 1],
  ["PageHeader usa o componente compartilhado", pageHeader.includes("<AtlasActionLink") && pageHeader.includes('aria-label="Ação principal do contexto"')],
  ["Treze cabeçalhos ou heróis possuem ação primária governada", standardizedHeaderActions + customCustomerPrimaryAction === 13 && config.auditedConsumers.pageHeadersMigrated === 13],
  ["Nenhum cabeçalho auditado aceita montagem manual", manualHeaderActions === 0 && config.auditedConsumers.manualActionsPropRemaining === 0],
  ["Aprofundamentos permanecem secundários", secondaryHeaderActions === 12 && config.auditedConsumers.secondaryHeaderActions === 12],
  ["Criação de cliente permanece primária", (customers.includes('action={{ href: "/leads/new", label: "Novo cliente", icon: "＋" }}') || customCustomerPrimaryAction === 1) && config.auditedConsumers.customerCreationRemainsPrimary === true],
  ["Topbar usa o mesmo componente como ação primária", topbar.includes("<AtlasActionLink") && topbar.includes('priority="primary"') && topbar.includes("getAtlasTaskActionForPathname")],
  ["Nome acessível e decoração estão separados", actionLink.includes('aria-label={props["aria-label"] ?? label}') && actionLink.includes('aria-hidden="true"') && config.accessibility.optionalArrowIsDecorative === true],
  ["Ação preserva densidade sem cortar o nome acessível", styles.includes(".atlas-action-label") && styles.includes("text-overflow: ellipsis") && styles.includes(".atlas-page-action")],
  ["Alvo de página e adaptação móvel estão definidos", styles.includes("min-height: 44px") && styles.includes(".atlas-page-actions > * { flex: 1 1 auto; }") && config.visualBehavior.pageActionMinimumTargetPx === 44],
  ["Destinos, rotas e RBAC permanecem intactos", config.navigationDestinationsChanged === false && config.safetyPolicy.rbacPreserved === true && config.exitCriteria.routeRemoved === false && config.exitCriteria.permissionChanged === false],
  ["Métrica comportamental não foi inventada", config.measurementPolicy.inventedBehaviorMetricAllowed === false && config.measurementPolicy.structuralConsistencyIsRuntimeProof === false],
  ["Relatório documenta contrato, limite e próxima fase", report.includes("13 cabeçalhos") && report.includes("no máximo uma ação") && report.includes("não comprova aumento de conversão") && report.includes("Fase 029")],
  ["Gate de homologação não foi contornado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 028 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 028 aprovada: uma ação declarativa por cabeçalho, prioridade visual explícita e destinos preservados.");

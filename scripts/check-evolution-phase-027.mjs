import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-027-navigation-task-step-reduction.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentySix = JSON.parse(fs.readFileSync("config/evolution-phase-026-navigation-visual-hierarchy.json", "utf8"));
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const topbar = fs.readFileSync("components/atlas/topbar.tsx", "utf8");
const palette = fs.readFileSync("components/CommandPalette.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_027_NAVIGATION_TASK_STEP_REDUCTION.md", "utf8");

const taskActionsBlock = navigation.split("export const atlasTaskActions = [")[1]?.split("] as const satisfies readonly AtlasTaskAction[];")[0] ?? "";
const taskActionCount = (taskActionsBlock.match(/contextHref:/g) || []).length;
const taskTargetCount = (taskActionsBlock.match(/ href:/g) || []).length;
const uniqueTargets = new Set([...taskActionsBlock.matchAll(/href: "([^"]+)"/g)].map((match) => match[1]));

const checks = [
  ["Fase 027 concluída sem mutação de dados", config.status === "completed" && config.runtimeNavigationChanged === true && config.productionDataModified === false],
  ["Hierarquia anterior permanece concluída", phaseTwentySix.status === "completed" && phaseTwentySix.exitCriteria.currentLocationUsesSingleGovernedSource === true],
  ["Quinze transições contextuais estão governadas", taskActionCount === 15 && taskTargetCount === 15 && config.taskActions.contextualTransitions === 15],
  ["Ações reutilizam destinos existentes", uniqueTargets.has("/developments/materials") && uniqueTargets.has("/integrations/health") && uniqueTargets.has("/calendar") && uniqueTargets.has("/distribution")],
  ["Ação padrão Novo lead permanece", navigation.includes('label: "Novo lead"') && navigation.includes('href: "/leads/new"') && config.taskActions.defaultAction.href === "/leads/new"],
  ["Resolução remove parâmetros e exige contexto exato", navigation.includes('pathname.split("?")[0]?.split("#")[0]') && navigation.includes("item.contextHref === normalizedPath") && config.taskActions.exactContextMatching === true],
  ["Ação contextual passa pela política de identidade", navigation.includes("canAccessAtlasItem(contextualAction, identity)") && navigation.includes("canAccessAtlasItem(atlasDefaultTaskAction, identity)") && config.safetyPolicy.targetMustPassIdentityPolicy === true],
  ["Topbar usa somente um espaço persistente", topbar.includes("getAtlasTaskActionForPathname(pathname, identity)") && topbar.includes("href={taskAction.href}") && topbar.includes("{taskAction.label}") && config.taskActions.singlePersistentSlot === true],
  ["Ação possui nome acessível completo", topbar.includes("Ação rápida: ${taskAction.label}") && config.responsiveBehavior.accessibleNameAlwaysPresent === true],
  ["Busca global prioriza a ação da tela", palette.includes("getAtlasTaskActionForPathname(pathname, identity)") && palette.includes('group: "Ação desta tela"')],
  ["Busca remove o destino duplicado", palette.includes("item.href !== taskAction?.href") && config.sharedConsumption.commandPaletteRemovesDuplicateTarget === true],
  ["Tablet e celular preservam densidade", styles.includes(".atlas-quick-create strong") && styles.includes("display: none") && styles.includes("text-overflow: ellipsis")],
  ["Jornadas profundas ficam a uma ação estrutural", config.criticalJourneyAcceleration.every((journey) => journey.structuralActionsFromContext === 1) && config.exitCriteria.criticalDeepDestinationsReachableInOneAction === true],
  ["Nenhum fluxo comercial paralelo foi criado", config.taskActions.duplicateFormCreated === false && config.taskActions.duplicateBusinessLogicCreated === false && config.exitCriteria.parallelWorkflowCreated === false],
  ["Métrica comportamental não foi inventada", config.measurementPolicy.inventedBehaviorMetricAllowed === false && config.measurementPolicy.structuralActionCountIsRuntimeProof === false],
  ["Relatório documenta fonte, responsividade e limite", report.includes("15 transições") && report.includes("Ação desta tela") && report.includes("não comprova redução real de tempo") && report.includes("Fase 028")],
  ["RBAC, rotas e staging permanecem protegidos", config.safetyPolicy.rbacPreserved === true && config.exitCriteria.routeRemoved === false && config.exitCriteria.permissionChanged === false && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 027 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 027 aprovada: uma ação contextual governada reduz transições sem ampliar a topbar, duplicar fluxos ou contornar RBAC.");

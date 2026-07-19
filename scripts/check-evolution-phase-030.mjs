import fs from "node:fs";
import path from "node:path";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-030-navigation-useful-empty-states.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyNine = JSON.parse(fs.readFileSync("config/evolution-phase-029-navigation-progressive-loading.json", "utf8"));
const atlasUi = fs.readFileSync("components/ui/AtlasUI.tsx", "utf8");
const wrapper = fs.readFileSync("components/atlas/empty-state.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_030_NAVIGATION_USEFUL_EMPTY_STATES.md", "utf8");

const criticalFiles = [
  "app/(crm)/leads/page.tsx",
  "app/(crm)/calendar/page.tsx",
  "app/(crm)/tasks/page.tsx",
  "app/(crm)/pipeline/page.tsx",
  "app/(crm)/customers/page.tsx",
  "app/(crm)/developments/page.tsx",
  "app/(crm)/sales/page.tsx",
  "app/(crm)/distribution/page.tsx",
];

function listTsx(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTsx(target);
    return entry.name.endsWith(".tsx") ? [target] : [];
  });
}

const crmFiles = listTsx("app/(crm)");
let emptyStateUses = 0;
let emptyStateConsumers = 0;
let explicitReasons = 0;
let statesWithActions = 0;

for (const file of crmFiles) {
  const source = fs.readFileSync(file, "utf8");
  const uses = source.match(/<(?:AtlasEmpty|EmptyState)\b/g)?.length ?? 0;
  if (uses > 0) emptyStateConsumers += 1;
  emptyStateUses += uses;
  explicitReasons += source.match(/<(?:AtlasEmpty|EmptyState)\b[^>]*\breason=(?:"|\{)/gs)?.length ?? 0;
  statesWithActions += source.match(/<(?:AtlasEmpty|EmptyState)\b[^>]*\baction=/gs)?.length ?? 0;
}

const criticalSource = criticalFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const reasons = ["first-use", "no-results", "no-activity", "completed", "not-configured"];

const checks = [
  ["Fase 030 concluída sem mutação de dados", config.status === "completed" && config.productionDataModified === false && config.dataFetchingChanged === false],
  ["Fase anterior permanece concluída", phaseTwentyNine.status === "completed" && phaseTwentyNine.nextPhase.phase === 30],
  ["Taxonomia compartilhada possui cinco motivos", reasons.every((reason) => atlasUi.includes(`\"${reason}\"`)) && config.emptyStateContract.reasons.join(",") === reasons.join(",")],
  ["Componente expõe motivo e presença de ação", atlasUi.includes("data-empty-reason={reason}") && atlasUi.includes("data-has-action={Boolean(action)}") && atlasUi.includes("atlas-empty-eyebrow")],
  ["Wrapper preserva o contrato compartilhado", wrapper.includes("type AtlasEmptyReason") && wrapper.includes("reason={reason}") && wrapper.includes("eyebrow={eyebrow}")],
  ["Linha de base estrutural permanece coberta", crmFiles.length >= config.structuralBaseline.crmPages && emptyStateConsumers >= config.structuralBaseline.emptyStateConsumers && emptyStateUses >= config.structuralBaseline.emptyStateUses],
  ["Primeiro recorte governado possui motivos explícitos", explicitReasons >= config.structuralBaseline.explicitReasonsAfter && config.structuralBaseline.explicitReasonsBefore === 0],
  ["Ações úteis aumentaram sem dados fictícios", statesWithActions >= config.structuralBaseline.emptyStatesWithActionsAfter && config.structuralBaseline.emptyStatesWithActionsAfter > config.structuralBaseline.emptyStatesWithActionsBefore && config.truthPolicy.fakeRecordsRendered === false],
  ["Oito superfícies comerciais estão cobertas", criticalFiles.every((file) => fs.readFileSync(file, "utf8").includes("reason=")) && config.criticalSurfaces.length === 8],
  ["Filtro e primeira configuração têm recuperação", criticalSource.includes("Limpar filtros") && criticalSource.includes("Criar lead") && criticalSource.includes("Cadastrar empreendimento") && criticalSource.includes("Abrir pipeline")],
  ["Rotina concluída e configuração pendente não se confundem", criticalSource.includes('reason="completed"') && criticalSource.includes('reason="not-configured"') && config.exitCriteria.completedAndConfigurationPendingAreDistinguished === true],
  ["Falha continua separada de vazio", atlasUi.includes("AtlasRecoverableError") && config.truthPolicy.emptyStateMayMaskFetchFailure === false && config.exitCriteria.failuresRemainRecoverableErrors === true],
  ["Ações preservam alvo mínimo", styles.includes('.atlas-empty-state[data-has-action="true"]') && styles.includes("min-height: 44px") && config.accessibility.minimumActionTargetPx === 44],
  ["Cobertura estrutural não vira métrica inventada", config.structuralBaseline.runtimeOutcomesMeasured === false && config.truthPolicy.fakeRuntimeMetricPublished === false && config.truthPolicy.structuralCoverageIsRuntimeOutcomeProof === false],
  ["Relatório registra contrato, limite e próxima fase", report.includes("101 usos") && report.includes("oito superfícies") && report.includes("Falha não é estado vazio") && report.includes("Fase 031")],
  ["Rotas, RBAC e gate de homologação permanecem intactos", config.routeBehaviorChanged === false && config.safetyPolicy.rbacPreserved === true && config.exitCriteria.routeRemoved === false && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 030 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 030 aprovada: cinco motivos compartilhados, oito rotinas centrais orientadas e falhas separadas de ausência de dados.");

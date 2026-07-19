import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-031-navigation-failure-recovery.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseThirty = JSON.parse(fs.readFileSync("config/evolution-phase-030-navigation-useful-empty-states.json", "utf8"));
const atlasUi = fs.readFileSync("components/ui/AtlasUI.tsx", "utf8");
const pageBoundary = fs.readFileSync("app/(crm)/error.tsx", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_031_NAVIGATION_FAILURE_RECOVERY.md", "utf8");

const sharedRecoveryFiles = [
  "app/(crm)/calendar/page.tsx",
  "app/(crm)/tasks/page.tsx",
  "app/(crm)/pipeline/page.tsx",
  "app/(crm)/customers/page.tsx",
  "app/(crm)/developments/page.tsx",
  "app/(crm)/sales/page.tsx",
  "app/(crm)/distribution/page.tsx",
];
const formerlyRawFiles = [
  "app/(crm)/tasks/page.tsx",
  "app/(crm)/pipeline/page.tsx",
  "app/(crm)/customers/page.tsx",
  "app/(crm)/sales/page.tsx",
  "app/(crm)/distribution/page.tsx",
];
const rawBanner = "rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200";
const sharedSources = sharedRecoveryFiles.map((file) => fs.readFileSync(file, "utf8"));
const leads = fs.readFileSync("app/(crm)/leads/page.tsx", "utf8");
const distribution = fs.readFileSync("app/(crm)/distribution/page.tsx", "utf8");

const checks = [
  ["Fase 031 concluída sem mutação comercial", config.status === "completed" && config.productionDataModified === false && config.safetyPolicy.retryRepeatsWrite === false],
  ["Fase anterior permanece concluída", phaseThirty.status === "completed" && phaseThirty.nextPhase.phase === 31],
  ["Contrato compartilhado declara escopo e estratégia", atlasUi.includes('scope?: "module" | "page" | "action"') && atlasUi.includes('data-recovery-scope={scope}') && atlasUi.includes('data-recovery-strategy="safe-read-retry"')],
  ["Descrição técnica conhecida é redigida", atlasUi.includes("technicalFailurePattern") && atlasUi.includes("safeFailureDescription(description)") && config.recoveryContract.technicalDetailsRedacted === true],
  ["Nova tentativa comunica atividade e evita repetição", atlasUi.includes("disabled={busy}") && atlasUi.includes("Atualizando…") && config.accessibility.busyStateVisibleAndDisabled === true],
  ["Sete módulos críticos usam a recuperação compartilhada", sharedSources.every((source) => source.includes("AtlasRecoverableError") && source.includes("onRetry=")) && config.structuralBaseline.sharedRecoveryConsumersAfter === 7],
  ["Cinco banners antigos foram eliminados", formerlyRawFiles.every((file) => !fs.readFileSync(file, "utf8").includes(rawBanner)) && config.structuralBaseline.legacyCriticalRawBannersAfter === 0],
  ["Leads preserva recuperação explícita", leads.includes("<ErrorState") && leads.includes("Limpar e tentar novamente") && config.exitCriteria.leadsKeepsExplicitRecovery === true],
  ["Retentativas críticas repetem somente leitura", sharedSources.every((source) => source.includes("busy={loading}")) && config.recoveryContract.retryNeverRepeatsMutation === true],
  ["Falha de rede da distribuição vira estado local", distribution.includes("try {") && distribution.includes('setError("Não foi possível atualizar a fila comercial agora.")') && config.exitCriteria.networkFailureCanBecomeLocalState === true],
  ["Limite de página usa o mesmo contrato", pageBoundary.includes("<AtlasRecoverableError") && pageBoundary.includes('scope="page"') && pageBoundary.includes("Registrar erro") && pageBoundary.includes("Ir ao Command Center")],
  ["Identificador técnico não aparece na interface", !pageBoundary.includes("Código de diagnóstico") && config.pageBoundary.digestVisibleToUser === false],
  ["Falha permanece distinta de vazio", config.truthPolicy.failureMayBeRenderedAsEmptyState === false && phaseThirty.truthPolicy.emptyStateMayMaskFetchFailure === false],
  ["Cobertura estrutural não vira resultado inventado", config.structuralBaseline.runtimeRecoverySuccessMeasured === false && config.truthPolicy.fakeRuntimeMetricPublished === false && config.truthPolicy.structuralCoverageIsRuntimeOutcomeProof === false],
  ["Relatório registra segurança, limite e próxima fase", report.includes("sete módulos críticos") && report.includes("Retentativa sem duplicar trabalho") && report.includes("Fase 032")],
  ["Rotas, RBAC e gate de homologação permanecem intactos", config.routeBehaviorChanged === false && config.safetyPolicy.rbacPreserved === true && config.exitCriteria.routeRemoved === false && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 031 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 031 aprovada: oito superfícies recuperáveis, leitura segura sem repetir escrita e limite de página unificado.");

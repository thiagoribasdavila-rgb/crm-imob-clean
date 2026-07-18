import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-042-project-decision-workspace.json", "utf8"));
const previous = JSON.parse(fs.readFileSync("config/evolution-phase-041-customer-relationship-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const checkpoint = JSON.parse(fs.readFileSync("config/evolution-zip-checkpoints.json", "utf8"));
const page = fs.readFileSync("app/(crm)/developments/page.tsx", "utf8");
const api = fs.readFileSync("app/api/v1/launch-os/route.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const packageScript = fs.readFileSync("scripts/package-evolution-checkpoint.mjs", "utf8");
const hostingerPackager = fs.readFileSync("scripts/package-hostinger.mjs", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_042_PROJECT_DECISION_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 042 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha Projetos", previous.nextPhase.phase === 42 && previous.nextPhase.status === "planned"],
  ["Projetos declara decisão como primeira leitura", page.includes('data-evolution-phase="42"') && page.includes('data-projects-layout="decision-first"') && page.includes("FASE 42 · PROJETOS")],
  ["Primeira visão usa quatro sinais comerciais", config.informationHierarchy.signals.length === 4 && (page.match(/<AtlasMetric/g) || []).length === 4],
  ["Revisão humana limita três projetos", api.includes(".slice(0, 3)") && page.includes("Até três decisões objetivas") && config.projectContract.visiblePriorityLimit === 3],
  ["Materiais exigem versão atual, vigência e validação", api.includes('status === "verified"') && api.includes("row.is_current !== false") && api.includes("validUntil >= today") && config.projectContract.verifiedCurrentMaterialsOnly === true],
  ["Kit comercial usa book, tabela e espelho", api.includes('"book", "price_table", "sales_mirror"') && config.projectContract.essentialMaterialKit.length === 3],
  ["Módulos opcionais não derrubam o portfólio", api.includes("moduleHealth") && api.includes("optionalStatus") && config.compatibility.optionalModuleFailureBreaksPortfolio === false],
  ["Fonte canônica e legado respeitam organização", api.includes('from("developments")') && api.includes('from("projects")') && api.includes('eq("organization_id", organizationId)') && api.includes("mapLegacyProject")],
  ["Pipeline legado permanece compatível", api.includes('from("opportunities")') && api.includes('from("leads")') && api.includes("leadAsOpportunity")],
  ["API usa contexto autenticado e RLS", api.includes("requireAccessContext") && api.includes("identity.supabase") && !api.includes("getSupabaseAdmin") && config.safetyPolicy.authenticatedRlsClientUsed === true],
  ["API é somente leitura", !api.includes(".insert(") && !api.includes(".update(") && !api.includes(".delete(") && config.projectContract.readOnly === true],
  ["Gestão avançada fica progressivamente revelada", page.includes("<details") && page.includes("Mais gestão") && page.includes("Saúde das conexões") && config.informationHierarchy.managementActionsProgressivelyDisclosed === true],
  ["Busca, segmentos e recuperação permanecem", page.includes("Buscar projeto, incorporadora ou região") && page.includes('aria-pressed={segment === item.id}') && page.includes("Limpar filtros") && page.includes("AtlasRecoverableError")],
  ["Layout preserva toque, celular e movimento reduzido", styles.includes("/* Fase 042 — Projetos") && styles.includes(".atlas-project-card") && styles.includes("min-height: 44px") && styles.includes("@media (prefers-reduced-motion: reduce)")],
  ["Nenhuma decisão automática foi adicionada", page.includes("Nenhuma alteração é executada automaticamente") && config.executionPolicy.automaticProjectHomologation === false && config.executionPolicy.automaticCommercialDecision === false],
  ["Checkpoint ocorre a cada cinquenta fases", checkpoint.interval === 50 && checkpoint.checkpoints.length === 20 && checkpoint.nextCheckpoint === 50 && packageScript.includes("phase % policy.interval")],
  ["ZIP preserva versões e exclui dados privados", checkpoint.preservePreviousArtifacts === true && checkpoint.privateDataPolicy.envLocalIncluded === false && hostingerPackager.includes("rmSync(stage") && !hostingerPackager.includes("rmSync(outputRoot, { recursive: true")],
  ["Relatório registra checkpoint e próxima fase", report.includes("atlas-v3-phase-050-hostinger.zip") && report.includes("Fase 043") && config.nextPhase.phase === 43],
  ["RBAC, tenant e gate de homologação permanecem", config.safetyPolicy.rbacPreserved === true && config.safetyPolicy.tenantIsolationPreserved === true && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 042 verificada: Projetos resilientes, materiais vigentes e decisões explicáveis.");

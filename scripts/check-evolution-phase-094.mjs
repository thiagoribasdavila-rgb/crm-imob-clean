import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-093-canonical-surface-navigation.json");
const phase = json("config/evolution-phase-094-supabase-live-contract-audit.json");
const capabilities = json("config/atlas-core-v2-live-data-capabilities.json");
const contracts = json("config/atlas-core-v2-contracts.json");
const program = json("config/evolution-program-3000.json");
const report = read("docs/EVOLUTION_PHASE_094_SUPABASE_LIVE_CONTRACT_AUDIT.md");

const moduleIds = capabilities.moduleReadiness.map((item) => item.module);
const requiredModules = contracts.pageRules.requiredModules;
const adapterRequired = capabilities.moduleReadiness.filter((item) => item.status === "adapter-required");
const blocked = capabilities.moduleReadiness.filter((item) => item.status === "blocked");

const checks = [
  ["Fase 93 foi preservada", previous.phase === 93 && previous.status === "completed"],
  ["Fase 94 foi somente leitura", phase.phase === 94 && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false && phase.evidence.mutatingActions === 0],
  ["Programa contínuo avançou para 94", program.currentPhase >= 94],
  ["Projeto vivo configurado foi confirmado", capabilities.connection.configuredProjectMatched === true && capabilities.connection.status === "ACTIVE_HEALTHY"],
  ["Diferença de migrations é explícita e bloqueia aplicação em lote", capabilities.connection.localMigrationFiles === 122 && capabilities.connection.appliedMigrations === 33 && capabilities.connection.unappliedLocalMigrationFiles === 89 && capabilities.connection.bulkMigrationAllowed === false],
  ["Schema vivo foi inventariado", capabilities.liveSchema.tables === 23 && capabilities.liveSchema.views === 1 && capabilities.liveSchema.tablesWithRls === 23],
  ["Referências do código foram cruzadas com o banco", capabilities.liveSchema.applicationReferencedTables === 85 && capabilities.liveSchema.applicationReferencedTablesPresent === 13 && capabilities.liveSchema.applicationReferencedTablesAbsent === 72],
  ["Matriz cobre exatamente os 19 módulos Core V2", moduleIds.length === 19 && requiredModules.length === 19 && requiredModules.every((id) => moduleIds.includes(id))],
  ["Classificação de prontidão é consistente", adapterRequired.length === 12 && blocked.length === 7 && capabilities.readinessSummary.fullyHomologatedByThisAudit === 0],
  ["Domínios físicos ausentes estão explícitos", capabilities.missingPhysicalDomains.length === 7],
  ["Paridade Auth/Profile foi comprovada sem alterar contas", capabilities.tenantHealth.authUsers === 4 && capabilities.tenantHealth.profiles === 4 && capabilities.tenantHealth.authUsersWithoutProfile === 0 && capabilities.tenantHealth.profilesWithoutAuthUser === 0],
  ["Nenhum registro crítico está sem organização", capabilities.tenantHealth.profilesWithoutOrganization === 0 && capabilities.tenantHealth.leadsWithoutOrganization === 0 && capabilities.tenantHealth.tasksWithoutOrganization === 0],
  ["Base real de leads foi medida sem PII", capabilities.liveData.leads === 17151 && capabilities.liveData.importedLeads === 17148 && capabilities.liveData.assignedLeads === 2 && capabilities.liveData.leadsWithNextContact === 0],
  ["Calibração de IA não foi presumida", capabilities.liveData.aiLearningEvents === 0 && capabilities.liveData.leadScoreEvidenceRows === 2 && phase.importantTruths.includes("inline-score-presence-does-not-prove-ai-calibration")],
  ["Riscos de segurança e desempenho estão registrados", capabilities.security.warnings.length === 3 && capabilities.performance.unindexedForeignKeys === 15 && capabilities.performance.authRlsInitPlanWarnings === 2],
  ["Relatório cobre problema, evidência, impacto e riscos", report.includes("Problema resolvido") && report.includes("Evidência do banco vivo") && report.includes("Impacto operacional") && report.includes("Riscos identificados")],
  ["Build e ZIP continuam reservados à fase 100", phase.release.buildExecuted === false && phase.release.zipCreated === false && phase.release.checkpointPhase === 100]
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 094 verificada: Supabase vivo auditado em leitura, 19 módulos classificados e zero mutação executada.");

import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-019-evidence-correction.json", "utf8"));
const schemaAudit = fs.readFileSync("scripts/audit-runtime-schema.mjs", "utf8");
const hierarchyAudit = fs.readFileSync("scripts/audit-auth-hierarchy-runtime.mjs", "utf8");
const foundation = fs.readFileSync("supabase/migrations/20260711040000_atlas_v3_foundation.sql", "utf8");
const hierarchyMigration = fs.readFileSync("supabase/migrations/20260716212459_commercial_hierarchy_and_bulk_transfer.sql", "utf8");
const rbacMigration = fs.readFileSync("supabase/migrations/20260717200655_official_auth_rbac.sql", "utf8");
const bridgeMigration = fs.readFileSync("supabase/migrations/20260717213000_v3_legacy_runtime_schema_bridge.sql", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_019_SCHEMA_CORRECTION.md", "utf8");

const checks = [
  ["Fase concluída sem mutação", config.status === "completed" && config.productionDataModified === false && config.liveUsersModified === false],
  ["Auditoria de schema usa consultas vazias", schemaAudit.includes('select("*").limit(0)') && schemaAudit.includes("missingColumns")],
  ["Auditoria de schema detalha lacunas", schemaAudit.includes("migration_required") && schemaAudit.includes("table_missing")],
  ["Auditoria de hierarquia limita as colunas", hierarchyAudit.includes("baseColumns") && hierarchyAudit.includes("hierarchyColumns") && !hierarchyAudit.includes('.select("*")')],
  ["Hierarquia ausente não é presumida", hierarchyAudit.includes("hierarchyEvaluated") && hierarchyAudit.includes("A hierarquia não foi presumida")],
  ["Papéis legados usam aliases explícitos", hierarchyAudit.includes("legacyRoleAliases") && hierarchyAudit.includes('["corretor", "broker"]')],
  ["Migrações corretivas estão inventariadas", hierarchyMigration.includes("commercial_role") && rbacMigration.includes("access_role") && bridgeMigration.includes("full_name")],
  ["Fundação documental foi reconhecida", config.migrationReadiness.foundationMigrationIsDocumentationOnly === true && foundation.includes("This file documents")],
  ["Push direto permanece bloqueado", config.migrationReadiness.directDbPushAllowed === false && report.includes("Não executar `supabase db push` diretamente em produção")],
  ["Próxima fase exige prova runtime", config.exitCriteria.phaseTwentyRemainsBlockedUntilRuntimeApproval === true],
  ["Nenhum dado pessoal foi impresso", config.runtimeEvidence.personalDataPrinted === false],
  ["Contas e perfis legados correspondem", config.runtimeEvidence.authUsersDetected === config.runtimeEvidence.profilesDetected && config.runtimeEvidence.authUsersWithoutProfile === 0 && config.runtimeEvidence.profilesWithoutAuthUser === 0],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 019 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 019: evidências corrigidas e migração de produção mantida sob gate seguro.");

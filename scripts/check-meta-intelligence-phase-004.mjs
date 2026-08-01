import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-004.json"));
const audit = read("scripts/audit-meta-schema-compatibility.mjs");
const report = read("docs/META_SCHEMA_COMPATIBILITY_PLAN.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 4 && config.mode === "read_only_plan", "configuracao da Fase 4 invalida");
expect(config.status === "blocked" && config.safeToApply === false, "implantacao deve permanecer bloqueada");
expect(config.baseline.unreconciledMigrationFiles > 0, "drift de migrations nao registrado");
expect(config.baseline.canonicalTableDifferences.length === 2, "divergencias canonicas incompletas");
expect(config.baseline.helperDifferences.length >= 4, "divergencias de helpers incompletas");
expect(config.reconciliationBundle.length === 6, "bundle de reconciliacao incompleto");
expect(config.reconciliationBundle.every((step, index) => step.order === index + 1 && step.applyNow === false), "ordem ou bloqueio do bundle invalido");
for (const gate of ["fresh_backup_available", "restore_rehearsal_evidenced", "staging_clone_dry_run_passed", "rls_and_grants_matrix_passed", "rollback_rehearsed", "director_approval_recorded"]) {
  expect(config.releaseGates.includes(gate), `gate obrigatorio ausente: ${gate}`);
}
expect(config.securityRequirements.explicitGrantsRequired && config.securityRequirements.rlsEnabledOnEveryExposedTable, "RLS e grants devem ser tratados juntos");
expect(config.governance.databaseMutation === false && config.governance.migrationApplication === false, "fase nao pode alterar banco");
expect(config.governance.campaignMutation === false && config.governance.realEventDelivery === false, "fase nao pode alterar Meta nem enviar evento");
expect(config.governance.buildExecuted === false, "build deve ficar reservado aos checkpoints");
for (const url of ["https://supabase.com/docs/guides/api/securing-your-api", "https://supabase.com/docs/guides/deployment/shared-responsibility-model", "https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically"]) {
  expect(config.officialReferences.includes(url), `referencia oficial ausente: ${url}`);
}
for (const marker of ["destructivePattern", "sourceFilesWithGrantGap", "sourceFilesWithNonEmptySecurityDefinerPath", "sourceFilesWithInlineAttributionBackfill", "deploymentReady: false", "databaseMutation: false", "identifiersPrinted: false"]) {
  expect(audit.includes(marker), `controle de auditoria ausente: ${marker}`);
}
for (const marker of ["Fase 4/100", "90 migrations", "RLS + grants", "Não aplicar", "rollback", "Fase 5/100"]) {
  expect(report.includes(marker), `relatorio incompleto: ${marker}`);
}
expect(packageJson.scripts["meta:phase-004:audit"]?.includes("audit-meta-schema-compatibility.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-004:check"]?.includes("check-meta-intelligence-phase-004.mjs"), "gate da Fase 4 ausente");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 4: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 4: aprovada — compatibilidade, seguranca, backup e rollback planejados sem alterar o banco.");

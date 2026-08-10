import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-017.json"));
const previous = JSON.parse(read(config.sourceBaseline));
const catalogTemplate = JSON.parse(read(config.catalogEvidenceTemplate));
const combinedTemplate = JSON.parse(read(config.combinedEvidenceTemplate));
const packageJson = JSON.parse(read("package.json"));
const migration = read(config.migrationDraft);
const query = read(config.catalogQuery);
const runner = read(config.reconciliationRunner);
const preflight = read(config.evidencePreflight);
const audit = read(config.staticAudit);
const report = read(config.documentation);
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 17 && config.mode === "read_only_catalog_grants_rls_reconciliation", "configuracao da Fase 17 invalida");
expect(config.status === "local_contract_audited_branch_evidence_pending" && config.safeToApply === false, "Fase 17 liberou aplicacao indevida");
expect(previous.phase === 16 && previous.status === "reconciliation_pipeline_ready", "baseline da Fase 16 invalido");
expect(config.environmentAudit.remoteCallsExecuted === false && config.environmentAudit.isolatedCredentialsDetected === false, "auditoria de ambiente divergente");
expect(config.catalogContract.queryReadOnly && config.catalogContract.catalogOnly && config.catalogContract.rowDataRead === false, "consulta catalogal nao esta protegida");
expect(config.catalogContract.rlsRequired && config.catalogContract.updateUsingAndWithCheckRequired, "contrato RLS incompleto");
expect(config.catalogContract.leadDeleteAllowed === false, "DELETE de leads foi liberado");
expect(config.releaseGate.localExplicitGrantContractPassed, "contrato explicito local nao foi aprovado");
expect(config.releaseGate.branchCatalogExecuted === false && config.releaseGate.dataApiGrantsRlsApproved === false, "evidencia remota foi alegada sem branch");
expect(config.releaseGate.productionReady === false && config.releaseGate.deploymentReady === false, "producao liberada indevidamente");
expect(config.governance.databaseMutation === false && config.governance.migrationApplication === false, "banco remoto nao pode ser alterado");
expect(config.governance.realMetaEventDelivery === false && config.governance.campaignMutation === false, "Meta nao pode ser alterada");
expect(config.governance.buildExecuted === false, "build nao deve rodar nesta fase");

for (const [script, marker] of [
  ["meta:phase-017:audit", "audit-meta-data-api-access.mjs"],
  ["meta:phase-017:postgres", "test-meta-data-api-access-postgres.mjs"],
  ["meta:phase-017:reconcile", "run-meta-data-api-access-reconciliation.mjs"],
  ["meta:phase-017:preflight", "preflight-meta-data-api-access.mjs"],
  ["meta:phase-017:check", "check-meta-intelligence-phase-017.mjs"],
]) expect(packageJson.scripts?.[script]?.includes(marker), `script ausente: ${script}`);

for (const marker of [
  "grant select (id, name, slug, plan, active)",
  "grant update (name, slug)",
  "grant update (name, full_name, avatar_url, phone, creci, bio, updated_at)",
  "grant select, insert, update on table public.leads to authenticated",
]) expect(migration.includes(marker), `rascunho sem contrato: ${marker}`);

for (const marker of [
  "pg_policies",
  "has_table_privilege",
  "has_column_privilege",
  "anonymousPrivilegesRevoked",
  "leadDeleteNotGranted",
  "updatePoliciesHaveUsingAndWithCheck",
]) expect(query.includes(marker), `consulta sem controle: ${marker}`);

for (const marker of [
  "validateMetaAuthReconciliationEvidence",
  "validateMetaDataApiCatalogEvidence",
  "validateMetaDataApiAccessEvidence",
  "ATLAS_PHASE16_RECONCILIATION_EVIDENCE_FILE",
  "ATLAS_PHASE17_CATALOG_EVIDENCE_FILE",
  "dataApiGrantsRlsApproved",
  "productionAllowed: false",
]) expect(runner.includes(marker), `reconciliador sem contrato: ${marker}`);

expect(preflight.includes("forbidden_material_detected") && preflight.includes("leadDeleteNotGranted"), "preflight nao protege segredo ou menor privilegio");
expect(audit.includes("prova catalogal somente leitura"), "auditoria estatica incompleta");
expect(catalogTemplate.phase === 17 && catalogTemplate.passed === false && catalogTemplate.remoteExecutionPerformed === false, "template catalogal foi marcado como executado");
expect(combinedTemplate.phase === 17 && combinedTemplate.passed === false && combinedTemplate.releaseGates.dataApiGrantsRlsApproved === false, "template combinado abriu gate");

for (const marker of [
  "Fase 17/100",
  "Data API e RLS são controles diferentes",
  "organizations",
  "profiles.name",
  "somente leitura",
  "produção: bloqueada",
  "eventos Meta reais: bloqueados",
  "build: não executado",
]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);

const run = (args, label) => {
  const child = spawnSync(process.execPath, args, { cwd: new URL("..", import.meta.url), env: process.env, encoding: "utf8" });
  if (child.status !== 0) failures.push(`${label}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 700)}`);
};

run(["scripts/audit-meta-data-api-access.mjs"], "auditoria Data API/RLS");
run(["scripts/preflight-meta-data-api-access.mjs", "--self-test"], "autoteste do preflight");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 17: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 17: aprovada — contrato local e prova catalogal prontos; branch, producao, Meta e build continuam bloqueados.");

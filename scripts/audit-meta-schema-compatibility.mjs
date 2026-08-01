import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-004.json"));

const destructivePattern = /\b(drop\s+table|truncate\s+table|delete\s+from)\b/i;
const tablePattern = /create\s+table/i;
const rlsPattern = /enable\s+row\s+level\s+security/i;
const grantPattern = /\bgrant\b/i;
const revokePattern = /\brevoke\b/i;
const securityDefinerPattern = /security\s+definer/i;
const fixedSearchPathPattern = /set\s+search_path\s*=/i;
const emptySearchPathPattern = /set\s+search_path\s*=\s*''/i;
const inlineAttributionBackfillPattern = /insert\s+into\s+public\.lead_attribution_touches[\s\S]+select/i;

const migrations = config.sourceMigrationReview.map((item) => {
  const source = read(item.file);
  const createsTables = tablePattern.test(source);
  const hasSecurityDefiner = securityDefinerPattern.test(source);
  return {
    file: item.file.split("/").at(-1),
    purpose: item.purpose,
    decision: item.decision,
    createsTables,
    rlsDeclared: !createsTables || rlsPattern.test(source),
    explicitGrant: grantPattern.test(source),
    explicitRevoke: revokePattern.test(source),
    securityDefiner: hasSecurityDefiner,
    fixedSearchPath: !hasSecurityDefiner || fixedSearchPathPattern.test(source),
    emptySearchPath: !hasSecurityDefiner || emptySearchPathPattern.test(source),
    inlineAttributionBackfill: inlineAttributionBackfillPattern.test(source),
    destructiveStatementDetected: destructivePattern.test(source),
    recordedRisks: item.risks.length,
  };
});

const findings = {
  migrationLedgerDrift: config.baseline.unreconciledMigrationFiles > 0,
  canonicalNamesNeedReconciliation: config.baseline.canonicalTableDifferences.length > 0,
  helperLocationsNeedReconciliation: config.baseline.helperDifferences.length > 0,
  runtimeKernelAbsent: config.baseline.missingRuntimeTables.length > 0,
  sourceFilesWithGrantGap: migrations.filter((item) => item.createsTables && (!item.explicitGrant || !item.explicitRevoke)).length,
  sourceFilesWithNonEmptySecurityDefinerPath: migrations.filter((item) => item.securityDefiner && !item.emptySearchPath).length,
  sourceFilesWithInlineAttributionBackfill: migrations.filter((item) => item.inlineAttributionBackfill).length,
  sourceFilesWithUnsafeInlineDataChange: migrations.filter((item) => item.destructiveStatementDetected).length,
};

const mandatoryGatesPresent = [
  "fresh_backup_available",
  "restore_rehearsal_evidenced",
  "staging_clone_dry_run_passed",
  "rls_and_grants_matrix_passed",
  "rollback_rehearsed",
  "director_approval_recorded",
].every((gate) => config.releaseGates.includes(gate));

const expectedBlocked = config.status === "blocked"
  && config.safeToApply === false
  && config.reconciliationBundle.every((step) => step.applyNow === false);

console.log(JSON.stringify({
  phase: config.phase,
  mode: config.mode,
  migrations,
  findings,
  readiness: {
    planComplete: config.reconciliationBundle.length === 6 && mandatoryGatesPresent,
    sourceMigrationsSafeToApplyDirectly: false,
    reconciliationBundleImplemented: false,
    deploymentReady: false,
    expectedBlocked,
  },
  governance: {
    databaseMutation: false,
    migrationApplication: false,
    metaMutation: false,
    identifiersPrinted: false,
    personalDataPrinted: false,
    secretsPrinted: false,
  },
}, null, 2));

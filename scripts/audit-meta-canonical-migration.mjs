import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-011.json"));
const draftPath = config.cli.draftPath;
const activePath = config.cli.activeQueuePath;
const sql = read(draftPath);
const executableSql = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const position = (pattern) => sql.search(pattern);
const before = (first, second) => position(first) >= 0 && position(second) >= 0 && position(first) < position(second);
const has = (pattern) => pattern.test(sql);
const destructivePatterns = {
  dropTable: /\bdrop\s+table\b/i,
  dropColumn: /\bdrop\s+column\b/i,
  truncate: /\btruncate\b/i,
  deleteRows: /\bdelete\s+from\b/i,
};
const destructiveMatches = Object.fromEntries(
  Object.entries(destructivePatterns).map(([name, pattern]) => [name, pattern.test(executableSql)])
);

const checks = {
  draftExists: existsSync(resolve(root, draftPath)),
  activeQueueClean: !existsSync(resolve(root, activePath)),
  transactional: /(?:^|\n)begin;/i.test(sql) && /commit;\s*$/i.test(sql),
  stagingGuard: has(/app\.atlas_reconciliation_environment/i) && has(/staging_clone/i),
  boundedExecution: has(/lock_timeout/i) && has(/statement_timeout/i),
  noDestructiveDataStatements: Object.values(destructiveMatches).every((value) => value === false),
  scoreDefaultDroppedBeforeBackfill: before(/alter column score drop default/i, /set score = score_ia/i),
  scoreNotNullDroppedBeforeBackfill: before(/alter column score drop not null/i, /set score = score_ia/i),
  scoreDefaultRestoredAfterBackfill: before(/update public\.leads set score = 0 where score is null/i, /alter column score set default 0/i),
  scoreNotNullRestoredAfterBackfill: before(/update public\.leads set score = 0 where score is null/i, /alter column score set not null/i),
  ownerDualWriteSpecified: has(/assigned_user_id[\s\S]*assigned_to/i) && has(/lead_contract_conflict:owner/i),
  projectDualWriteSpecified: has(/project_id[\s\S]*development_id/i) && has(/lead_contract_conflict:project/i),
  scoreDualWriteSpecified: has(/score_ia[\s\S]*score/i) && has(/lead_contract_conflict:score/i),
  guardedTriggerSpecified: has(/before insert or update of assigned_user_id, assigned_to, project_id, development_id, score_ia, score/i),
  unknownRoleBlocked: has(/atlas_reconciliation_unknown_legacy_role/i),
  reportsToNotInferred: !/set\s+reports_to\s*=/i.test(executableSql),
  rowLevelSecurityEnabled: has(/alter table public\.profiles enable row level security/i) && has(/alter table public\.leads enable row level security/i),
  explicitPrivilegesVersioned: has(/revoke all on table public\.profiles, public\.leads from authenticated/i)
    && has(/grant select \(/i)
    && has(/grant select, insert, update on table public\.leads to authenticated/i),
  serviceRoleRetained: has(/grant all on table public\.profiles, public\.leads to service_role/i),
};

const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {
  phase: 11,
  migration: {
    draftPath,
    activePath,
    promotedToActiveQueue: false,
  },
  checks,
  destructiveMatches,
  staticAuditPassed: failedChecks.length === 0,
  failedChecks,
  databaseSemanticsExecuted: false,
  stagingApproved: false,
  migrationReady: false,
  deploymentReady: false,
};

console.log(JSON.stringify(report, null, 2));
if (failedChecks.length || process.argv.includes("--strict-ready")) process.exit(1);

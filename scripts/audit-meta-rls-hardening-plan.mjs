import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMetaHardeningEvidence } from "./preflight-meta-rls-hardening-plan.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (file) => readFileSync(resolve(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const phase = readJson("config/meta-intelligence-phase-009.json");
const previous = readJson(phase.sourceBaseline);
const baseline = readJson(previous.baselineFixture);
const plan = readJson(phase.hardeningPlan);
const evidence = readJson(phase.executionEvidenceTemplate);
const migrationSources = phase.existingMigrationEvidence.map((file) => ({ file, source: read(file) }));
const proposalSql = read(phase.catalogAuditSql);

const hierarchyMigration = migrationSources.find((item) => item.file.includes("commercial_hierarchy_and_bulk_transfer"));
const hierarchyEnforcement = migrationSources.find((item) => item.file.includes("secure_commercial_profile_hierarchy"));
const officialRbac = migrationSources.find((item) => item.file.includes("official_auth_rbac"));
const remoteProfileColumns = baseline.remoteColumns["public.profiles"] ?? [];
const remoteLeadColumns = baseline.remoteColumns["public.leads"] ?? [];
const privilegedFunction = baseline.privilegedFunctions.find((item) => item.name === "public.search_knowledge_chunks");
const evidenceResult = validateMetaHardeningEvidence(evidence);
const sqlWithoutComments = proposalSql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--.*$/gm, "");
const mutationPattern = /\b(create|alter|drop|truncate|insert|update|delete|grant|revoke|comment)\b/i;

const localContract = {
  commercialRoleColumn: hierarchyMigration?.source.includes("add column if not exists commercial_role text") === true,
  reportsToColumn: hierarchyMigration?.source.includes("add column if not exists reports_to uuid") === true,
  profileVisibilityHelper: hierarchyMigration?.source.includes("private.can_view_commercial_profile") === true,
  leadVisibilityHelper: hierarchyMigration?.source.includes("private.can_access_commercial_lead") === true,
  emptySearchPath: hierarchyMigration?.source.includes("set search_path = ''") === true,
  helperExecuteRestricted: hierarchyMigration?.source.includes("revoke all on function private.can_view_commercial_profile") === true,
  hierarchyTrigger: hierarchyEnforcement?.source.includes("validate_commercial_hierarchy") === true,
  authorizationFieldProtection: hierarchyEnforcement?.source.includes("protect_profile_authorization_fields") === true,
  accessRoleContract: officialRbac?.source.includes("add column if not exists access_role text") === true,
  legacyLeadAssignee: hierarchyMigration?.source.includes("assigned_to") === true,
};

const report = {
  phase: phase.phase,
  mode: phase.mode,
  status: phase.status,
  plan: {
    actionCount: plan.orderedActions.length,
    rollbackCount: plan.orderedActions.filter((item) => Boolean(item.rollback)).length,
    allActionsBlocked: plan.orderedActions.every((item) => item.ready === false),
    productionExecutionAllowed: plan.productionExecutionAllowed,
    legacyMigrationReplayAllowed: plan.legacyMigrationReplayAllowed,
  },
  localContract,
  remoteContract: {
    commercialRoleColumn: remoteProfileColumns.includes("commercial_role"),
    reportsToColumn: remoteProfileColumns.includes("reports_to"),
    accessRoleColumn: remoteProfileColumns.includes("access_role"),
    assignedToColumn: remoteLeadColumns.includes("assigned_to"),
    assignedUserIdColumn: remoteLeadColumns.includes("assigned_user_id"),
    separateStagingDetected: previous.observedBaseline.separateStagingProjectDetected,
  },
  drift: {
    hierarchyMigrationExistsLocally: localContract.commercialRoleColumn && localContract.reportsToColumn,
    hierarchyMissingRemotely: !remoteProfileColumns.includes("commercial_role") || !remoteProfileColumns.includes("reports_to"),
    leadAssigneeContractMismatch: localContract.legacyLeadAssignee && remoteLeadColumns.includes("assigned_user_id") && !remoteLeadColumns.includes("assigned_to"),
    legacyMigrationReplaySafe: false,
    newMigrationRequired: true,
  },
  privilegedFunction: {
    name: privilegedFunction?.name ?? null,
    securityDefiner: privilegedFunction?.securityDefiner === true,
    exactDefinitionVersioned: privilegedFunction?.definitionPersisted === true,
    anonExecute: privilegedFunction?.anonExecute === true,
    authenticatedExecute: privilegedFunction?.authenticatedExecute === true,
    safeSearchPath: privilegedFunction?.searchPath === "",
    hardeningReady: false,
  },
  catalogProposal: {
    transactionReadOnly: /begin transaction read only/i.test(proposalSql),
    explicitRollback: /\brollback\s*;/i.test(proposalSql),
    mutatingStatementDetected: mutationPattern.test(sqlWithoutComments),
    businessTableSelectDetected: /\bfrom\s+public\.(profiles|leads|crm_projects|marketing_campaigns)\b/i.test(sqlWithoutComments),
  },
  executionEvidence: {
    approved: evidenceResult.approved,
    issueCodes: evidenceResult.issueCodes,
  },
  readiness: {
    planComplete: plan.orderedActions.length === 10 && plan.orderedActions.every((item) => Boolean(item.rollback)),
    catalogAuditSafe: /begin transaction read only/i.test(proposalSql) && !mutationPattern.test(sqlWithoutComments),
    isolatedStagingReady: false,
    migrationDriftReconciled: false,
    privilegedFunctionVersioned: false,
    runtimeEvidenceApproved: false,
    migrationReady: false,
    deploymentReady: false,
  },
  governance: phase.governance,
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--strict-ready") && !report.readiness.deploymentReady) process.exit(1);

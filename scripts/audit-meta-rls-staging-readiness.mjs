import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMetaRlsEvidence } from "./validate-meta-rls-staging-evidence.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const phase = readJson("config/meta-intelligence-phase-008.json");
const baseline = readJson(phase.baselineFixture);
const evidence = readJson(phase.evidenceTemplate);

const policies = baseline.canonicalPolicies;
const profileColumns = baseline.remoteColumns["public.profiles"] ?? [];
const privilegedFunction = baseline.privilegedFunctions.find((item) => item.name === "public.search_knowledge_chunks");
const evidenceResult = validateMetaRlsEvidence(evidence);
const hierarchyReferenceCount = Math.max(
  policies.leadVisibilityHelperReferences,
  policies.reportsToReferences,
  policies.assigneeReferences,
);

const report = {
  phase: phase.phase,
  mode: phase.mode,
  status: phase.status,
  policyCoverage: {
    canonicalPolicies: policies.count,
    organizationScoped: policies.organizationHelperReferences,
    tenantPredicatePercent: policies.count > 0
      ? Math.round((policies.organizationHelperReferences / policies.count) * 100)
      : 0,
    hierarchyScoped: hierarchyReferenceCount,
    hierarchyPredicatePercent: policies.count > 0
      ? Math.round((hierarchyReferenceCount / policies.count) * 100)
      : 0,
    roleHierarchyColumnsPresent: profileColumns.includes("commercial_role") && profileColumns.includes("reports_to"),
  },
  staging: {
    projectsDetected: baseline.projects.detected,
    separateProjectDetected: baseline.projects.separateStagingDetected,
    runtimeScenariosExecuted: baseline.runtimeEvidence.scenarioCount,
    evidenceApproved: evidenceResult.approved,
    evidenceIssueCodes: evidenceResult.issueCodes,
  },
  securityAdvisor: {
    warningCount: baseline.securityAdvisor.warningCount,
    privilegedKnowledgeSearch: {
      securityDefiner: privilegedFunction?.securityDefiner === true,
      anonExecute: privilegedFunction?.anonExecute === true,
      authenticatedExecute: privilegedFunction?.authenticatedExecute === true,
      authUidGuardDetected: privilegedFunction?.authUidGuardDetected === true,
      searchPathHardened: privilegedFunction?.searchPath === "",
      exposureConfirmed: privilegedFunction?.exposureConfirmed === true,
    },
    leakedPasswordProtectionWarning: baseline.securityAdvisor.warnings.some((item) => item.code === "auth_leaked_password_protection"),
  },
  readiness: {
    catalogAuditComplete: true,
    organizationBoundaryStaticallyObserved: policies.organizationHelperReferences === policies.count,
    hierarchyBoundaryStaticallyObserved: hierarchyReferenceCount === policies.count,
    separateStagingReady: baseline.projects.separateStagingDetected,
    runtimeEvidenceApproved: evidenceResult.approved,
    tenantIsolationApproved: false,
    roleHierarchyApproved: false,
    migrationReady: false,
    deploymentReady: false,
  },
  governance: {
    businessRowsRead: false,
    personalDataRead: false,
    secretsRead: false,
    projectIdentifiersPrinted: false,
    databaseMutation: false,
    migrationApplication: false,
    realEventDelivery: false,
    buildExecuted: false,
  },
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--strict-ready") && !report.readiness.deploymentReady) process.exit(1);

import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-005.json"));
const phase4 = JSON.parse(read("config/meta-intelligence-phase-004.json"));

const sourceMigrations = phase4.sourceMigrationReview.map((item) => ({
  file: item.file.split("/").at(-1),
  source: read(item.file),
}));

const writePrivileges = new Set(["insert", "update", "delete"]);
const publicTables = config.accessMatrix.filter((item) => item.kind === "table" && item.dataApiExposed);
const compatibilityViews = config.accessMatrix.filter((item) => item.kind === "view");
const privateObjects = config.accessMatrix.filter((item) => item.object.startsWith("private."));

const targetChecks = {
  canonicalProjectsPreserved: config.canonicalSources.projects === "public.crm_projects",
  canonicalCampaignsPreserved: config.canonicalSources.campaigns === "public.marketing_campaigns",
  duplicateCanonicalTablesForbidden: config.bridgeContracts
    .filter((item) => item.kind === "security_invoker_view")
    .every((item) => item.foreignKeyTargetAllowed === false && item.canonicalWriteTarget === item.source),
  viewsUseSecurityInvoker: compatibilityViews.every((item) => item.securityInvoker === true && item.sourceRlsRequired === true),
  publicTablesUseRls: publicTables.every((item) => item.rlsRequired === true),
  privateObjectsStayOutsideDataApi: privateObjects.every((item) => item.dataApiExposed === false),
  anonDeniedEverywhere: config.accessMatrix.every((item) => item.anonPrivileges.length === 0),
  authenticatedWritesDenied: config.accessMatrix.every((item) => !item.authenticatedPrivileges.some((privilege) => writePrivileges.has(privilege))),
  serviceWritesAreServerOnly: config.accessMatrix
    .filter((item) => item.serviceRolePrivileges.some((privilege) => writePrivileges.has(privilege)))
    .every((item) => /server|worker/.test(item.mutationPath)),
  secretsRemainPrivate: config.accessMatrix
    .filter((item) => item.containsSecrets)
    .every((item) => item.object.startsWith("private.") && item.authenticatedPrivileges.length === 0),
  securityDefinerHardened: config.functionHardening.emptySearchPathRequired
    && config.functionHardening.publicExecuteRevoked
    && config.functionHardening.anonExecuteRevoked,
  allBridgeStepsBlocked: config.bridgeContracts.every((item) => item.applyNow === false),
};

const currentSourceFindings = {
  publicOutboxDefinitionFound: sourceMigrations.some((item) => /public\.integration_outbox/i.test(item.source)),
  publicDeadLetterDefinitionFound: sourceMigrations.some((item) => /public\.dead_letter_events/i.test(item.source)),
  publicIntegrationConfigFound: sourceMigrations.some((item) => /create\s+table[^;]+public\.integrations/i.test(item.source)),
  nonEmptySecurityDefinerSearchPathFound: sourceMigrations.some((item) => /security\s+definer[\s\S]{0,500}set\s+search_path\s*=\s*(?!'')/i.test(item.source)),
  broadAttributionBackfillFound: sourceMigrations.some((item) => /insert\s+into\s+public\.lead_attribution_touches[\s\S]+select/i.test(item.source)),
  directSourceReuseApproved: false,
};

const targetSpecificationValid = Object.values(targetChecks).every(Boolean);

console.log(JSON.stringify({
  phase: config.phase,
  mode: config.mode,
  canonicalSources: config.canonicalSources,
  targetChecks,
  currentSourceFindings,
  matrixSummary: {
    objects: config.accessMatrix.length,
    exposedObjects: config.accessMatrix.filter((item) => item.dataApiExposed).length,
    privateObjects: privateObjects.length,
    anonReadableObjects: config.accessMatrix.filter((item) => item.anonPrivileges.includes("select")).length,
    authenticatedWritableObjects: config.accessMatrix.filter((item) => item.authenticatedPrivileges.some((privilege) => writePrivileges.has(privilege))).length,
  },
  readiness: {
    targetSpecificationValid,
    currentSourceMatchesTarget: false,
    isolatedPreflightImplemented: false,
    deploymentReady: false,
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

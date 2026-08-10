import { pathToFileURL } from "node:url";

export const PHASE29_APPROVAL = "APPLY_PHASE29_TO_ISOLATED_CLONE_ONLY";
const CLI_VERSION = "2.109.1";
const PROJECT_REF_PATTERN = /^[a-z0-9-]{4,80}$/;
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

export function validatePhase29Target(input) {
  const issues = new Set();
  const target = input?.target ?? {};
  const prohibited = input?.prohibitedActions ?? {};

  if (input?.phase !== 29 || input?.environment !== "staging_clone") issues.add("phase29_staging_clone_required");
  if (input?.approval !== PHASE29_APPROVAL) issues.add("explicit_human_approval_missing");
  if (input?.cliVersion !== CLI_VERSION) issues.add("supabase_cli_version_mismatch");
  if (target.linkedProject === true || target.directDatabaseUrl !== true) issues.add("direct_isolated_database_url_required");
  if (target.productionProject !== false) issues.add("production_target_forbidden");
  if (!target.host || target.host !== target.expectedHost) issues.add("isolated_host_mismatch");
  if (!DATABASE_NAME_PATTERN.test(target.databaseName ?? "") || target.databaseName !== target.expectedDatabaseName) issues.add("isolated_database_name_mismatch");
  if (!PROJECT_REF_PATTERN.test(target.projectRef ?? "")) issues.add("isolated_project_ref_invalid");
  if (!PROJECT_REF_PATTERN.test(target.productionProjectRef ?? "")) issues.add("production_project_ref_invalid");
  if (!target.productionHost) issues.add("production_host_comparison_missing");
  if (target.host === target.productionHost || target.projectRef === target.productionProjectRef) issues.add("production_identity_collision");
  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") issues.add("postgres_protocol_required");
  if (Object.values(prohibited).some((value) => value !== false)) issues.add("prohibited_action_requested");

  return {
    approved: issues.size === 0,
    issueCodes: [...issues].sort(),
    stagingOnly: true,
    productionAllowed: false,
    permitReservationAllowed: false,
    metaDeliveryAllowed: false
  };
}

function fixture() {
  return {
    phase: 29,
    environment: "staging_clone",
    approval: PHASE29_APPROVAL,
    cliVersion: CLI_VERSION,
    target: {
      protocol: "postgresql:",
      host: "db.phase29-clone.example.test",
      expectedHost: "db.phase29-clone.example.test",
      databaseName: "atlas_phase29_clone",
      expectedDatabaseName: "atlas_phase29_clone",
      projectRef: "phase29-clone",
      productionHost: "db.atlas-production.example.test",
      productionProjectRef: "atlas-production",
      directDatabaseUrl: true,
      linkedProject: false,
      productionProject: false
    },
    prohibitedActions: {
      productionMutation: false,
      permitReservation: false,
      permitIssuance: false,
      permitConsumption: false,
      realMetaEventDelivery: false,
      testMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
      deployment: false,
      build: false
    }
  };
}

export function selfTestPhase29Preflight() {
  const tests = [];
  const baseline = fixture();
  tests.push({ id: "complete_isolated_target", passed: validatePhase29Target(baseline).approved });
  const mutate = (id, change, expected) => {
    const value = structuredClone(baseline);
    change(value);
    tests.push({ id, passed: validatePhase29Target(value).issueCodes.includes(expected) });
  };
  mutate("production_environment", (v) => { v.environment = "production"; }, "phase29_staging_clone_required");
  mutate("approval_missing", (v) => { v.approval = ""; }, "explicit_human_approval_missing");
  mutate("cli_mismatch", (v) => { v.cliVersion = "latest"; }, "supabase_cli_version_mismatch");
  mutate("linked_forbidden", (v) => { v.target.linkedProject = true; }, "direct_isolated_database_url_required");
  mutate("production_forbidden", (v) => { v.target.productionProject = true; }, "production_target_forbidden");
  mutate("host_mismatch", (v) => { v.target.expectedHost = "other.example.test"; }, "isolated_host_mismatch");
  mutate("database_mismatch", (v) => { v.target.expectedDatabaseName = "other"; }, "isolated_database_name_mismatch");
  mutate("project_ref_invalid", (v) => { v.target.projectRef = "***"; }, "isolated_project_ref_invalid");
  mutate("production_ref_missing", (v) => { v.target.productionProjectRef = ""; }, "production_project_ref_invalid");
  mutate("production_host_missing", (v) => { v.target.productionHost = ""; }, "production_host_comparison_missing");
  mutate("same_host_rejected", (v) => { v.target.productionHost = v.target.host; }, "production_identity_collision");
  mutate("same_project_rejected", (v) => { v.target.productionProjectRef = v.target.projectRef; }, "production_identity_collision");
  mutate("protocol_rejected", (v) => { v.target.protocol = "https:"; }, "postgres_protocol_required");
  mutate("delivery_rejected", (v) => { v.prohibitedActions.testMetaEventDelivery = true; }, "prohibited_action_requested");
  return { passed: tests.every((test) => test.passed), testCount: tests.length, tests };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = selfTestPhase29Preflight();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

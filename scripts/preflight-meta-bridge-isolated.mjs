import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readProjectJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const phase5 = readProjectJson("config/meta-intelligence-phase-005.json");
const phase6 = readProjectJson("config/meta-intelligence-phase-006.json");

const samePrivileges = (actual = [], expected = []) => {
  const normalizedActual = [...new Set(actual)].sort();
  const normalizedExpected = [...new Set(expected)].sort();
  return JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected);
};

export function validateMetaBridgeSnapshot(snapshot) {
  const issues = [];
  const fail = (code, object = null) => issues.push({ code, object });
  const objects = new Map((snapshot.objects ?? []).map((item) => [item.name, item]));
  const functions = new Map((snapshot.functions ?? []).map((item) => [item.name, item]));
  const scenarios = new Map((snapshot.isolationScenarios ?? []).map((item) => [item.name, item]));

  if (snapshot.format !== phase6.inputContract.format) fail("snapshot_format_invalid");
  if (snapshot.environment !== "isolated_fixture" && snapshot.environment !== "staging_snapshot") fail("environment_not_isolated");
  if (snapshot.environment !== "isolated_fixture" && snapshot.exposure?.verifiedFromDataApiSettings !== true) {
    fail("data_api_exposure_unverified");
  }
  if ((snapshot.postgresMajor ?? 0) < 15) fail("postgres_version_does_not_support_security_invoker");

  const requiredFunctions = new Set();
  for (const source of Object.values(phase5.canonicalSources)) {
    const normalized = source.replace(/\(\)$/, "");
    const exists = source.endsWith("()") ? functions.has(normalized) : objects.has(normalized);
    if (!exists) fail("canonical_source_missing", normalized);
    if (source.endsWith("()")) requiredFunctions.add(normalized);
  }
  for (const contract of phase5.bridgeContracts ?? []) {
    if (!String(contract.kind).includes("helper")) continue;
    for (const candidate of [contract.source, contract.target]) {
      const value = String(candidate ?? "");
      if (/^private\.[a-z_][a-z0-9_]*\([^)]*\)$/i.test(value)) {
        requiredFunctions.add(value.replace(/\([^)]*\)$/, ""));
      }
    }
  }
  for (const functionName of requiredFunctions) {
    const fn = functions.get(functionName);
    if (!fn) {
      fail("required_helper_missing", functionName);
      continue;
    }
    if (fn.authenticatedExecute !== true) fail("authenticated_execute_missing", functionName);
  }

  for (const duplicate of ["public.developments", "public.campaigns"]) {
    if (objects.has(duplicate)) fail("duplicate_canonical_table_present", duplicate);
  }

  for (const expected of phase5.accessMatrix) {
    const actual = objects.get(expected.object);
    if (!actual) {
      fail("required_object_missing", expected.object);
      continue;
    }
    if (actual.kind !== expected.kind) fail("object_kind_mismatch", expected.object);
    if (actual.dataApiExposed !== expected.dataApiExposed) fail("data_api_exposure_mismatch", expected.object);
    if (expected.kind === "table" && expected.rlsRequired && actual.rlsEnabled !== true) fail("rls_required", expected.object);
    if (expected.kind === "view" && (actual.securityInvoker !== true || actual.sourceRlsEnabled !== true)) fail("security_invoker_required", expected.object);
    if (!samePrivileges(actual.grants?.anon, expected.anonPrivileges)) fail("anon_grants_mismatch", expected.object);
    if (!samePrivileges(actual.grants?.authenticated, expected.authenticatedPrivileges)) fail("authenticated_grants_mismatch", expected.object);
    if (!samePrivileges(actual.grants?.service_role, expected.serviceRolePrivileges)) fail("service_role_grants_mismatch", expected.object);
  }

  for (const fn of functions.values()) {
    if (fn.securityDefiner) {
      if (!fn.name.startsWith("private.")) fail("security_definer_not_private", fn.name);
      if (fn.searchPath !== "") fail("security_definer_search_path_not_empty", fn.name);
      if (!fn.authUidCheck) fail("security_definer_auth_check_missing", fn.name);
    }
    if (fn.publicExecute) fail("public_execute_not_revoked", fn.name);
    if (fn.anonExecute) fail("anon_execute_not_revoked", fn.name);
  }

  const indexTokens = new Set((snapshot.objects ?? []).flatMap((item) => item.indexes ?? []));
  for (const required of [
    "organization_id_created_at",
    "lead_id",
    "organization_external_event_unique",
    "organization_meta_event_unique",
    "pending_available_at_partial",
  ]) {
    if (!indexTokens.has(required)) fail("required_index_missing", required);
  }

  for (const name of phase6.requiredIsolationScenarios) {
    const scenario = scenarios.get(name);
    if (!scenario) {
      fail("isolation_scenario_missing", name);
      continue;
    }
    if (scenario.passed !== true) fail("isolation_scenario_failed", name);
  }
  const crossTenant = scenarios.get("broker_cross_tenant_read_denied");
  if (crossTenant && crossTenant.visibleRows !== 0) fail("cross_tenant_rows_visible", crossTenant.name);

  return { ok: issues.length === 0, issues };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function runNegativeSelfTests(snapshot) {
  const mutations = [
    ["missing_required_object", (copy) => { copy.objects = copy.objects.filter((item) => item.name !== "public.meta_lead_events"); }, "required_object_missing"],
    ["rls_disabled", (copy) => { copy.objects.find((item) => item.name === "public.meta_lead_events").rlsEnabled = false; }, "rls_required"],
    ["anon_select_granted", (copy) => { copy.objects.find((item) => item.name === "public.meta_lead_events").grants.anon = ["select"]; }, "anon_grants_mismatch"],
    ["authenticated_insert_granted", (copy) => { copy.objects.find((item) => item.name === "public.meta_lead_events").grants.authenticated.push("insert"); }, "authenticated_grants_mismatch"],
    ["security_invoker_disabled", (copy) => { copy.objects.find((item) => item.name === "public.developments_compat").securityInvoker = false; }, "security_invoker_required"],
    ["security_definer_search_path_not_empty", (copy) => { copy.functions.find((item) => item.name === "private.can_view_lead").searchPath = "public"; }, "security_definer_search_path_not_empty"],
    ["cross_tenant_rows_visible", (copy) => { copy.isolationScenarios.find((item) => item.name === "broker_cross_tenant_read_denied").visibleRows = 1; }, "cross_tenant_rows_visible"],
  ];

  return mutations.map(([name, mutate, expectedCode]) => {
    const copy = clone(snapshot);
    mutate(copy);
    const result = validateMetaBridgeSnapshot(copy);
    return {
      name,
      rejected: !result.ok,
      expectedIssueDetected: result.issues.some((issue) => issue.code === expectedCode),
    };
  });
}

function parseSnapshotPath() {
  const flagIndex = process.argv.indexOf("--snapshot");
  if (flagIndex >= 0 && process.argv[flagIndex + 1]) return resolve(process.cwd(), process.argv[flagIndex + 1]);
  return resolve(root, phase6.inputContract.defaultFixture);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshotPath = parseSnapshotPath();
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const result = validateMetaBridgeSnapshot(snapshot);
  const selfTests = process.argv.includes("--self-test") ? runNegativeSelfTests(snapshot) : [];
  const selfTestsPassed = selfTests.every((item) => item.rejected && item.expectedIssueDetected);
  const ok = result.ok && (!selfTests.length || selfTestsPassed);

  console.log(JSON.stringify({
    phase: phase6.phase,
    mode: phase6.mode,
    snapshot: { format: snapshot.format, environment: snapshot.environment },
    result: { ok: result.ok, issueCount: result.issues.length, issues: result.issues },
    negativeSelfTests: {
      executed: selfTests.length,
      rejectedAsExpected: selfTests.filter((item) => item.rejected && item.expectedIssueDetected).length,
      passed: selfTestsPassed,
    },
    readiness: {
      isolatedPreflightImplemented: true,
      isolatedFixturePassed: result.ok,
      realSnapshotValidated: snapshot.environment === "staging_snapshot" && result.ok,
      deploymentReady: false,
    },
    governance: {
      databaseMutation: false,
      remoteDatabaseConnection: false,
      serviceRoleUsed: false,
      identifiersPrinted: false,
      personalDataPrinted: false,
      secretsPrinted: false,
    },
  }, null, 2));

  if (!ok) process.exit(1);
}

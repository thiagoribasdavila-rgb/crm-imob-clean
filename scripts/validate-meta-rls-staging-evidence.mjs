import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const phase = readJson("config/meta-intelligence-phase-008.json");
const template = readJson(phase.evidenceTemplate);

const clone = (value) => JSON.parse(JSON.stringify(value));
const unique = (values) => [...new Set(values)];

export function validateMetaRlsEvidence(evidence) {
  const issues = [];
  const add = (code, scenario = null) => issues.push({ code, scenario });
  const scenarios = Array.isArray(evidence?.scenarios) ? evidence.scenarios : [];
  const scenarioIds = scenarios.map((scenario) => scenario?.id).filter(Boolean);
  const scenarioMap = new Map(scenarios.map((scenario) => [scenario?.id, scenario]));
  const requiredIds = phase.requiredScenarios.map((scenario) => scenario.id);

  if (evidence?.format !== "atlas_meta_rls_evidence_v1") add("invalid_evidence_format");
  if (evidence?.environment !== "staging_clone") add("environment_not_staging_clone");
  if (evidence?.sanitized !== true) add("evidence_not_sanitized");
  if (evidence?.projectIdentifiersPersisted !== false) add("project_identifiers_persisted");
  if (evidence?.businessRowsPersisted !== false) add("business_rows_persisted");
  if (evidence?.personalDataPersisted !== false) add("personal_data_persisted");
  if (evidence?.run?.status !== "completed") add("runtime_not_completed");
  if (evidence?.run?.isolatedClone !== true) add("isolated_clone_not_confirmed");
  if (scenarioIds.length !== unique(scenarioIds).length) add("duplicate_scenario");

  for (const id of scenarioIds) {
    if (!requiredIds.includes(id)) add("unknown_scenario", id);
  }

  for (const contract of phase.requiredScenarios) {
    const scenario = scenarioMap.get(contract.id);
    if (!scenario) {
      add("required_scenario_missing", contract.id);
      continue;
    }
    if (scenario.status !== "passed") add("scenario_not_passed", contract.id);
    if (contract.expectation === "denied_read" && scenario.visibleRows !== 0) {
      add("denied_read_returned_rows", contract.id);
    }
    if (contract.expectation === "allowed_read" && !(Number.isInteger(scenario.visibleRows) && scenario.visibleRows >= 1)) {
      add("allowed_read_not_observed", contract.id);
    }
    if (contract.expectation === "denied_write" && scenario.affectedRows !== 0) {
      add("denied_write_mutated_rows", contract.id);
    }
  }

  return {
    approved: issues.length === 0,
    issueCount: issues.length,
    issueCodes: unique(issues.map((issue) => issue.code)).sort(),
    issues,
    scenarios: {
      expected: requiredIds.length,
      supplied: scenarios.length,
      passed: scenarios.filter((scenario) => scenario.status === "passed").length,
    },
    governance: {
      stagingOnly: true,
      productionAccepted: false,
      businessRowsPersisted: evidence?.businessRowsPersisted === true,
      personalDataPersisted: evidence?.personalDataPersisted === true,
      projectIdentifiersPersisted: evidence?.projectIdentifiersPersisted === true,
    },
  };
}

function makePassingSyntheticEvidence() {
  const evidence = clone(template);
  evidence.environment = "staging_clone";
  evidence.run = { status: "completed", isolatedClone: true, executedAt: "2026-07-19T00:00:00.000Z" };
  const contracts = new Map(phase.requiredScenarios.map((scenario) => [scenario.id, scenario]));
  evidence.scenarios = evidence.scenarios.map((scenario) => {
    const contract = contracts.get(scenario.id);
    return {
      ...scenario,
      status: "passed",
      visibleRows: contract.expectation === "allowed_read" ? 2 : 0,
      affectedRows: contract.expectation === "denied_write" ? 0 : null,
    };
  });
  return evidence;
}

function runSelfTests() {
  const passing = makePassingSyntheticEvidence();
  const tests = [];
  const test = (name, mutate, expectedCode = null) => {
    const candidate = clone(passing);
    mutate(candidate);
    const result = validateMetaRlsEvidence(candidate);
    tests.push({
      name,
      passed: expectedCode ? !result.approved && result.issueCodes.includes(expectedCode) : result.approved,
      approved: result.approved,
      issueCodes: result.issueCodes,
    });
  };

  test("synthetic_isolated_matrix_passes", () => {});
  test("production_environment_rejected", (value) => { value.environment = "production"; }, "environment_not_staging_clone");
  test("missing_scenario_rejected", (value) => { value.scenarios.pop(); }, "required_scenario_missing");
  test("cross_tenant_rows_visible_rejected", (value) => {
    value.scenarios.find((item) => item.id === "broker_cross_tenant_read_denied").visibleRows = 1;
  }, "denied_read_returned_rows");
  test("anonymous_rows_visible_rejected", (value) => {
    value.scenarios.find((item) => item.id === "anonymous_canonical_read_denied").visibleRows = 1;
  }, "denied_read_returned_rows");
  test("direct_write_succeeded_rejected", (value) => {
    value.scenarios.find((item) => item.id === "authenticated_direct_meta_write_denied").affectedRows = 1;
  }, "denied_write_mutated_rows");
  test("unsanitized_evidence_rejected", (value) => { value.sanitized = false; }, "evidence_not_sanitized");
  test("duplicate_scenario_rejected", (value) => { value.scenarios.push(clone(value.scenarios[0])); }, "duplicate_scenario");

  return {
    passed: tests.every((testCase) => testCase.passed),
    tests,
    actualTemplateApproved: validateMetaRlsEvidence(template).approved,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--self-test")) {
    const result = runSelfTests();
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed || result.actualTemplateApproved) process.exit(1);
  } else {
    const flagIndex = process.argv.indexOf("--evidence");
    const evidenceFile = flagIndex >= 0 && process.argv[flagIndex + 1]
      ? resolve(process.cwd(), process.argv[flagIndex + 1])
      : resolve(root, phase.evidenceTemplate);
    const result = validateMetaRlsEvidence(JSON.parse(readFileSync(evidenceFile, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (process.argv.includes("--strict-ready") && !result.approved) process.exit(1);
  }
}

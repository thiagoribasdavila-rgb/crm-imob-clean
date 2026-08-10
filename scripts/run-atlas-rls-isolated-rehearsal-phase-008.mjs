import { readFileSync } from "node:fs";
import process from "node:process";

const read = (url) => readFileSync(url, "utf8");
const readJson = (url) => JSON.parse(read(url));

const config = readJson(
  new URL(
    "../config/atlas-10x-phase-008-isolated-rls-rehearsal.json",
    import.meta.url,
  ),
);
const dynamicTest = read(
  new URL(
    "../supabase/tests/database/phase_008_dynamic_rls_isolation.test.sql",
    import.meta.url,
  ),
);
const snapshotQuery = read(
  new URL(
    "../supabase/tests/fixtures/phase_008_acl_snapshot.sql",
    import.meta.url,
  ),
);

function collectLocalEvidence() {
  const personaMarkers = [
    "app.atlas_phase_008_broker_a",
    "app.atlas_phase_008_manager_a",
    "app.atlas_phase_008_director_a",
    "app.atlas_phase_008_actor_b",
  ];
  const scenarioMarkers = [
    "corretor enxerga a própria lead",
    "gerente enxerga a lead do corretor descendente",
    "diretor enxerga a lead da própria organização",
    "ator da organização B não enxerga lead da organização A",
    "lead_create_forbidden",
    "project-write-not-authorized",
    "transferência em massa permanece server-only",
    "distribuição de projeto permanece server-only",
  ];

  return {
    execution_is_fail_closed:
      config.execution_policy.remote_execution_enabled === false &&
      config.execution_policy.linked_project_execution_enabled === false &&
      config.execution_policy.requires_loopback_database === true &&
      config.execution_policy.requires_human_approval === true,
    fixture_contract_is_explicit:
      config.reference_fixture_contract.organization_a
        .active_director_root === 1 &&
      config.reference_fixture_contract.organization_a
        .active_manager_reporting_to_director === 1 &&
      config.reference_fixture_contract.organization_a
        .active_broker_reporting_to_manager === 1 &&
      config.reference_fixture_contract.organization_b.active_profile === 1 &&
      config.reference_fixture_contract.missing_fixture_behavior ===
        "fail_closed",
    dynamic_test_requires_isolated_clone:
      dynamicTest.includes("phase_008_isolated_clone_required") &&
      dynamicTest.includes(
        "phase_008_organization_a_fixture_contract_unsatisfied",
      ) &&
      dynamicTest.includes(
        "phase_008_organization_b_fixture_contract_unsatisfied",
      ),
    dynamic_test_impersonates_all_personas: personaMarkers.every((marker) =>
      dynamicTest.includes(marker),
    ),
    dynamic_test_covers_required_scenarios: scenarioMarkers.every((marker) =>
      dynamicTest.includes(marker),
    ),
    dynamic_test_is_transactional:
      dynamicTest.trimStart().startsWith("begin;") &&
      dynamicTest.trimEnd().endsWith("rollback;") &&
      !/\bcommit\s*;/i.test(dynamicTest),
    dynamic_test_has_no_fixture_writes:
      !/\b(insert\s+into|delete\s+from|truncate\s+table)\b/i.test(
        dynamicTest,
      ),
    acl_snapshot_is_read_only:
      snapshotQuery.includes("atlas_phase_008_acl_snapshot_v1") &&
      snapshotQuery.includes("information_schema.role_table_grants") &&
      snapshotQuery.includes("pg_policies") &&
      snapshotQuery.includes("information_schema.role_routine_grants") &&
      !/\b(insert|update|delete|drop|truncate|alter)\b/i.test(snapshotQuery),
    evidence_contract_is_sanitized:
      config.evidence_contract.contains_secrets === false &&
      config.evidence_contract.contains_personal_data === false &&
      config.evidence_contract.contains_fixture_identifiers === false &&
      config.evidence_contract.contains_database_url === false &&
      config.evidence_contract.contains_access_tokens === false,
  };
}

export function assessIsolatedRlsRehearsal({
  localEvidence,
  runtimeEvidence,
}) {
  const controls = {
    execution_is_fail_closed:
      localEvidence.execution_is_fail_closed === true,
    fixture_contract_is_explicit:
      localEvidence.fixture_contract_is_explicit === true,
    dynamic_test_requires_isolated_clone:
      localEvidence.dynamic_test_requires_isolated_clone === true,
    dynamic_test_impersonates_all_personas:
      localEvidence.dynamic_test_impersonates_all_personas === true,
    dynamic_test_covers_required_scenarios:
      localEvidence.dynamic_test_covers_required_scenarios === true,
    dynamic_test_is_transactional:
      localEvidence.dynamic_test_is_transactional === true,
    dynamic_test_has_no_fixture_writes:
      localEvidence.dynamic_test_has_no_fixture_writes === true,
    acl_snapshot_is_read_only:
      localEvidence.acl_snapshot_is_read_only === true,
    evidence_contract_is_sanitized:
      localEvidence.evidence_contract_is_sanitized === true,
    ...Object.fromEntries(
      config.required_gates.map((gate) => [
        gate,
        runtimeEvidence[gate] === true,
      ]),
    ),
  };
  const entries = Object.entries(controls);
  const passed = entries.filter(([, value]) => value).length;
  const blockers = entries
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      blockers.length === 0
        ? "isolated_rls_rehearsal_passed"
        : "isolated_rls_rehearsal_pending",
    score: {
      passed,
      total: entries.length,
      percentage: Math.round((passed / entries.length) * 100),
    },
    coverage: {
      personas: config.personas.length,
      dynamic_scenarios: config.dynamic_scenarios.length,
      organizations_required: 2,
      fixture_creation_allowed:
        config.execution_policy.allows_fixture_creation,
    },
    controls: {
      values: controls,
      blockers,
    },
    execution: {
      remote_write_executed: false,
      linked_project_used: false,
      migration_applied: false,
      user_changed: false,
      business_data_persisted: false,
      build_executed: false,
      package_created: false,
    },
    conclusion: {
      local_rehearsal_package_ready:
        localEvidence.execution_is_fail_closed === true &&
        localEvidence.dynamic_test_covers_required_scenarios === true &&
        localEvidence.dynamic_test_is_transactional === true &&
        localEvidence.acl_snapshot_is_read_only === true,
      dynamic_rehearsal_passed: blockers.length === 0,
      production_ready: false,
      next_phase: config.next_phase,
    },
  };
}

const selfTest = process.argv.includes("--self-test");
const localEvidence = collectLocalEvidence();
const runtimeEvidence = selfTest
  ? Object.fromEntries(config.required_gates.map((gate) => [gate, true]))
  : config.runtime_evidence;
const result = assessIsolatedRlsRehearsal({
  localEvidence,
  runtimeEvidence,
});

if (selfTest && result.status !== "isolated_rls_rehearsal_passed") {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

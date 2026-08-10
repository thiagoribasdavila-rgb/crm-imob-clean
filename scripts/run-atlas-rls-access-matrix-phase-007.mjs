import { readdirSync, readFileSync } from "node:fs";
import process from "node:process";

const read = (url) => readFileSync(url, "utf8");
const readJson = (url) => JSON.parse(read(url));

const config = readJson(
  new URL("../config/atlas-10x-phase-007-access-matrix.json", import.meta.url),
);
const snapshot = readJson(
  new URL(
    "../config/atlas-10x-phase-006-remote-security-snapshot.json",
    import.meta.url,
  ),
);

function collectSourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), root);
    if (entry.isDirectory()) files.push(...collectSourceFiles(path));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function collectLocalEvidence() {
  const candidate = read(
    new URL(
      "../supabase/migration-drafts/20260723070000_phase_007_rls_access_hardening_candidate.sql",
      import.meta.url,
    ),
  );
  const rollback = read(
    new URL(
      "../supabase/migration-drafts/20260723070000_phase_007_rls_access_hardening_candidate.rollback.sql",
      import.meta.url,
    ),
  );
  const tests = read(
    new URL(
      "../supabase/tests/database/phase_007_rls_access_matrix.test.sql",
      import.meta.url,
    ),
  );
  const appSources = collectSourceFiles(new URL("../app/", import.meta.url))
    .map(read)
    .join("\n");

  const denyPolicies = config.table_contracts.filter((item) =>
    candidate.includes(
      `create policy ${item.table}_phase007_no_direct_api`,
    ),
  );

  return {
    access_matrix_complete:
      config.table_contracts.length === 12 &&
      config.function_contracts.length === 10 &&
      config.table_contracts.every(
        (item) => item.classification && item.decision && item.allowed_path,
      ) &&
      config.function_contracts.every(
        (item) => item.classification && item.decision,
      ),
    role_matrix_complete:
      config.roles.length === 7 &&
      ["anon", "broker", "manager", "superintendent", "director_admin", "service_role", "cross_tenant_actor"].every(
        (role) => config.roles.some((item) => item.role === role),
      ),
    legacy_project_consumers_removed:
      !appSources.includes('.from("projects")') &&
      !appSources.includes(".from('projects')"),
    candidate_is_fail_closed:
      candidate.includes("phase_007_isolated_clone_required") &&
      candidate.includes("phase_007_schema_drift") &&
      denyPolicies.length === 12,
    candidate_is_transactional:
      candidate.trimStart().includes("-- ATLAS 10X") &&
      candidate.includes("\nbegin;") &&
      candidate.trimEnd().endsWith("rollback;"),
    candidate_has_no_commit: !/\bcommit\s*;/i.test(candidate),
    candidate_contains_no_destructive_ddl:
      !/\b(drop\s+table|truncate\s+table|delete\s+from)\b/i.test(candidate),
    server_only_grants_are_explicit:
      config.table_contracts.every(
        ({ table }) =>
          candidate.includes(
            `revoke all on table public.${table} from public, anon, authenticated`,
          ) &&
          candidate.includes(
            `grant all on table public.${table} to service_role`,
          ),
      ),
    trigger_only_execute_is_revoked: [
      "apply_opportunity_commission_sla",
      "refresh_commission_status",
      "scaffold_project_intelligence",
    ].every((name) =>
      candidate.includes(
        `revoke execute on function public.${name}() from public, anon, authenticated`,
      ),
    ),
    privileged_rpc_contracts_are_explicit:
      candidate.includes(
        "grant execute on function public.create_lead_atomic",
      ) &&
      candidate.includes(
        "grant execute on function public.mutate_crm_project_v1",
      ) &&
      candidate.includes(
        "grant execute on function public.distribute_project_leads",
      ) &&
      candidate.includes(
        "grant execute on function public.search_knowledge_chunks",
      ),
    future_default_privileges_are_fail_closed:
      candidate.includes(
        "alter default privileges for role postgres in schema public",
      ) &&
      candidate.includes(
        "revoke execute on functions from public, anon, authenticated",
      ),
    pgtap_contract_complete:
      tests.includes("phase_007_isolated_clone_required") &&
      tests.includes("select no_plan();") &&
      tests.includes("select * from finish();") &&
      tests.trimEnd().endsWith("rollback;") &&
      config.table_contracts.every(({ table }) => tests.includes(`'${table}'`)),
    rollback_is_fail_closed:
      rollback.includes("phase_007_isolated_clone_required") &&
      rollback.includes("phase_007_acl_snapshot_required") &&
      rollback.includes(
        "phase_007_generate_rollback_from_approved_acl_snapshot",
      ),
    manifest_contains_no_secret_or_personal_values:
      !/(password|secret|service_role_key)["']?\s*:\s*["'][^"']+/i.test(
        JSON.stringify(config),
      ),
  };
}

export function assessRlsAccessMatrix({
  localEvidence,
  runtimeEvidence,
  observedSnapshot,
}) {
  const controls = {
    target_environment_confirmed:
      observedSnapshot.target.name === config.target_environment &&
      observedSnapshot.target.status === "ACTIVE_HEALTHY",
    remote_execution_disabled:
      config.execution_policy.remote_execution_enabled === false &&
      config.execution_policy.default_mode === "local_static_assessment",
    access_matrix_complete: localEvidence.access_matrix_complete === true,
    role_matrix_complete: localEvidence.role_matrix_complete === true,
    legacy_project_consumers_removed:
      localEvidence.legacy_project_consumers_removed === true,
    candidate_is_fail_closed:
      localEvidence.candidate_is_fail_closed === true,
    candidate_is_transactional:
      localEvidence.candidate_is_transactional === true &&
      localEvidence.candidate_has_no_commit === true,
    candidate_contains_no_destructive_ddl:
      localEvidence.candidate_contains_no_destructive_ddl === true,
    server_only_grants_are_explicit:
      localEvidence.server_only_grants_are_explicit === true,
    trigger_only_execute_is_revoked:
      localEvidence.trigger_only_execute_is_revoked === true,
    privileged_rpc_contracts_are_explicit:
      localEvidence.privileged_rpc_contracts_are_explicit === true,
    future_default_privileges_are_fail_closed:
      localEvidence.future_default_privileges_are_fail_closed === true,
    pgtap_contract_complete:
      localEvidence.pgtap_contract_complete === true,
    rollback_is_fail_closed:
      localEvidence.rollback_is_fail_closed === true,
    manifest_contains_no_secret_or_personal_values:
      localEvidence.manifest_contains_no_secret_or_personal_values === true,
    isolated_clone_receipt_approved:
      runtimeEvidence.isolated_clone_receipt_approved === true,
    acl_snapshot_available:
      runtimeEvidence.acl_snapshot_available === true &&
      observedSnapshot.catalog_acl_snapshot.available === true,
    anon_denial_passed: runtimeEvidence.anon_denial_passed === true,
    authenticated_role_matrix_passed:
      runtimeEvidence.authenticated_role_matrix_passed === true,
    cross_tenant_denial_passed:
      runtimeEvidence.cross_tenant_denial_passed === true,
    rpc_actor_spoofing_denial_passed:
      runtimeEvidence.rpc_actor_spoofing_denial_passed === true,
    positive_owner_path_passed:
      runtimeEvidence.positive_owner_path_passed === true,
    positive_manager_path_passed:
      runtimeEvidence.positive_manager_path_passed === true,
    rollback_rehearsal_passed:
      runtimeEvidence.rollback_rehearsal_passed === true,
    security_advisors_clean:
      runtimeEvidence.security_advisors_clean === true &&
      observedSnapshot.advisor_findings.rls_enabled_without_policy.count ===
        0 &&
      observedSnapshot.advisor_findings.anon_security_definer_executable
        .count === 0,
    human_execution_approval:
      runtimeEvidence.human_execution_approval === true,
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
        ? "rls_access_matrix_rehearsal_ready"
        : "rls_access_matrix_rehearsal_pending",
    score: {
      passed,
      total: entries.length,
      percentage: Math.round((passed / entries.length) * 100),
    },
    classification: {
      tables: config.table_contracts.length,
      functions: config.function_contracts.length,
      roles: config.roles.length,
      browser_legacy_project_consumers: localEvidence
        .legacy_project_consumers_removed
        ? 0
        : 1,
    },
    controls: { values: controls, blockers },
    execution: {
      remote_write_executed: false,
      migration_applied: false,
      grant_changed: false,
      policy_changed: false,
      user_changed: false,
      build_executed: false,
      package_created: false,
    },
    conclusion: {
      static_contract_ready:
        localEvidence.access_matrix_complete === true &&
        localEvidence.candidate_is_fail_closed === true &&
        localEvidence.pgtap_contract_complete === true,
      isolated_rehearsal_ready: blockers.length === 0,
      production_ready: false,
      next_phase: config.next_phase,
    },
  };
}

const selfTest = process.argv.includes("--self-test");
const localEvidence = collectLocalEvidence();
const runtimeEvidence = selfTest
  ? Object.fromEntries(
      Object.keys(config.runtime_evidence).map((key) => [key, true]),
    )
  : config.runtime_evidence;
const observedSnapshot = selfTest
  ? {
      ...snapshot,
      catalog_acl_snapshot: { available: true },
      advisor_findings: {
        ...snapshot.advisor_findings,
        rls_enabled_without_policy: {
          ...snapshot.advisor_findings.rls_enabled_without_policy,
          count: 0,
        },
        anon_security_definer_executable: {
          ...snapshot.advisor_findings.anon_security_definer_executable,
          count: 0,
        },
      },
    }
  : snapshot;
const result = assessRlsAccessMatrix({
  localEvidence,
  runtimeEvidence,
  observedSnapshot,
});

if (
  selfTest &&
  result.status !== "rls_access_matrix_rehearsal_ready"
) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));

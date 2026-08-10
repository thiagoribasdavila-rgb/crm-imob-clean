import { readdirSync, readFileSync } from "node:fs";
import process from "node:process";

const read = (url) => readFileSync(url, "utf8");
const readJson = (url) => JSON.parse(read(url));

const config = readJson(
  new URL("../config/atlas-10x-phase-006-security-hardening.json", import.meta.url),
);
const snapshot = readJson(
  new URL(
    "../config/atlas-10x-phase-006-remote-security-snapshot.json",
    import.meta.url,
  ),
);

function collectLocalEvidence() {
  const commissionSla = read(
    new URL(
      "../supabase/migrations/20260717001500_commission_sla.sql",
      import.meta.url,
    ),
  );
  const commissionControls = read(
    new URL(
      "../supabase/migrations/20260717003000_commission_financial_controls.sql",
      import.meta.url,
    ),
  );
  const projectIntelligence = read(
    new URL(
      "../supabase/migrations/20260717021500_project_intelligence_onboarding.sql",
      import.meta.url,
    ),
  );
  const atomicLead = read(
    new URL(
      "../supabase/migrations/20260717102500_atomic_lead_registration.sql",
      import.meta.url,
    ),
  );
  const distribution = read(
    new URL(
      "../supabase/migrations/20260716234729_balanced_project_lead_distribution.sql",
      import.meta.url,
    ),
  );
  const projectMutation = read(
    new URL(
      "../supabase/migrations/20260719042811_project_write_audit_gate.sql",
      import.meta.url,
    ),
  );
  const proposal = read(
    new URL(
      "./sql/phase-006-rls-grants-functions-hardening-proposal.sql",
      import.meta.url,
    ),
  );
  const migrationRoot = new URL("../supabase/migrations/", import.meta.url);
  const migrationTexts = readdirSync(migrationRoot)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => read(new URL(name, migrationRoot)));
  const joinedMigrations = migrationTexts.join("\n");

  const triggerSources = [
    commissionSla,
    commissionControls,
    projectIntelligence,
  ];
  const triggerNames = [
    "apply_opportunity_commission_sla",
    "refresh_commission_status",
    "scaffold_project_intelligence",
  ];

  return {
    trigger_only_functions_identified: triggerNames.every((name) =>
      proposal.includes(`public.${name}()`),
    ),
    trigger_relations_are_schema_qualified: triggerSources.every((source) =>
      /public\.[a-z_]+/i.test(source),
    ),
    legacy_trigger_search_path_is_public: triggerSources.every((source) =>
      /security definer set search_path\s*=\s*public/i.test(source),
    ),
    legacy_trigger_direct_execute_not_revoked: triggerSources.every(
      (source) => !/revoke execute on function/i.test(source),
    ),
    atomic_lead_checks_auth_tenant_and_owner:
      atomicLead.includes("auth.uid() is null") &&
      atomicLead.includes(
        "p_organization_id <> public.current_organization_id()",
      ) &&
      atomicLead.includes("p_assigned_to <> auth.uid()"),
    atomic_lead_has_nonempty_search_path:
      /security definer\s+set search_path\s*=\s*public,\s*pg_temp/i.test(
        atomicLead,
      ),
    distribution_local_contract_is_service_only:
      distribution.includes(
        "revoke all on function public.distribute_project_leads(uuid, uuid, uuid, integer) from public, anon, authenticated",
      ) &&
      distribution.includes(
        "grant execute on function public.distribute_project_leads(uuid, uuid, uuid, integer) to service_role",
      ),
    project_mutation_checks_authenticated_actor:
      projectMutation.includes("v_actor_id uuid := auth.uid()") &&
      projectMutation.includes("authentication-required"),
    project_mutation_checks_tenant_and_role:
      projectMutation.includes("private.current_organization_id()") &&
      projectMutation.includes("private.can_manage_projects"),
    modern_empty_search_path_pattern_present:
      (joinedMigrations.match(/security definer set search_path\s*=\s*''/gi) ??
        []).length > 10,
    modern_service_only_rpc_pattern_present:
      joinedMigrations.includes(
        "from public,anon,authenticated;grant execute on function",
      ) ||
      joinedMigrations.includes(
        "from public, anon, authenticated;\ngrant execute on function",
      ),
    proposal_is_transactional:
      proposal.trimStart().includes("begin;") &&
      proposal.trimEnd().endsWith("rollback;"),
    proposal_has_no_commit: !/\bcommit\s*;/i.test(proposal),
    proposal_fails_closed_on_unresolved_decisions:
      proposal.includes("phase_006_blocked") &&
      proposal.includes("where decision = 'unresolved'"),
    proposal_revokes_trigger_direct_execute: triggerNames.every((name) =>
      proposal.includes(`revoke execute on function public.${name}()`),
    ),
    proposal_hardens_trigger_search_path: triggerNames.every((name) =>
      proposal.includes(
        `alter function public.${name}() set search_path = ''`,
      ),
    ),
    proposal_restores_distribution_service_only:
      proposal.includes(
        "revoke execute on function public.distribute_project_leads",
      ) &&
      proposal.includes(
        "grant execute on function public.distribute_project_leads",
      ),
    proposal_contains_no_destructive_ddl:
      !/\b(drop\s+table|truncate\s+table|delete\s+from)\b/i.test(proposal),
    all_no_policy_tables_listed:
      config.no_policy_table_review.length ===
        snapshot.advisor_findings.rls_enabled_without_policy.count &&
      snapshot.advisor_findings.rls_enabled_without_policy.tables.every(
        (table) =>
          config.no_policy_table_review.some((item) => item.table === table),
      ),
    all_privileged_functions_listed:
      snapshot.advisor_findings.authenticated_security_definer_executable.functions.every(
        (name) =>
          config.privileged_function_review.some(
            (item) => item.function === name,
          ),
      ),
    manifest_contains_no_secret_or_personal_values:
      !/(password|secret|service_role_key)["']?\s*:\s*["'][^"']+/i.test(
        JSON.stringify(config),
      ),
  };
}

export function assessSecurityHardening({
  localEvidence,
  observedSnapshot,
}) {
  const findings = observedSnapshot.advisor_findings;
  const runtime = observedSnapshot.runtime_evidence;

  const controls = {
    target_environment_confirmed:
      observedSnapshot.target.name === config.target_environment &&
      observedSnapshot.target.status === "ACTIVE_HEALTHY",
    evidence_is_sanitized:
      observedSnapshot.contains_personal_data === false &&
      observedSnapshot.contains_secret_values === false,
    remote_execution_disabled:
      config.execution_policy.remote_execution_enabled === false &&
      config.execution_policy.default_mode === "assessment_only",
    advisor_snapshot_current:
      observedSnapshot.observed_at === "2026-07-23" &&
      observedSnapshot.source === "supabase_mcp_security_advisor",
    catalog_acl_snapshot_available:
      observedSnapshot.catalog_acl_snapshot.available === true,
    trigger_only_functions_identified:
      localEvidence.trigger_only_functions_identified === true,
    trigger_relations_are_schema_qualified:
      localEvidence.trigger_relations_are_schema_qualified === true,
    atomic_lead_checks_auth_tenant_and_owner:
      localEvidence.atomic_lead_checks_auth_tenant_and_owner === true,
    project_mutation_checks_authenticated_actor:
      localEvidence.project_mutation_checks_authenticated_actor === true,
    project_mutation_checks_tenant_and_role:
      localEvidence.project_mutation_checks_tenant_and_role === true,
    distribution_local_contract_is_service_only:
      localEvidence.distribution_local_contract_is_service_only === true,
    modern_empty_search_path_pattern_present:
      localEvidence.modern_empty_search_path_pattern_present === true,
    modern_service_only_rpc_pattern_present:
      localEvidence.modern_service_only_rpc_pattern_present === true,
    proposal_is_transactional:
      localEvidence.proposal_is_transactional === true,
    proposal_has_no_commit: localEvidence.proposal_has_no_commit === true,
    proposal_fails_closed_on_unresolved_decisions:
      localEvidence.proposal_fails_closed_on_unresolved_decisions === true,
    proposal_revokes_trigger_direct_execute:
      localEvidence.proposal_revokes_trigger_direct_execute === true,
    proposal_hardens_trigger_search_path:
      localEvidence.proposal_hardens_trigger_search_path === true,
    proposal_restores_distribution_service_only:
      localEvidence.proposal_restores_distribution_service_only === true,
    proposal_contains_no_destructive_ddl:
      localEvidence.proposal_contains_no_destructive_ddl === true,
    all_no_policy_tables_listed:
      localEvidence.all_no_policy_tables_listed === true,
    all_privileged_functions_listed:
      localEvidence.all_privileged_functions_listed === true,
    manifest_contains_no_secret_or_personal_values:
      localEvidence.manifest_contains_no_secret_or_personal_values === true,
    all_no_policy_tables_classified:
      runtime.all_no_policy_tables_classified === true &&
      config.no_policy_table_review.every(
        ({ decision }) => decision !== "unresolved",
      ),
    rls_enabled_without_policy_zero:
      findings.rls_enabled_without_policy.count === 0,
    anon_security_definer_executable_zero:
      findings.anon_security_definer_executable.count === 0,
    authenticated_security_definer_contracts_approved:
      findings.authenticated_security_definer_executable.count === 0 ||
      runtime.authenticated_role_matrix_passed === true,
    trigger_only_direct_execute_revoked:
      runtime.trigger_only_direct_execute_revoked === true,
    security_definer_search_paths_hardened:
      runtime.security_definer_search_paths_hardened === true,
    future_default_privileges_reviewed:
      runtime.future_default_privileges_reviewed === true,
    anon_access_denial_passed: runtime.anon_access_denial_passed === true,
    authenticated_role_matrix_passed:
      runtime.authenticated_role_matrix_passed === true,
    cross_tenant_denial_passed: runtime.cross_tenant_denial_passed === true,
    rpc_actor_spoofing_denial_passed:
      runtime.rpc_actor_spoofing_denial_passed === true,
    policy_query_plan_reviewed: runtime.policy_query_plan_reviewed === true,
    backup_restore_receipt_approved:
      runtime.backup_restore_receipt_approved === true,
    isolated_rehearsal_passed: runtime.isolated_rehearsal_passed === true,
    rollback_rehearsal_passed: runtime.rollback_rehearsal_passed === true,
    security_advisors_clean: runtime.security_advisors_clean === true,
    human_execution_approval: runtime.human_execution_approval === true,
  };

  const passed = Object.values(controls).filter(Boolean).length;
  const blockers = Object.entries(controls)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    schema_version: config.schema_version,
    phase: config.phase,
    total_phases: config.total_phases,
    status: blockers.length
      ? "security_hardening_blocked"
      : "security_hardening_ready_for_controlled_application",
    target: observedSnapshot.target,
    findings: {
      rls_enabled_without_policy:
        findings.rls_enabled_without_policy.count,
      anon_security_definer_executable:
        findings.anon_security_definer_executable.count,
      authenticated_security_definer_executable:
        findings.authenticated_security_definer_executable.count,
      catalog_acl_snapshot_available:
        observedSnapshot.catalog_acl_snapshot.available,
    },
    local_evidence: localEvidence,
    controls: {
      passed,
      total: Object.keys(controls).length,
      percent: Math.round((passed / Object.keys(controls).length) * 100),
      results: controls,
      blockers,
    },
    execution: {
      ...observedSnapshot.execution,
      remote_write_executed: false,
      migration_applied: false,
      grant_changed: false,
      policy_changed: false,
      user_changed: false,
      build_executed: false,
      package_created: false,
    },
    production_ready: false,
    next_phase: config.next_phase,
  };
}

function readyFixture() {
  const local = Object.fromEntries(
    Object.keys(collectLocalEvidence()).map((key) => [key, true]),
  );
  const readyConfig = structuredClone(config);
  readyConfig.no_policy_table_review = readyConfig.no_policy_table_review.map(
    (item) => ({ ...item, decision: "server_only" }),
  );
  const readySnapshot = structuredClone(snapshot);
  readySnapshot.catalog_acl_snapshot.available = true;
  readySnapshot.advisor_findings.rls_enabled_without_policy.count = 0;
  readySnapshot.advisor_findings.rls_enabled_without_policy.tables = [];
  readySnapshot.advisor_findings.anon_security_definer_executable.count = 0;
  readySnapshot.advisor_findings.anon_security_definer_executable.functions = [];
  readySnapshot.advisor_findings.authenticated_security_definer_executable.count =
    0;
  readySnapshot.advisor_findings.authenticated_security_definer_executable.functions =
    [];
  readySnapshot.runtime_evidence = Object.fromEntries(
    Object.keys(readySnapshot.runtime_evidence).map((key) => [key, true]),
  );
  return { localEvidence: local, observedSnapshot: readySnapshot, readyConfig };
}

function selfTest() {
  const originalDecisions = config.no_policy_table_review;
  const fixture = readyFixture();
  config.no_policy_table_review = fixture.readyConfig.no_policy_table_review;
  const ready = assessSecurityHardening(fixture);
  config.no_policy_table_review = originalDecisions;
  const blocked = assessSecurityHardening({
    localEvidence: collectLocalEvidence(),
    observedSnapshot: snapshot,
  });
  const failures = [];

  if (ready.status !== "security_hardening_ready_for_controlled_application")
    failures.push("complete_evidence_must_reach_controlled_application_gate");
  if (blocked.status !== "security_hardening_blocked")
    failures.push("current_findings_must_block");
  if (!blocked.controls.blockers.includes("rls_enabled_without_policy_zero"))
    failures.push("missing_rls_policies_must_block");
  if (
    !blocked.controls.blockers.includes(
      "anon_security_definer_executable_zero",
    )
  )
    failures.push("anonymous_privileged_execution_must_block");
  if (!blocked.controls.blockers.includes("cross_tenant_denial_passed"))
    failures.push("cross_tenant_test_must_block");
  if (blocked.execution.remote_write_executed !== false)
    failures.push("assessment_must_remain_read_only");
  if (blocked.production_ready !== false)
    failures.push("assessment_must_not_promote_production");

  if (failures.length) {
    console.error(
      `ATLAS SECURITY HARDENING SELF-TEST: FAILED (${failures.join(", ")})`,
    );
    process.exit(1);
  }
  console.log("ATLAS SECURITY HARDENING SELF-TEST: PASSED");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  console.log(
    JSON.stringify(
      assessSecurityHardening({
        localEvidence: collectLocalEvidence(),
        observedSnapshot: snapshot,
      }),
      null,
      2,
    ),
  );
}

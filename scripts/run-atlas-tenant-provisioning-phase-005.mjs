import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const read = (url) => readFileSync(url, "utf8");
const readJson = (url) => JSON.parse(read(url));

const config = readJson(
  new URL(
    "../config/atlas-10x-phase-005-tenant-provisioning.json",
    import.meta.url,
  ),
);
const evidence = readJson(
  new URL(
    "../config/atlas-10x-phase-005-provisioning-evidence.json",
    import.meta.url,
  ),
);
const phase3Snapshot = readJson(
  new URL(
    "../config/atlas-10x-phase-003-remote-schema-snapshot.json",
    import.meta.url,
  ),
);
const phase4Snapshot = readJson(
  new URL(
    "../config/atlas-10x-phase-004-remote-identity-snapshot.json",
    import.meta.url,
  ),
);

function collectLocalEvidence() {
  const reset = read(
    new URL("../scripts/reset-official-auth-rbac.mjs", import.meta.url),
  );
  const bootstrap = read(
    new URL("../scripts/bootstrap-admin.mjs", import.meta.url),
  );
  const cleanup = read(
    new URL(
      "../supabase/migrations/20260711231000_cleanup_legacy_auth_provisioning.sql",
      import.meta.url,
    ),
  );
  const legacyProvisioning = read(
    new URL(
      "../supabase/migrations/20260711224500_harden_auth_profile_provisioning.sql",
      import.meta.url,
    ),
  );
  const canonicalHierarchy = read(
    new URL(
      "../supabase/migrations/20260717072714_secure_commercial_profile_hierarchy.sql",
      import.meta.url,
    ),
  );
  const compactHierarchy = read(
    new URL(
      "../supabase/migrations/20260717200655_official_auth_rbac.sql",
      import.meta.url,
    ),
  );
  const manifestText = JSON.stringify(config);
  const root = new URL("../", import.meta.url);

  return {
    exact_target_binding_present:
      existsSync(new URL(".env.local", root)) &&
      existsSync(new URL("supabase/config.toml", root)),
    reset_is_homologation_only:
      reset.includes('process.env.ATLAS_ENV !== "homologation"') &&
      reset.includes(
        'process.env.ATLAS_DATABASE_ENVIRONMENT !== "homologation"',
      ),
    reset_defaults_to_dry_run:
      reset.includes("const apply = process.argv.includes") &&
      reset.includes("if (!apply)") &&
      reset.includes("Simulação concluída"),
    reset_requires_explicit_confirmation:
      reset.includes("RESET_AND_INVITE_OFFICIAL_USERS"),
    service_secret_is_server_only:
      reset.includes("SUPABASE_SERVICE_ROLE_KEY") &&
      !reset.includes(
        ["NEXT", "PUBLIC", "SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
      ),
    reset_preserves_auth_history: !reset.includes("deleteUser("),
    bootstrap_preserves_auth_history: !bootstrap.includes("deleteUser("),
    reset_preserves_operational_history:
      reset.includes("ban_duration") &&
      reset.includes("active: false") &&
      !reset.includes('.from("leads").delete') &&
      !reset.includes('.from("tasks").delete'),
    secure_local_credential_permissions:
      reset.includes("0o700") && reset.includes("0o600"),
    recovery_redirect_is_https_gated:
      reset.includes("/^https:\\/\\//i") &&
      reset.includes("/auth/callback?next=/reset-password"),
    legacy_auto_tenant_provisioning_has_cleanup:
      legacyProvisioning.includes("'atlas-default'") &&
      cleanup.includes("drop trigger if exists on_auth_user_created") &&
      cleanup.includes("drop function if exists public.handle_new_auth_user"),
    canonical_four_level_hierarchy_present:
      ["director", "superintendent", "manager", "broker"].every((role) =>
        canonicalHierarchy.includes(`'${role}'`),
      ),
    one_canonical_hierarchy_active_locally:
      !(
        canonicalHierarchy.includes("superintendent_requires_director") &&
        compactHierarchy.includes(
          "operational_director_requires_decision_director",
        )
      ),
    official_reset_matches_canonical_slots:
      reset.includes('commercialRole: "superintendent"') &&
      reset.includes('commercialRole: "manager"') &&
      reset.includes('commercialRole: "broker"'),
    single_provisioning_entrypoint:
      !bootstrap.includes("auth.admin.createUser") ||
      !reset.includes("auth.admin.createUser"),
    organization_resolved_before_auth:
      reset.indexOf('from("organizations")') <
      reset.indexOf("auth.admin.createUser"),
    auth_resolved_before_profile:
      reset.indexOf("auth.admin.createUser") <
      reset.indexOf('.from("profiles").upsert'),
    parent_linked_before_child:
      reset.includes("const ids = new Map()") &&
      reset.includes("ids.get(item.supervisor)") &&
      reset.includes("ids.set(item.key, user.id)"),
    profile_upsert_is_idempotent:
      reset.includes('.from("profiles").upsert') &&
      reset.includes('onConflict: "id"'),
    no_secret_or_personal_value_in_manifest:
      config.canonical_identity_slots.every(
        (slot) =>
          slot.email_env.startsWith("ATLAS_INITIAL_") &&
          !Object.hasOwn(slot, "email") &&
          !Object.hasOwn(slot, "name"),
      ) &&
      !/(password|secret)["']?\s*:\s*["'][^"']+/i.test(manifestText),
    execution_disabled_in_manifest:
      config.execution_policy.remote_execution_enabled === false &&
      config.execution_policy.default_mode === "plan_only",
  };
}

export function assessTenantProvisioning({
  localEvidence,
  observedEvidence,
  phase3,
  phase4,
}) {
  const approvals = observedEvidence.approvals;
  const prerequisites = observedEvidence.prerequisites;
  const remote = observedEvidence.remote_security_surface;
  const target = observedEvidence.target;

  const controls = {
    target_environment_confirmed:
      target.name === config.target_environment &&
      target.status === "ACTIVE_HEALTHY",
    evidence_is_sanitized:
      observedEvidence.contains_personal_data === false &&
      observedEvidence.contains_secret_values === false,
    execution_is_disabled_by_default:
      localEvidence.execution_disabled_in_manifest === true,
    exact_target_binding_present:
      localEvidence.exact_target_binding_present === true &&
      target.target_fingerprint_pinned_locally === true,
    phase_003_schema_parity_ready:
      prerequisites.phase_003_schema_parity_ready === true &&
      phase3.conclusion.migration_history_reproducible === true &&
      phase3.conclusion.production_ready === true,
    phase_004_identity_rbac_ready:
      prerequisites.phase_004_identity_rbac_ready === true &&
      phase4.conclusion.identity_rbac_ready === true,
    migration_history_reproducible:
      prerequisites.migration_history_reproducible === true,
    remote_auth_trigger_state_verified:
      prerequisites.remote_auth_trigger_state_verified === true,
    rls_policy_coverage_clean:
      prerequisites.rls_policy_coverage_clean === true &&
      remote.rls_enabled_without_policy === 0,
    privileged_function_grants_reviewed:
      prerequisites.privileged_function_grants_reviewed === true &&
      remote.anon_security_definer_executable === 0,
    reset_is_homologation_only:
      localEvidence.reset_is_homologation_only === true,
    reset_defaults_to_dry_run:
      localEvidence.reset_defaults_to_dry_run === true,
    reset_requires_explicit_confirmation:
      localEvidence.reset_requires_explicit_confirmation === true,
    service_secret_is_server_only:
      localEvidence.service_secret_is_server_only === true,
    no_secret_or_personal_value_in_manifest:
      localEvidence.no_secret_or_personal_value_in_manifest === true,
    reset_preserves_auth_history:
      localEvidence.reset_preserves_auth_history === true,
    bootstrap_preserves_auth_history:
      localEvidence.bootstrap_preserves_auth_history === true,
    reset_preserves_operational_history:
      localEvidence.reset_preserves_operational_history === true,
    secure_local_credential_permissions:
      localEvidence.secure_local_credential_permissions === true,
    recovery_redirect_is_https_gated:
      localEvidence.recovery_redirect_is_https_gated === true,
    legacy_auto_tenant_provisioning_has_cleanup:
      localEvidence.legacy_auto_tenant_provisioning_has_cleanup === true,
    canonical_four_level_hierarchy_present:
      localEvidence.canonical_four_level_hierarchy_present === true,
    one_canonical_hierarchy_active_locally:
      localEvidence.one_canonical_hierarchy_active_locally === true,
    official_reset_matches_canonical_slots:
      localEvidence.official_reset_matches_canonical_slots === true,
    single_provisioning_entrypoint:
      localEvidence.single_provisioning_entrypoint === true,
    organization_resolved_before_auth:
      localEvidence.organization_resolved_before_auth === true,
    auth_resolved_before_profile:
      localEvidence.auth_resolved_before_profile === true,
    parent_linked_before_child:
      localEvidence.parent_linked_before_child === true,
    profile_upsert_is_idempotent:
      localEvidence.profile_upsert_is_idempotent === true,
    canonical_roster_approved: approvals.canonical_roster_approved === true,
    recovery_destination_approved:
      approvals.recovery_destination_approved === true,
    backup_restore_receipt_approved:
      approvals.backup_restore_receipt_approved === true,
    isolated_rehearsal_passed:
      approvals.isolated_rehearsal_passed === true,
    cross_tenant_denial_passed:
      approvals.cross_tenant_denial_passed === true,
    role_login_matrix_passed:
      approvals.role_login_matrix_passed === true,
    rollback_rehearsal_passed:
      approvals.rollback_rehearsal_passed === true,
    human_execution_approval:
      approvals.human_execution_approval === true,
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
      ? "tenant_provisioning_blocked"
      : "tenant_provisioning_ready_for_human_execution",
    target: {
      name: target.name,
      auth_users: target.auth_users,
      organizations: target.organizations,
      profiles: target.profiles,
    },
    packet: {
      mode: config.execution_policy.default_mode,
      remote_execution_enabled:
        config.execution_policy.remote_execution_enabled,
      identity_slots: config.canonical_identity_slots.map(
        ({ slot, email_env, access_role, commercial_role, reports_to }) => ({
          slot,
          email_env,
          access_role,
          commercial_role,
          reports_to,
        }),
      ),
      ordered_steps: config.ordered_steps,
      rollback: config.rollback_contract,
    },
    local_evidence: localEvidence,
    controls: {
      passed,
      total: Object.keys(controls).length,
      results: controls,
      blockers,
    },
    execution: {
      ...observedEvidence.execution,
      remote_write_executed: false,
      organization_created: false,
      auth_users_created: false,
      profiles_created: false,
      migrations_applied: false,
      build_executed: false,
      package_created: false,
    },
    production_ready: false,
    next_phase: config.next_phase,
  };
}

function readyFixture() {
  const allLocal = Object.fromEntries(
    Object.keys(collectLocalEvidence()).map((key) => [key, true]),
  );
  const readyEvidence = {
    ...evidence,
    target: {
      ...evidence.target,
      auth_users: 5,
      organizations: 1,
      profiles: 5,
      target_fingerprint_pinned_locally: true,
    },
    prerequisites: Object.fromEntries(
      Object.keys(evidence.prerequisites).map((key) => [key, true]),
    ),
    remote_security_surface: {
      rls_enabled_without_policy: 0,
      anon_security_definer_executable: 0,
      authenticated_security_definer_executable: 0,
    },
    approvals: Object.fromEntries(
      Object.keys(evidence.approvals).map((key) => [key, true]),
    ),
  };
  return {
    localEvidence: allLocal,
    observedEvidence: readyEvidence,
    phase3: {
      conclusion: {
        migration_history_reproducible: true,
        production_ready: true,
      },
    },
    phase4: { conclusion: { identity_rbac_ready: true } },
  };
}

function selfTest() {
  const ready = assessTenantProvisioning(readyFixture());
  const blocked = assessTenantProvisioning({
    localEvidence: collectLocalEvidence(),
    observedEvidence: evidence,
    phase3: phase3Snapshot,
    phase4: phase4Snapshot,
  });
  const failures = [];

  if (ready.status !== "tenant_provisioning_ready_for_human_execution")
    failures.push("complete_evidence_must_reach_human_execution_gate");
  if (blocked.status !== "tenant_provisioning_blocked")
    failures.push("missing_prerequisites_must_block");
  if (!blocked.controls.blockers.includes("phase_003_schema_parity_ready"))
    failures.push("phase_003_must_block");
  if (!blocked.controls.blockers.includes("human_execution_approval"))
    failures.push("human_approval_must_block");
  if (blocked.execution.remote_write_executed !== false)
    failures.push("assessment_must_remain_read_only");
  if (blocked.production_ready !== false)
    failures.push("assessment_must_not_promote_production");

  if (failures.length) {
    console.error(
      `ATLAS TENANT PROVISIONING SELF-TEST: FAILED (${failures.join(", ")})`,
    );
    process.exit(1);
  }
  console.log("ATLAS TENANT PROVISIONING SELF-TEST: PASSED");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  console.log(
    JSON.stringify(
      assessTenantProvisioning({
        localEvidence: collectLocalEvidence(),
        observedEvidence: evidence,
        phase3: phase3Snapshot,
        phase4: phase4Snapshot,
      }),
      null,
      2,
    ),
  );
}

import { readFileSync } from "node:fs";
import process from "node:process";

const read = (url) => readFileSync(url, "utf8");
const readJson = (url) => JSON.parse(read(url));

const config = readJson(
  new URL("../config/atlas-10x-phase-004-identity-rbac.json", import.meta.url),
);
const defaultSnapshot = readJson(
  new URL(
    "../config/atlas-10x-phase-004-remote-identity-snapshot.json",
    import.meta.url,
  ),
);

const isEvidenceCurrent = (observedAt, now = new Date()) => {
  const observed = new Date(`${observedAt}T00:00:00.000Z`);
  const maximumAgeMs = Number(config.remote_evidence_max_age_days) * 86_400_000;
  return Number.isFinite(observed.getTime()) && now.getTime() - observed.getTime() <= maximumAgeMs;
};

function collectLocalEvidence() {
  const apiSecurity = read(new URL("../lib/api/security.ts", import.meta.url));
  const alternateSecurity = read(
    new URL("../lib/security/api-auth.ts", import.meta.url),
  );
  const authContext = read(
    new URL("../lib/auth/atlas-auth-context.ts", import.meta.url),
  );
  const login = read(
    new URL("../app/(auth)/login/page.tsx", import.meta.url),
  );
  const callback = read(
    new URL("../app/auth/callback/route.ts", import.meta.url),
  );
  const resetPassword = read(
    new URL("../app/(auth)/reset-password/page.tsx", import.meta.url),
  );
  const safeRedirect = read(
    new URL("../lib/auth/safe-redirect.ts", import.meta.url),
  );
  const fullHierarchy = read(
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
  const authorizationSources = `${apiSecurity}\n${alternateSecurity}`;
  const triggerStatement =
    fullHierarchy.match(
      /create trigger validate_commercial_hierarchy[\s\S]*?execute function private\.validate_commercial_hierarchy\(\);/i,
    )?.[0] ?? "";

  return {
    server_profile_source:
      authorizationSources.includes('.from("profiles")') &&
      authorizationSources.includes('.eq("id", auth.user.id)') &&
      authorizationSources.includes('.eq("id", userData.user.id)'),
    editable_metadata_not_authoritative:
      !/(raw_user_meta_data|user_metadata)/i.test(authorizationSources),
    active_profile_and_organization_required:
      apiSecurity.includes("PROFILE_INACTIVE") &&
      apiSecurity.includes("ORGANIZATION_INACTIVE") &&
      alternateSecurity.includes("Perfil inativo.") &&
      alternateSecurity.includes("Organização inativa."),
    safe_post_login_redirect:
      login.includes("safeAuthDestination") &&
      safeRedirect.includes('value.startsWith("//")') &&
      safeRedirect.includes('value.includes("\\\\")') &&
      safeRedirect.includes("AUTH_PATHS.has(pathname)"),
    recovery_flow_hardened:
      callback.includes("httpOnly: true") &&
      callback.includes('sameSite: "strict"') &&
      callback.includes("maxAge: 15 * 60") &&
      resetPassword.includes("password.length >= 12") &&
      resetPassword.includes("password.length <= 128"),
    no_unbound_tenant_fallback:
      !authorizationSources.includes("ATLAS_DEFAULT_ORGANIZATION_ID"),
    single_canonical_role_model:
      !(
        fullHierarchy.includes("superintendent_requires_director") &&
        compactHierarchy.includes(
          "operational_director_requires_decision_director",
        )
      ),
    validation_trigger_covers_access_role:
      triggerStatement.includes("access_role"),
    hierarchy_proposal_present: true,
    auth_context_rejects_unknown_access_role:
      authContext.includes("function isAccessRole") &&
      authContext.includes("!isAccessRole(profile.accessRole)"),
  };
}

export function assessIdentityRbac({ localEvidence, snapshot }) {
  const target = snapshot.target;
  const advisors = snapshot.security_advisors;
  const runtime = snapshot.runtime_evidence;
  const phase3 = snapshot.phase_003_prerequisite;
  const controls = {
    target_environment_confirmed:
      target.name === config.target_environment &&
      target.status === "ACTIVE_HEALTHY",
    remote_evidence_current:
      snapshot.source === "supabase_mcp_read_only" &&
      snapshot.contains_personal_data === false &&
      isEvidenceCurrent(snapshot.observed_at),
    phase_003_schema_parity_ready:
      phase3.migration_history_reproducible === true &&
      phase3.operational_tenant_present === true &&
      phase3.production_ready === true,
    operational_auth_users_present: Number(target.auth_users) > 0,
    operational_organization_present: Number(target.organizations) > 0,
    operational_profiles_present: Number(target.profiles) > 0,
    auth_profile_parity_verified:
      Number(target.auth_users) > 0 &&
      target.auth_users === target.profiles &&
      runtime.auth_profile_parity_verified === true,
    organization_binding_verified:
      runtime.organization_binding_verified === true,
    server_profile_source: localEvidence.server_profile_source === true,
    editable_metadata_not_authoritative:
      localEvidence.editable_metadata_not_authoritative === true,
    active_profile_and_organization_required:
      localEvidence.active_profile_and_organization_required === true,
    safe_post_login_redirect:
      localEvidence.safe_post_login_redirect === true,
    recovery_flow_hardened: localEvidence.recovery_flow_hardened === true,
    no_unbound_tenant_fallback:
      localEvidence.no_unbound_tenant_fallback === true,
    single_canonical_role_model:
      localEvidence.single_canonical_role_model === true,
    validation_trigger_covers_access_role:
      localEvidence.validation_trigger_covers_access_role === true,
    auth_context_rejects_unknown_access_role:
      localEvidence.auth_context_rejects_unknown_access_role === true,
    all_public_tables_have_rls:
      target.public_tables > 0 &&
      target.public_tables === target.rls_enabled_tables &&
      target.rls_disabled_tables === 0,
    policy_coverage_clean:
      advisors.rls_enabled_without_policy.count === 0,
    anon_security_definer_exposure_clean:
      advisors.anon_security_definer_executable.count === 0,
    privileged_function_grants_reviewed:
      runtime.privileged_function_grants_reviewed === true,
    commercial_role_matrix_verified:
      runtime.commercial_role_matrix_verified === true,
    cross_tenant_denial_verified:
      runtime.cross_tenant_denial_verified === true,
    real_user_login_verified: runtime.real_user_login_verified === true,
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
      ? "identity_rbac_blocked"
      : "identity_rbac_ready",
    target: {
      name: target.name,
      auth_users: target.auth_users,
      organizations: target.organizations,
      profiles: target.profiles,
      public_tables: target.public_tables,
    },
    local: {
      authorization_source: config.authorization_source.authorization,
      role_contract: config.commercial_hierarchy,
      evidence: localEvidence,
    },
    remote_risks: {
      rls_enabled_without_policy:
        advisors.rls_enabled_without_policy.count,
      anon_security_definer_executable:
        advisors.anon_security_definer_executable.count,
      authenticated_security_definer_executable:
        advisors.authenticated_security_definer_executable.count,
    },
    controls: {
      passed,
      total: Object.keys(controls).length,
      results: controls,
      blockers,
    },
    release: {
      remote_write_executed: false,
      auth_users_created: false,
      migration_applied: false,
      build_executed: false,
      package_created: false,
      production_ready: false,
      reason: blockers.length
        ? "tenant_identity_policies_or_hierarchy_not_proven"
        : "human_release_decision_still_required",
    },
    next_phase: config.next_phase,
  };
}

function readySnapshot() {
  return {
    ...defaultSnapshot,
    observed_at: new Date().toISOString().slice(0, 10),
    target: {
      ...defaultSnapshot.target,
      auth_users: 5,
      organizations: 1,
      profiles: 5,
      public_tables: 10,
      rls_enabled_tables: 10,
      rls_disabled_tables: 0,
    },
    security_advisors: {
      rls_enabled_without_policy: { count: 0, tables: [] },
      anon_security_definer_executable: { count: 0, functions: [] },
      authenticated_security_definer_executable: {
        count: 0,
        functions: [],
      },
    },
    runtime_evidence: Object.fromEntries(
      Object.keys(defaultSnapshot.runtime_evidence).map((key) => [key, true]),
    ),
    phase_003_prerequisite: {
      migration_history_reproducible: true,
      operational_tenant_present: true,
      production_ready: true,
    },
  };
}

function selfTest() {
  const allLocalEvidence = Object.fromEntries(
    Object.keys(collectLocalEvidence()).map((key) => [key, true]),
  );
  const ready = assessIdentityRbac({
    localEvidence: allLocalEvidence,
    snapshot: readySnapshot(),
  });
  const blocked = assessIdentityRbac({
    localEvidence: {
      ...allLocalEvidence,
      no_unbound_tenant_fallback: false,
    },
    snapshot: defaultSnapshot,
  });
  const failures = [];

  if (ready.status !== "identity_rbac_ready")
    failures.push("complete_evidence_must_be_ready");
  if (blocked.status !== "identity_rbac_blocked")
    failures.push("missing_identity_must_block");
  if (!blocked.controls.blockers.includes("no_unbound_tenant_fallback"))
    failures.push("tenant_fallback_must_block");
  if (blocked.release.remote_write_executed !== false)
    failures.push("assessment_must_remain_read_only");
  if (blocked.release.production_ready !== false)
    failures.push("assessment_must_never_promote_production");

  if (failures.length) {
    console.error(
      `ATLAS IDENTITY + RBAC SELF-TEST: FAILED (${failures.join(", ")})`,
    );
    process.exit(1);
  }
  console.log("ATLAS IDENTITY + RBAC SELF-TEST: PASSED");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  console.log(
    JSON.stringify(
      assessIdentityRbac({
        localEvidence: collectLocalEvidence(),
        snapshot: defaultSnapshot,
      }),
      null,
      2,
    ),
  );
}

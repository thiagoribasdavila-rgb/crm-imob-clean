import { existsSync, readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const hierarchy = read("supabase/migrations/20260716212459_commercial_hierarchy_and_bulk_transfer.sql");
const reconciliation = read("supabase/migration-drafts/20260719070511_reconcile_legacy_and_canonical_contracts.sql");
const pgTap = read("supabase/tests/database/phase_013_rls_jwt_contract.test.sql");
const remote = JSON.parse(read("config/fixtures/meta-rls-policy-baseline-sanitized.json"));
const checks = [];
const check = (id, passed, scope) => checks.push({ id, passed, scope });

check("profile_helper_present", hierarchy.includes("private.can_view_commercial_profile"), "local_contract");
check("lead_helper_present", hierarchy.includes("private.can_access_commercial_lead"), "local_contract");
check("identity_uses_auth_uid", hierarchy.includes("where id = (select auth.uid())"), "local_contract");
check("profile_policy_hierarchical", hierarchy.includes("create policy profiles_commercial_scope"), "local_contract");
check("lead_crud_policies_separate", ["select", "insert", "update", "delete"].every((verb) => hierarchy.includes(`create policy leads_commercial_${verb}`)), "local_contract");
check("update_using_and_with_check", /create policy leads_commercial_update[\s\S]*?using \([\s\S]*?with check \(/.test(hierarchy), "local_contract");
check("helper_search_path_empty", (hierarchy.match(/set search_path = ''/g) ?? []).length >= 3, "local_contract");
check("anon_helper_execute_revoked", hierarchy.includes("from public, anon"), "local_contract");
check("service_only_bulk_transfer", hierarchy.includes("from public, anon, authenticated") && hierarchy.includes("to service_role"), "local_contract");
check("no_editable_metadata_in_authorization", !/(raw_user_meta_data|user_metadata)/i.test(hierarchy), "local_contract");
check("reconciliation_private_schema_hardened", reconciliation.includes("revoke all on schema private from public, anon"), "local_contract");
check(
  "reconciliation_explicit_grants",
  reconciliation.includes("revoke all on table public.profiles, public.leads from authenticated")
    && reconciliation.includes("grant select (")
    && reconciliation.includes("on table public.profiles to authenticated")
    && reconciliation.includes("grant select, insert, update on table public.leads to authenticated")
    && reconciliation.includes("grant all on table public.profiles, public.leads to service_role"),
  "local_contract",
);
check("pgtap_has_plan", pgTap.includes("select plan(31)"), "staging_test_asset");
check("pgtap_checks_rls", pgTap.includes("relrowsecurity") && pgTap.includes("leads_commercial_update"), "staging_test_asset");
check("pgtap_checks_metadata_boundary", pgTap.includes("raw_user_meta_data|user_metadata"), "staging_test_asset");
check("pgtap_checks_explicit_grants", pgTap.includes("has_table_privilege") && pgTap.includes("has_function_privilege"), "staging_test_asset");

const promotedDraft = existsSync(new URL("../supabase/migrations/20260719070511_reconcile_legacy_and_canonical_contracts.sql", import.meta.url));
check("reconciliation_not_promoted_without_staging", !promotedDraft, "release_gate");

const remoteHierarchyProven = remote.canonicalPolicies.leadVisibilityHelperReferences > 0
  && remote.canonicalPolicies.reportsToReferences > 0
  && remote.runtimeEvidence.roleHierarchyApproved === true;
check("remote_hierarchy_not_falsely_claimed", remoteHierarchyProven === false, "remote_evidence");
check("separate_staging_required", remote.projects.separateStagingDetected === false, "remote_evidence");

const localPassed = checks.filter((item) => item.scope !== "remote_evidence").every((item) => item.passed);
console.log(JSON.stringify({
  phase: 13,
  passed: localPassed,
  localContractPassed: localPassed,
  remoteHierarchyProven,
  deploymentReady: false,
  checks,
  findings: remoteHierarchyProven ? [] : [
    "remote_policy_snapshot_contains_tenant_scope_only",
    "commercial_hierarchy_requires_isolated_staging_proof",
  ],
}, null, 2));
if (!localPassed) process.exit(1);

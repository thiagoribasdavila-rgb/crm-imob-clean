import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const packageJson = JSON.parse(read("package.json"));
const middleware = read("utils/supabase/middleware.ts");
const apiAuth = read("lib/security/api-auth.ts");
const sessions = read("app/api/auth/sessions/route.ts");
const hierarchy = read("supabase/migrations/20260716212459_commercial_hierarchy_and_bulk_transfer.sql");
const runner = read("scripts/run-meta-auth-jwt-data-api-staging.mjs");
const envExample = read(".env.example");
const checks = [];
const check = (id, passed, surface) => checks.push({ id, passed, surface });

check("middleware_verifies_signed_claims", middleware.includes("auth.getClaims()") && middleware.includes("claimsData?.claims?.sub"), "application_auth");
check("api_revalidates_user_server_side", apiAuth.includes("auth.getUser(token)") && apiAuth.includes('.from("profiles")'), "application_auth");
check("api_rejects_inactive_profile", apiAuth.includes("profile.active === false") && apiAuth.includes("Perfil inativo"), "application_auth");
check("sessions_revalidate_user", sessions.includes("auth.getUser()") && sessions.includes("auth.getSession()"), "session_control");
check("tokens_not_returned", sessions.includes("tokensReturned: false") && !sessions.includes("access_token") && !sessions.includes("refresh_token"), "session_control");
check("revocation_scopes_explicit", sessions.includes('"local"') && sessions.includes('"others"') && sessions.includes('"global"'), "session_control");
check("rls_ignores_editable_metadata", !hierarchy.includes("user_metadata") && !hierarchy.includes("raw_user_meta_data"), "database_authorization");
check("rls_uses_database_hierarchy", hierarchy.includes("private.can_access_commercial_lead") && hierarchy.includes("reports_to"), "database_authorization");
check("runner_is_staging_only", runner.includes('environment !== "staging_clone"') && runner.includes("production_target_forbidden"), "staging_harness");
check("runner_requires_https_and_exact_ref", runner.includes("https_staging_target_required") && runner.includes("expected_staging_project_reference_mismatch"), "staging_harness");
check("runner_classifies_keys", runner.includes("sb_publishable_") && runner.includes("sb_secret_") && runner.includes("legacy_service_role"), "staging_harness");
check("runner_verifies_jwks", runner.includes("/.well-known/jwks.json") && runner.includes("jwks_discovery_reachable"), "jwt_verification");
check("runner_uses_get_claims", runner.includes("auth.getClaims") && runner.includes("signatureVerified"), "jwt_verification");
check("runner_checks_claim_contract", ["claims.sub", "claims.role", "claims.aud", "claims.iss", "claims.exp", "claims.iat", "claims.session_id"].every((marker) => runner.includes(marker)), "jwt_verification");
check("runner_refreshes_and_rotates", runner.includes("auth.refreshSession") && runner.includes("refresh_token_rotation_verified"), "session_control");
check("runner_tests_refresh_revocation", runner.includes('signOut({ scope: "global" })') && runner.includes("revoked_refresh_token_rejected"), "session_control");
check("runner_does_not_overclaim_access_revocation", runner.includes("accessTokenImmediateRevocationNotClaimed") && runner.includes("accessTokenMayRemainValidUntilExpiryAfterSignOut"), "session_control");
check("runner_tests_data_api_roles", runner.includes("anonymous_data_api_denied") && runner.includes("service_role_server_boundary") && runner.includes("director_data_api_scope"), "data_api");
check("runner_tests_cross_tenant_write", runner.includes("cross_tenant_data_api_update_denied") && runner.includes("mutation_probe_restored"), "data_api");
check("runner_tests_editable_metadata", runner.includes("auth.updateUser") && runner.includes("editable_metadata_escalation_denied") && runner.includes("editable_metadata_restored"), "authorization_attack");
check("runner_never_persists_tokens", runner.includes("tokenValuesPersisted: false") && !runner.includes("console.log(data.session") && !runner.includes("accessToken:"), "secret_safety");
const forbiddenPublicServiceKeyName = ["NEXT", "PUBLIC", "SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
check("server_secret_not_public_env", envExample.includes("SUPABASE_SERVICE_ROLE_KEY=") && !envExample.includes(forbiddenPublicServiceKeyName), "secret_safety");
check("supabase_client_version_pinned", packageJson.dependencies?.["@supabase/supabase-js"] === "2.110.0", "supply_chain");

const passed = checks.every((item) => item.passed);
console.log(JSON.stringify({
  format: "atlas_meta_auth_jwt_static_audit_v1",
  passed,
  checkCount: checks.length,
  checks,
  remoteCalls: false,
  databaseMutation: false,
  buildExecuted: false,
}, null, 2));
if (!passed) process.exit(1);

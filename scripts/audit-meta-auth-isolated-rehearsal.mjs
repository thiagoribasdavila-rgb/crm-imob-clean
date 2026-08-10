import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const runner = read("scripts/run-meta-auth-isolated-rehearsal.mjs");
const phase14 = read("scripts/run-meta-auth-jwt-data-api-staging.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const marker of [
  "staging_clone_required",
  "explicit_staging_mutation_approval_required",
  "empty_clone_confirmation_required",
  "production_target_forbidden",
  "expected_staging_project_reference_mismatch",
  "invalid_publishable_key_class",
  "invalid_secret_key_class",
]) expect(runner.includes(marker), `gate de ambiente ausente: ${marker}`);

for (const marker of [
  "isolated_clone_not_empty",
  "required_schema_missing_",
  "auth.admin.listUsers",
  "auth.admin.createUser",
  "email_confirm: true",
  "app_metadata",
  "access_role",
  "commercial_role",
  "reports_to",
  "example.invalid",
]) expect(runner.includes(marker), `provisionamento efemero incompleto: ${marker}`);

for (const marker of [
  "run-meta-auth-jwt-data-api-staging.mjs",
  "ATLAS_AUTH_TEST_BROKER_A_EMAIL",
  "ATLAS_AUTH_TEST_MANAGER_A_EMAIL",
  "ATLAS_AUTH_TEST_DIRECTOR_A_EMAIL",
  "ATLAS_AUTH_TEST_BROKER_B_EMAIL",
  "ATLAS_AUTH_TEST_CROSS_TENANT_LEAD_B_ID",
]) expect(runner.includes(marker), `encadeamento da Fase 14 ausente: ${marker}`);

for (const marker of [
  "const cleanupResult = await cleanup()",
  "cleanup_leads_failed",
  "cleanup_profiles_failed",
  "auth.admin.deleteUser",
  "cleanup_organizations_failed",
  "cleanup_residual_detected",
  "credentialsPersisted: false",
  "containsSecrets: false",
  "containsPersonalData: false",
  "projectIdentifiersPersisted: false",
]) expect(runner.includes(marker), `limpeza/evidencia incompleta: ${marker}`);

expect(!runner.includes("console.log(login") && !runner.includes("console.log(credentials"), "credenciais podem ser impressas");
expect(!runner.includes("SUPABASE_SERVICE_ROLE_KEY="), "segredo literal nao pode ser persistido");
expect(phase14.includes("auth.signInWithPassword") && phase14.includes("auth.getClaims"), "executor Auth/JWT herdado invalido");
expect(phase14.includes("editable_metadata_escalation_denied") && phase14.includes("cross_tenant_data_api_update_denied"), "cobertura RLS herdada incompleta");

if (failures.length) {
  console.error("META AUTH ISOLATED REHEARSAL AUDIT: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("META AUTH ISOLATED REHEARSAL AUDIT: aprovada — clone vazio, fixtures efemeras, Auth/JWT/RLS e limpeza total estao contratualmente protegidos.");

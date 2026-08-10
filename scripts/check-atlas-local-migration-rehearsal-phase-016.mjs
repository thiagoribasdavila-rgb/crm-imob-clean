import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

const config = readJson(
  "config/atlas-10x-phase-016-local-migration-rehearsal.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-016/local-migration-rehearsal-evidence.json",
);
const packageJson = readJson("package.json");
const evaluator = read(
  "scripts/run-atlas-local-migration-rehearsal-phase-016.mjs",
);
const reviewTemplate = read(
  "scripts/sql/phase-016-local-migration-rehearsal-template.sql",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_016_LOCAL_MIGRATION_REHEARSAL.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_016_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-016.v1" &&
    config.phase === 16 &&
    config.total_phases === 24,
  "contrato da Fase 16 está versionado",
);
expect(
  config.input_contract.required_scope ===
    "isolated_loopback_pg17_only" &&
    config.input_contract.expected_postgres_major === 17 &&
    config.input_contract.expected_cli_version === "2.109.1",
  "alvo é exclusivamente PostgreSQL 17 local com CLI conhecida",
);
expect(
  config.permit_contract.one_shot_required === true &&
    config.permit_contract.maximum_validity_minutes === 60 &&
    config.permit_contract.permit_does_not_authorize_remote_apply === true,
  "permit é de uso único, curto e não autoriza remoto",
);
expect(
  config.permit_contract.manifest_sha256_required === true &&
    config.permit_contract.migration_sha256_required === true &&
    config.permit_contract.dynamic_test_sha256_required === true &&
    config.permit_contract.review_sha256_required === true,
  "permit vincula manifesto, migration, teste e revisão por hash",
);
expect(
  config.artifact_contract.migration_must_be_scaffolded_with_cli === true &&
    config.artifact_contract.migration_business_dml_allowed === false &&
    config.artifact_contract.migration_auth_user_access_allowed === false,
  "migration nasce pelo CLI e não toca dados comerciais ou auth.users",
);
expect(
  config.artifact_contract.test_synthetic_fixture_dml_allowed === true &&
    config.artifact_contract.test_must_always_rollback === true &&
    config.artifact_contract.raw_cli_output_persisted === false,
  "teste só usa fixtures sintéticas descartáveis e saída sanitizada",
);
expect(
  config.sql_review_contract.rls_and_grants_reviewed_separately === true &&
    config.sql_review_contract.update_policy_requires_select_using_with_check ===
      true &&
    config.sql_review_contract.views_require_security_invoker_or_no_api_exposure ===
      true,
  "RLS, grants, UPDATE e views têm revisão explícita",
);
expect(
  config.sql_review_contract.security_definer_requires_fixed_search_path_and_minimal_execute ===
    true &&
    config.sql_review_contract.user_metadata_authorization_forbidden === true &&
    config.sql_review_contract.auth_role_policy_helper_forbidden === true,
  "funções privilegiadas e autorização seguem controles atuais",
);
expect(
  config.cli_contract.forbidden_tokens.includes("--linked") &&
    config.cli_contract.forbidden_tokens.includes("--db-url") &&
    config.cli_contract.forbidden_tokens.includes("supabase db push") &&
    config.cli_contract.forbidden_tokens.includes(
      "supabase migration repair",
    ),
  "comandos vinculados, URL direta, push e repair são proibidos",
);
expect(
  config.cli_contract.commands.every((command) =>
    command.includes("--local"),
  ) &&
    config.cli_contract.commands.some((command) =>
      command.includes("db reset --local --no-seed"),
    ) &&
    config.cli_contract.commands.some((command) =>
      command.includes("test db <approved_test_path> --local"),
    ),
  "plano publicado usa somente comandos explicitamente locais",
);
expect(
  config.cli_contract.commands.some((command) =>
    command.includes("db lint --local"),
  ) &&
    config.cli_contract.commands.some((command) =>
      command.includes("db advisors --local --type security"),
    ) &&
    config.cli_contract.commands.some((command) =>
      command.includes("db advisors --local --type performance"),
    ),
  "lint e advisors locais são gates do ensaio",
);
expect(
  config.rehearsal_contract.second_clean_reset_required === true &&
    config.rehearsal_contract.second_dynamic_test_required === true &&
    config.rehearsal_contract.idempotency_proof_required === true,
  "segundo reset e segundo teste comprovam repetibilidade",
);
expect(
  config.rehearsal_contract.positive_rls_paths_required === true &&
    config.rehearsal_contract.cross_tenant_denials_required === true &&
    config.rehearsal_contract.anonymous_denials_required === true,
  "pgTAP exige acesso positivo e negativas anon/cross-tenant",
);
expect(
  config.rehearsal_contract.grants_verified_separately_from_rls === true &&
    config.rehearsal_contract.catalog_delta_matches_exact_allowlist === true,
  "grants e delta de catálogo respeitam allowlist exata",
);
expect(
  config.execution_policy.allows_remote_metadata_read === false &&
    config.execution_policy.allows_remote_schema_read === false &&
    config.execution_policy.allows_remote_ddl === false &&
    config.execution_policy.allows_remote_dml === false,
  "contrato não permite leitura ou escrita remota",
);
expect(
  config.execution_policy.allows_linked_project === false &&
    config.execution_policy.allows_database_url === false &&
    config.execution_policy.allows_business_data_read === false &&
    config.execution_policy.allows_auth_user_read === false,
  "projeto vinculado, URL e dados reais ficam fora do ensaio",
);
expect(
  config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "build e ZIP continuam reservados ao checkpoint",
);
expect(
  evidence.status === "local_rehearsal_not_started" &&
    evidence.rehearsal.preflight_accepted === false &&
    evidence.rehearsal.local_stack_started === false &&
    evidence.rehearsal.migration_applied === false,
  "evidência não alega preflight, stack ou migration",
);
expect(
  evidence.cli.local_cli_detected === true &&
    evidence.cli.version === "2.109.1" &&
    evidence.cli.db_advisors_help_inspected === true &&
    evidence.cli.test_db_help_inspected === true,
  "CLI e comandos locais foram descobertos por help",
);
expect(
  evidence.cli.linked_command_used === false &&
    evidence.cli.db_url_used === false &&
    evidence.cli.db_push_used === false &&
    evidence.cli.migration_repair_used === false,
  "nenhum comando remoto, direto ou reparo foi usado",
);
expect(
  evidence.safety.remote_read_executed === false &&
    evidence.safety.remote_write_executed === false &&
    evidence.safety.live_homologation_touched === false,
  "remoto e homologação permanecem intactos",
);
expect(
  evidence.privacy.contains_secrets === false &&
    evidence.privacy.contains_personal_data === false &&
    evidence.privacy.raw_cli_output_persisted === false,
  "evidência não contém segredo, dado pessoal ou saída bruta",
);
expect(
  reviewTemplate
    .split(/\r?\n/)
    .every(
      (line) => line.trim() === "" || line.trim().startsWith("--"),
    ),
  "modelo SQL contém somente comentários",
);
expect(
  !/^\s*(?:alter|create|drop|grant|revoke|insert|update|delete|begin|commit)\b/im.test(
    reviewTemplate,
  ),
  "modelo não contém SQL executável",
);
expect(
  reviewTemplate.includes("RLS e GRANT") &&
    reviewTemplate.includes("USING e WITH CHECK") &&
    reviewTemplate.includes("security_invoker") &&
    reviewTemplate.includes("SECURITY DEFINER"),
  "modelo cobre controles críticos do Supabase",
);
expect(
  evaluator.includes("validateMigrationSql") &&
    evaluator.includes("validateDynamicTestSql") &&
    evaluator.includes("validatePermit") &&
    evaluator.includes("validateReview"),
  "avaliador valida os quatro artefatos críticos",
);
expect(
  evaluator.includes("safeWorkspacePath") &&
    evaluator.includes("sha256") &&
    evaluator.includes("maximum_validity_minutes"),
  "avaliador restringe caminhos, hashes e validade temporal",
);
expect(
  evaluator.includes("local_database_not_started") &&
    evaluator.includes("migration_not_applied") &&
    evaluator.includes("ready_for_single_local_rehearsal"),
  "avaliador falha antes do banco e expõe decisão explícita",
);
expect(
  !evaluator.includes("writeFileSync") &&
    !evaluator.includes("execSync") &&
    !evaluator.includes("supabase db reset") &&
    !evaluator.includes("supabase test db"),
  "avaliação atual não grava nem executa banco",
);
expect(
  packageJson.scripts?.["atlas:migration-rehearsal:assess"]?.includes(
    "run-atlas-local-migration-rehearsal-phase-016.mjs",
  ) &&
    packageJson.scripts?.["atlas:migration-rehearsal:check"]?.includes(
      "check-atlas-local-migration-rehearsal-phase-016.mjs",
    ),
  "comandos da Fase 16 estão publicados",
);
expect(
  runbook.includes("não autoriza homologação") &&
    runbook.includes("PostgreSQL 17") &&
    runbook.includes("duas vezes") &&
    runbook.includes("supabase/config.toml"),
  "runbook explica escopo, repetição e bloqueio local",
);
expect(
  resultDoc.includes("20/20") &&
    resultDoc.includes("10/49") &&
    resultDoc.includes("Homologação alterada | Não"),
  "resultado registra mutantes, gates e preservação operacional",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-local-migration-rehearsal-phase-016.mjs",
    "--self-test",
  ],
  { encoding: "utf8" },
);
let selfTestPayload = {};
try {
  selfTestPayload = JSON.parse(selfTest.stdout);
} catch {
  selfTestPayload = {};
}
expect(
  selfTest.status === 0 &&
    selfTestPayload.safe_baseline === "accepted" &&
    selfTestPayload.mutants_rejected === 20 &&
    selfTestPayload.mutants_total === 20,
  "baseline segura passa e 20 mutantes são rejeitados",
);
expect(
  selfTestPayload.local_database_started === false &&
    selfTestPayload.migration_applied === false &&
    selfTestPayload.remote_write_executed === false,
  "autoteste não inicia banco nem aplica migration",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-local-migration-rehearsal-phase-016.mjs"],
  { encoding: "utf8" },
);
let assessmentPayload = {};
try {
  assessmentPayload = JSON.parse(assessment.stdout);
} catch {
  assessmentPayload = {};
}
expect(
  assessment.status === 0 &&
    assessmentPayload.status ===
      "local_rehearsal_contract_ready_inputs_blocked" &&
    assessmentPayload.conclusion?.ready_for_single_local_rehearsal === false,
  "avaliação falha fechado sem manifesto, permit e revisão",
);
expect(
  assessmentPayload.specification?.passed === 10 &&
    assessmentPayload.specification?.total === 49 &&
    assessmentPayload.artifacts?.supabase_config === true,
  "avaliação registra 10/49 gates e config local validado",
);
expect(
  assessmentPayload.safety?.local_database_started === false &&
    assessmentPayload.safety?.migration_applied === false &&
    assessmentPayload.safety?.remote_write_executed === false &&
    assessmentPayload.safety?.build_executed === false &&
    assessmentPayload.safety?.release_package_created === false,
  "execução preserva banco, remoto, build e ZIP",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exit(1);

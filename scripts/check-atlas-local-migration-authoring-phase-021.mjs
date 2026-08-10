import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const config = json(
  "config/atlas-10x-phase-021-local-migration-authoring.json",
);
const evidence = json(
  "artifacts/runtime/phase-021/local-migration-authoring-evidence.json",
);
const packageJson = json("package.json");
const evaluator = read(
  "scripts/run-atlas-local-migration-authoring-phase-021.mjs",
);
const template = read(
  "docs/templates/ATLAS_LOCAL_MIGRATION_AUTHORIZATION_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_021_LOCAL_MIGRATION_AUTHORING.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_021_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);
const unique = (values) => new Set(values).size === values.length;

expect(
  config.schema_version === "atlas.10x.phase-021.v1" &&
    config.phase === 21 &&
    config.total_phases === 24,
  "contrato da Fase 21 está versionado",
);
expect(
  config.objective.includes("fail-closed") &&
    config.objective.includes("SHA-256") &&
    config.objective.includes("sem aplicar migration") &&
    config.objective.includes("gerar ZIP"),
  "objetivo fecha autoria, remoto e release",
);
expect(
  config.status ===
      "local_migration_authoring_contract_ready_phase_020_specification_and_human_authorization_required" &&
    config.build_policy === "build_only_on_release_package",
  "estado inicial permanece bloqueado e sem build",
);
expect(
  config.cli_contract.required_version === "2.109.1" &&
    config.cli_contract.migration_directory === "supabase/migrations" &&
    config.cli_contract.test_directory === "supabase/tests",
  "versão e diretórios locais são exatos",
);
expect(
  JSON.stringify(config.cli_contract.migration_new_tokens) ===
    JSON.stringify([
      "supabase",
      "migration",
      "new",
      "atlas_security_remediation",
    ]),
  "comando de criação local é mínimo e nomeado",
);
expect(
  JSON.stringify(config.cli_contract.test_db_tokens) ===
      JSON.stringify(["supabase", "test", "db", "--local"]) &&
    JSON.stringify(config.cli_contract.db_lint_tokens) ===
      JSON.stringify([
        "supabase",
        "db",
        "lint",
        "--local",
        "--level",
        "error",
      ]),
  "pgTAP e lint exigem alvo local explícito",
);
expect(
  config.cli_contract.forbidden_tokens.includes("--linked") &&
    config.cli_contract.forbidden_tokens.includes("db push") &&
    config.cli_contract.forbidden_tokens.includes("migration repair") &&
    config.cli_contract.existing_migrations_must_remain_immutable === true,
  "linked, push, repair e mutação histórica são bloqueados",
);
expect(
  config.input_contract.required_specification_schema_version ===
      "atlas.local_remediation_specification.v1" &&
    config.input_contract.required_authorization_schema_version ===
      "atlas.local_migration_authorization.v1" &&
    config.input_contract.authorization_ttl_minutes === 30,
  "entradas exigem schemas exatos e autorização curta",
);
expect(
  config.authorization_contract.required_fields.length === 13 &&
    unique(config.authorization_contract.required_fields) &&
    config.authorization_contract.required_authorization_fields.length ===
      18 &&
    unique(config.authorization_contract.required_authorization_fields),
  "forma da autorização é fechada",
);
expect(
  config.authorization_contract.migration_name ===
      "atlas_security_remediation" &&
    config.authorization_contract.requires_human_reviewer === true &&
    config.authorization_contract.requires_change_ticket === true &&
    config.authorization_contract.requires_one_shot === true,
  "autorização exige humano, ticket e uso único",
);
expect(
  config.authorization_contract.credentials_forbidden === true &&
    config.authorization_contract.personal_data_forbidden === true &&
    config.authorization_contract.business_data_forbidden === true &&
    config.authorization_contract.auth_user_data_forbidden === true &&
    config.authorization_contract.raw_cli_output_forbidden === true,
  "autorização não transporta credenciais, dados ou saída bruta",
);
expect(
  config.authoring_manifest_contract.schema_version ===
      "atlas.local_migration_authoring_manifest.v1" &&
    config.authoring_manifest_contract.ready_status ===
      "ready_for_single_local_cli_authoring",
  "manifesto local tem schema e estado próprios",
);
expect(
  config.authoring_manifest_contract.required_root_fields.length === 9 &&
    config.authoring_manifest_contract.required_source_fields.length === 3 &&
    config.authoring_manifest_contract.required_cli_fields.length === 4 &&
    config.authoring_manifest_contract.required_migration_fields.length === 6,
  "formas centrais do manifesto são exatas",
);
expect(
  config.authoring_manifest_contract.required_rollback_fields.length === 5 &&
    config.authoring_manifest_contract.required_privacy_fields.length === 5 &&
    config.authoring_manifest_contract.required_authorization_fields.length ===
      13,
  "rollback, privacidade e autorizações têm formas fechadas",
);
expect(
  config.negative_test_catalog.length === 18 &&
    unique(config.negative_test_catalog),
  "18 testes negativos são obrigatórios e únicos",
);
expect(
  ["select", "insert", "update", "delete"].every((operation) =>
    config.negative_test_catalog.includes(`anonymous_${operation}_denied`),
  ),
  "CRUD anônimo é negado integralmente",
);
expect(
  ["select", "insert", "update", "delete"].every((operation) =>
    config.negative_test_catalog.includes(
      `cross_tenant_${operation}_denied`,
    ),
  ),
  "CRUD entre tenants é negado integralmente",
);
expect(
  ["select", "insert", "update", "delete"].every((operation) =>
    config.negative_test_catalog.includes(
      `owned_row_${operation}_allowed`,
    ),
  ),
  "CRUD autorizado do proprietário é comprovado",
);
expect(
  config.negative_test_catalog.includes("ownership_reassignment_denied") &&
    config.negative_test_catalog.includes(
      "data_api_requires_explicit_grant_and_rls",
    ) &&
    config.negative_test_catalog.includes(
      "granted_role_still_respects_rls",
    ),
  "tenant imutável e dupla fronteira grants/RLS são testados",
);
expect(
  config.negative_test_catalog.includes("view_respects_security_invoker") &&
    config.negative_test_catalog.includes(
      "public_function_execute_denied",
    ) &&
    config.negative_test_catalog.includes(
      "service_role_secret_absent_from_client",
    ),
  "views, funções e service role têm fronteiras explícitas",
);
expect(
  config.required_gates.length === 55 &&
    unique(config.required_gates),
  "55 gates obrigatórios são únicos",
);
expect(
  config.execution_policy.this_evaluator_executes_commands === false &&
    config.execution_policy.this_evaluator_writes_files === false &&
    config.execution_policy.allows_manifest_in_memory === true,
  "avaliador opera em memória e sem efeitos",
);
expect(
  config.execution_policy.allows_remote_read === false &&
    config.execution_policy.allows_remote_write === false &&
    config.execution_policy.allows_linked_project === false &&
    config.execution_policy.allows_migration_apply === false &&
    config.execution_policy.allows_db_push === false &&
    config.execution_policy.allows_migration_repair === false,
  "remoto, linked, apply, push e repair seguem proibidos",
);
expect(
  config.execution_policy.allows_production === false &&
    config.execution_policy.allows_business_data_read === false &&
    config.execution_policy.allows_auth_user_read === false &&
    config.execution_policy.allows_storage_object_read === false &&
    config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "produção, dados, build e ZIP permanecem fora do escopo",
);
expect(
  config.official_references.length === 5 &&
    config.official_references.every((url) =>
      url.startsWith("https://supabase.com/"),
    ),
  "somente referências oficiais do Supabase são usadas",
);
expect(
  config.next_phase.includes("Fase 22/24") &&
    config.next_phase.includes("pgTAP") &&
    config.next_phase.includes("--local") &&
    config.next_phase.includes("sem qualquer acesso linked"),
  "próxima fase preserva ensaio local isolado",
);
expect(
  evaluator.includes("assessLocalRemediationSpecification") &&
    evaluator.includes("validateLocalMigrationAuthorization") &&
    evaluator.includes("buildAuthoringManifest") &&
    evaluator.includes("validateAuthoringManifest"),
  "avaliador encadeia F20, autorização, construção e validação",
);
expect(
  evaluator.includes("migrationBaseline") &&
    evaluator.includes("existing_migrations_are_immutable") &&
    evaluator.includes("authorization_baseline_hash_is_sha256"),
  "histórico de migrations é fixado e protegido por hash",
);
expect(
  evaluator.includes("manifest_covers_anonymous_crud_denials") &&
    evaluator.includes("manifest_covers_cross_tenant_crud_denials") &&
    evaluator.includes("manifest_blocks_tenant_reassignment"),
  "avaliador cobra casos negativos essenciais",
);
expect(
  evaluator.includes("manifest_couples_data_api_grants_and_rls") &&
    evaluator.includes("manifest_covers_view_and_function_boundaries") &&
    evaluator.includes("manifest_keeps_service_secret_out_of_client"),
  "avaliador cobra grants/RLS, views, funções e segredo servidor",
);
expect(
  !evaluator.includes("writeFile") &&
    !evaluator.includes("execSync") &&
    !evaluator.includes("spawnSync") &&
    !evaluator.includes("supabase db push") &&
    !evaluator.includes("supabase migration repair"),
  "avaliador não grava nem executa comandos operacionais",
);
expect(
  template.includes("uma única migration local") &&
    template.includes("validade máxima de 30 minutos") &&
    template.includes("consumed: true") &&
    template.includes("Nenhuma migration foi aplicada"),
  "template humano explicita escopo, validade e consumo",
);
expect(
  runbook.includes("gate fail-closed") &&
    runbook.includes("arquivos de migration existentes são imutáveis") &&
    runbook.includes("Grants e RLS são controles separados") &&
    runbook.includes("Fase 22/24"),
  "runbook documenta fluxo, mudança Data API e próxima etapa",
);
expect(
  runbook.includes("https://supabase.com/docs/reference/cli/") &&
    runbook.includes(
      "https://supabase.com/docs/guides/local-development/cli-workflows",
    ) &&
    runbook.includes("https://supabase.com/changelog"),
  "runbook referencia documentação oficial atual",
);
expect(
  resultDoc.includes("nenhuma migration foi criada ou aplicada") &&
    resultDoc.includes("bloqueio é intencional") &&
    resultDoc.includes("Fase 22/24"),
  "resultado comunica bloqueio real sem alegar execução",
);
expect(
  packageJson.scripts["atlas:migration-authoring:assess"] ===
      "node scripts/run-atlas-local-migration-authoring-phase-021.mjs" &&
    packageJson.scripts["atlas:migration-authoring:check"] ===
      "node scripts/check-atlas-local-migration-authoring-phase-021.mjs",
  "scripts da Fase 21 estão registrados",
);
expect(
  evidence.schema_version === "atlas.phase-021.evidence.v1" &&
    evidence.phase === "21/24" &&
    evidence.status === "local_migration_not_authored",
  "evidência está versionada e não alega autoria",
);
expect(
  evidence.assessment.gates_passed === 15 &&
    evidence.assessment.gates_total === 55 &&
    evidence.assessment.mutants_rejected === 52 &&
    evidence.assessment.mutants_total === 52 &&
    evidence.assessment.negative_tests_required === 18,
  "evidência registra gates, mutantes e testes",
);
expect(
  evidence.assessment.manifest_ready === false &&
    evidence.assessment.migration_files_created === 0 &&
    evidence.assessment.test_files_created === 0,
  "evidência confirma zero manifesto persistido e zero arquivos novos",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-local-migration-authoring-phase-021.mjs", "--self-test"],
  { encoding: "utf8" },
);
const selfTestPayload =
  selfTest.status === 0 ? JSON.parse(selfTest.stdout) : {};
expect(
  selfTest.status === 0 &&
    selfTestPayload.safe_baseline === "accepted" &&
    selfTestPayload.negative_tests === 18 &&
    selfTestPayload.mutants_rejected === 52 &&
    selfTestPayload.mutants_total === 52,
  "baseline sintética é aceita e 52 mutantes são rejeitados",
);
expect(
  selfTestPayload.remote_command_executed === false &&
    selfTestPayload.file_written === false &&
    selfTestPayload.linked_project_accessed === false &&
    selfTestPayload.migration_generated === false &&
    selfTestPayload.migration_applied === false &&
    selfTestPayload.production_touched === false,
  "autoteste comprova ausência de efeitos",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-local-migration-authoring-phase-021.mjs"],
  { encoding: "utf8" },
);
const assessmentPayload =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : {};
expect(
  assessment.status === 0 &&
    assessmentPayload.status ===
      "local_migration_authoring_contract_ready_phase_020_specification_and_human_authorization_required" &&
    assessmentPayload.authoring_gates.passed === 15 &&
    assessmentPayload.authoring_gates.total === 55 &&
    assessmentPayload.authoring_manifest.generated_in_memory === false &&
    assessmentPayload.authoring_manifest.migration_files_created === 0,
  "avaliação real permanece bloqueada sem especificação e autorização",
);
expect(
  assessmentPayload.inputs.cli_version === "2.109.1" &&
    assessmentPayload.inputs.migration_baseline_files === 126 &&
    assessmentPayload.inputs.migration_baseline_sha256 ===
      evidence.baseline.migration_manifest_sha256,
  "CLI e inventário local conferem com a evidência",
);
expect(
  assessmentPayload.conclusion.ready_for_single_local_cli_authoring ===
      false &&
    assessmentPayload.conclusion.remote_apply_authorized === false &&
    assessmentPayload.conclusion.linked_project_authorized === false &&
    assessmentPayload.conclusion.production_authorized === false &&
    assessmentPayload.conclusion.human_review_required === true,
  "conclusão mantém autorização humana e zero remoto",
);
expect(
  assessmentPayload.safety.evaluator_executed_command === false &&
    assessmentPayload.safety.evaluator_wrote_file === false &&
    assessmentPayload.safety.remote_read_executed === false &&
    assessmentPayload.safety.remote_write_executed === false &&
    assessmentPayload.safety.linked_project_accessed === false &&
    assessmentPayload.safety.migration_generated === false &&
    assessmentPayload.safety.migration_applied === false &&
    assessmentPayload.safety.existing_migration_modified === false &&
    assessmentPayload.safety.build_executed === false &&
    assessmentPayload.safety.release_package_created === false,
  "avaliação não toca remoto, migration, build ou ZIP",
);

const phase020Regression = spawnSync(
  process.execPath,
  ["scripts/check-atlas-local-remediation-specification-phase-020.mjs"],
  { encoding: "utf8" },
);
const phase020Payload =
  phase020Regression.status === 0
    ? JSON.parse(phase020Regression.stdout)
    : {};
expect(
  phase020Regression.status === 0 &&
    phase020Payload.passed === 43 &&
    phase020Payload.total === 43,
  "regressão da Fase 20 permanece verde",
);
expect(
  evidence.validation.phase_020_regression === "43/43" &&
    evidence.validation.typecheck === "passed" &&
    evidence.validation.lint === "passed" &&
    evidence.validation.secret_scan === "passed" &&
    Number.isInteger(evidence.validation.secret_scan_files) &&
    evidence.validation.secret_scan_files > 0 &&
    evidence.validation.credentials_detected === 0,
  "evidência consolida regressão, qualidade e ausência de credenciais",
);
expect(
  evidence.validation.phase_021_checks ===
    `${checks.length + 1}/${checks.length + 1}`,
  "evidência registra total exato dos checks da Fase 21",
);

const failed = checks.filter(([, passed]) => !passed);
if (failed.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        passed: checks.length - failed.length,
        total: checks.length,
        failures: failed.map(([label]) => label),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      phase: "21/24",
      passed: checks.length,
      total: checks.length,
      gates: "15/55",
      mutants: "52/52",
      remote_execution: false,
      linked_project_accessed: false,
      migration_generated_or_applied: false,
      build_executed: false,
      package_created: false,
    },
    null,
    2,
  ),
);

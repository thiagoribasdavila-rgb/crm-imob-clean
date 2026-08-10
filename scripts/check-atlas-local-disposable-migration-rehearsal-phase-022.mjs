import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const config = json(
  "config/atlas-10x-phase-022-local-disposable-migration-rehearsal.json",
);
const evidence = json(
  "artifacts/runtime/phase-022/local-disposable-migration-rehearsal-evidence.json",
);
const packageJson = json("package.json");
const evaluator = read(
  "scripts/run-atlas-local-disposable-migration-rehearsal-phase-022.mjs",
);
const template = read(
  "docs/templates/ATLAS_LOCAL_REHEARSAL_AUTHORIZATION_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_022_LOCAL_DISPOSABLE_MIGRATION_REHEARSAL.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_022_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);
const unique = (values) => new Set(values).size === values.length;
const exact = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);

expect(
  config.schema_version === "atlas.10x.phase-022.v1" &&
    config.phase === 22 &&
    config.total_phases === 24,
  "contrato da Fase 22 está versionado",
);
expect(
  config.objective.includes("descartável") &&
    config.objective.includes("fail-closed") &&
    config.objective.includes("sem iniciar Docker") &&
    config.objective.includes("sem ZIP"),
  "objetivo fecha Docker, remoto e release na avaliação",
);
expect(
  config.status ===
      "local_rehearsal_contract_ready_phase_021_receipt_and_human_authorization_required" &&
    config.build_policy === "build_only_on_release_package",
  "estado inicial permanece bloqueado e sem build",
);
expect(
  config.input_contract.authoring_receipt_path ===
      "artifacts/runtime/phase-021/manual/local-migration-authoring-receipt.json" &&
    config.input_contract.rehearsal_authorization_path ===
      "artifacts/runtime/phase-022/manual/local-rehearsal-authorization.json" &&
    config.input_contract.source_config_path === "supabase/config.toml",
  "entradas manuais e config local têm caminhos exatos",
);
expect(
  config.input_contract.required_receipt_schema_version ===
      "atlas.local_migration_authoring_receipt.v1" &&
    config.input_contract.required_authorization_schema_version ===
      "atlas.local_rehearsal_authorization.v1" &&
    config.input_contract.authorization_ttl_minutes === 30,
  "recibo e autorização exigem schemas e validade exatos",
);
expect(
  config.cli_contract.required_version === "2.109.1" &&
    config.cli_contract.workdir ===
      ".atlas/runtime/phase-022/rehearsal" &&
    config.cli_contract.project_id === "atlas-phase-022-rehearsal",
  "CLI, workdir e project-id isolado são fixos",
);

const commands = config.cli_contract.commands;
expect(
  exact(commands.db_start, [
    "supabase",
    "db",
    "start",
    "--workdir",
    ".atlas/runtime/phase-022/rehearsal",
  ]),
  "início previsto limita-se ao banco local isolado",
);
expect(
  exact(commands.baseline_reset, [
    "supabase",
    "db",
    "reset",
    "--local",
    "--no-seed",
    "--workdir",
    ".atlas/runtime/phase-022/rehearsal",
  ]) && exact(commands.rollback_reset, commands.baseline_reset),
  "reset e rollback são locais, sem seed e equivalentes",
);
expect(
  exact(commands.migration_up, [
    "supabase",
    "migration",
    "up",
    "--local",
    "--workdir",
    ".atlas/runtime/phase-022/rehearsal",
  ]),
  "migration up exige alvo local explícito",
);
expect(
  exact(commands.test_db, [
    "supabase",
    "test",
    "db",
    "--local",
    "supabase/tests/atlas_security_remediation_test.sql",
    "--workdir",
    ".atlas/runtime/phase-022/rehearsal",
  ]),
  "pgTAP aponta para o único arquivo autorizado",
);
expect(
  exact(commands.db_lint, [
    "supabase",
    "db",
    "lint",
    "--local",
    "--level",
    "error",
    "--fail-on",
    "error",
    "--workdir",
    ".atlas/runtime/phase-022/rehearsal",
  ]),
  "lint é local e falha no nível error",
);
expect(
  exact(commands.cleanup, [
    "supabase",
    "stop",
    "--project-id",
    "atlas-phase-022-rehearsal",
    "--no-backup",
    "--workdir",
    ".atlas/runtime/phase-022/rehearsal",
  ]),
  "cleanup atinge somente o project-id isolado",
);
expect(
  exact(config.cli_contract.command_order, [
    "db_start",
    "baseline_reset",
    "migration_up",
    "test_db",
    "db_lint",
    "rollback_reset",
    "cleanup",
  ]),
  "ordem de comandos é fechada",
);

const flattenedCommands = Object.values(commands).flat();
expect(
  !flattenedCommands.includes("--linked") &&
    !flattenedCommands.includes("--db-url") &&
    !flattenedCommands.includes("--all"),
  "linked, db-url e cleanup global estão ausentes",
);
expect(
  !flattenedCommands.join(" ").includes("db push") &&
    !flattenedCommands.join(" ").includes("migration repair"),
  "push e repair não fazem parte do ensaio",
);
expect(
  config.cli_contract.forbidden_tokens.includes("--linked") &&
    config.cli_contract.forbidden_tokens.includes("--all") &&
    config.cli_contract.forbidden_tokens.includes("production") &&
    config.cli_contract.forbidden_tokens.includes("main"),
  "tokens de alto risco são explicitamente proibidos",
);
expect(
  config.receipt_contract.required_root_fields.length === 8 &&
    config.receipt_contract.required_files.length === 2 &&
    config.receipt_contract.required_file_fields.length === 2,
  "recibo usa forma mínima e fechada",
);
expect(
  config.receipt_contract.required_rollback_fields.length === 7 &&
    config.receipt_contract.required_privacy_fields.length === 7 &&
    config.receipt_contract.required_authorization_fields.length === 12,
  "rollback, privacidade e remoto têm campos exatos",
);
expect(
  config.authorization_contract.required_fields.length === 12 &&
    config.authorization_contract.required_authorization_fields.length ===
      18 &&
    unique(config.authorization_contract.required_authorization_fields),
  "autorização de uso único tem forma fechada",
);
expect(
  config.authorization_contract.requires_human_reviewer === true &&
    config.authorization_contract.requires_change_ticket === true &&
    config.authorization_contract.requires_one_shot === true,
  "revisor, ticket e uso único são obrigatórios",
);
expect(
  config.rehearsal_plan_contract.schema_version ===
      "atlas.local_disposable_rehearsal_plan.v1" &&
    config.rehearsal_plan_contract.ready_status ===
      "ready_for_single_disposable_local_rehearsal",
  "plano tem schema e estado próprios",
);
expect(
  config.rehearsal_plan_contract.required_root_fields.length === 11 &&
    config.rehearsal_plan_contract.required_lifecycle.length === 13,
  "plano e ciclo de vida têm formas fechadas",
);
expect(
  config.rehearsal_plan_contract.required_lifecycle.includes(
    "capture_baseline_fingerprints",
  ) &&
    config.rehearsal_plan_contract.required_lifecycle.includes(
      "verify_baseline_fingerprints_restored",
    ) &&
    config.rehearsal_plan_contract.required_lifecycle.at(-1) ===
      "destroy_disposable_volume_and_workdir",
  "rollback exige fingerprints e cleanup final",
);
expect(
  config.rehearsal_plan_contract.required_fixture_fields.length === 5 &&
    config.rehearsal_plan_contract.required_rollback_fields.length === 10,
  "fixtures e rollback são totalmente especificados",
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
  "views, funções e segredo servidor têm fronteiras explícitas",
);
expect(
  config.required_gates.length === 83 &&
    unique(config.required_gates),
  "83 gates obrigatórios são únicos",
);
expect(
  config.execution_policy.this_evaluator_executes_commands === false &&
    config.execution_policy.this_evaluator_writes_files === false &&
    config.execution_policy.allows_plan_in_memory === true,
  "avaliador opera somente em memória e sem efeitos",
);
expect(
  config.execution_policy.allows_remote_read === false &&
    config.execution_policy.allows_remote_write === false &&
    config.execution_policy.allows_linked_project === false &&
    config.execution_policy.allows_db_push === false &&
    config.execution_policy.allows_migration_repair === false,
  "remoto, linked, push e repair permanecem proibidos",
);
expect(
  config.execution_policy.allows_production === false &&
    config.execution_policy.allows_business_data_read === false &&
    config.execution_policy.allows_auth_user_read === false &&
    config.execution_policy.allows_storage_object_read === false &&
    config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "produção, dados, build e ZIP estão fora do escopo",
);
expect(
  config.official_references.length === 5 &&
    config.official_references.every((url) =>
      url.startsWith("https://supabase.com/"),
    ),
  "referências são oficiais do Supabase",
);
expect(
  config.next_phase.includes("Fase 23/24") &&
    config.next_phase.includes("pgTAP/lint/rollback") &&
    config.next_phase.includes("sem aplicar migration"),
  "próxima fase permanece sanitizada e sem remoto",
);
expect(
  evaluator.includes("assessLocalMigrationAuthoring") &&
    evaluator.includes("validateAuthoringReceipt") &&
    evaluator.includes("validateRehearsalAuthorization") &&
    evaluator.includes("buildRehearsalPlan") &&
    evaluator.includes("validateRehearsalPlan"),
  "avaliador encadeia F21, recibo, autorização e plano",
);
expect(
  evaluator.includes("migrationBaseline") &&
    evaluator.includes("baseline_migrations_remain_immutable") &&
    evaluator.includes("single_new_migration_is_isolated"),
  "histórico e única migration são verificados",
);
expect(
  evaluator.includes("cleanup_does_not_use_all") &&
    evaluator.includes("cleanup_targets_only_isolated_project") &&
    evaluator.includes("seed_execution_is_disabled"),
  "cleanup e ausência de seed são validados",
);
expect(
  evaluator.includes("plan_rollback_requires_fingerprint_restore") &&
    evaluator.includes("tests_before_cleanup_required") &&
    evaluator.includes("tests_after_restore_required"),
  "plano exige teste antes e depois da restauração",
);
expect(
  evaluator.includes("plan_couples_data_api_grants_and_rls") &&
    evaluator.includes("plan_covers_view_and_function_boundaries") &&
    evaluator.includes("plan_keeps_service_secret_out_of_client"),
  "grants/RLS, views, funções e segredo servidor são cobrados",
);
expect(
  !evaluator.includes("writeFile") &&
    !evaluator.includes("execSync") &&
    !evaluator.includes("spawnSync") &&
    !evaluator.includes("child_process"),
  "avaliador não grava nem executa comandos",
);
expect(
  template.includes("dois artefatos manuais independentes") &&
    template.includes("consumed") &&
    template.includes("no máximo 30 minutos") &&
    template.includes("não inicia Docker"),
  "template separa recibo, autorização, validade e efeitos",
);
expect(
  template.includes("supabase/config.toml") &&
    template.includes("supabase stop --all") &&
    template.includes("destroy_volume_rebuild_baseline_and_compare_sha256"),
  "template exige config, proíbe cleanup global e fixa rollback",
);
expect(
  runbook.includes("fail-closed") &&
    runbook.includes("não inicia Docker") &&
    runbook.includes("fixtures sintéticas") &&
    runbook.includes("nunca `--all`"),
  "runbook documenta bloqueio e isolamento",
);
expect(
  runbook.includes("Grants e RLS continuam controles distintos") &&
    runbook.includes("security_invoker") &&
    runbook.includes("Fase 23/24"),
  "runbook cobre Data API, views e próxima fase",
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
  resultDoc.includes("31/83") &&
    resultDoc.includes("nenhum comando operacional foi executado") &&
    resultDoc.includes("Fase 23/24"),
  "resultado comunica medição, bloqueio e próxima etapa",
);
expect(
  packageJson.scripts["atlas:migration-rehearsal-v2:assess"] ===
      "node scripts/run-atlas-local-disposable-migration-rehearsal-phase-022.mjs" &&
    packageJson.scripts["atlas:migration-rehearsal-v2:check"] ===
      "node scripts/check-atlas-local-disposable-migration-rehearsal-phase-022.mjs",
  "scripts da Fase 22 estão registrados",
);
expect(
  evidence.schema_version === "atlas.phase-022.evidence.v1" &&
    evidence.phase === "22/24" &&
    evidence.status === "local_rehearsal_not_executed",
  "evidência está versionada e não alega ensaio",
);
expect(
  evidence.assessment.gates_passed === 31 &&
    evidence.assessment.gates_total === 83 &&
    evidence.assessment.mutants_rejected === 85 &&
    evidence.assessment.mutants_total === 85 &&
    evidence.assessment.negative_tests_required === 18,
  "evidência registra gates, mutantes e testes",
);
expect(
  evidence.assessment.plan_ready === false &&
    evidence.assessment.commands_executed === 0 &&
    evidence.inputs.authoring_receipt_exists === false &&
    evidence.inputs.rehearsal_authorization_exists === false &&
    evidence.inputs.source_config_exists === true,
  "evidência registra configuração presente, entradas humanas ausentes e zero execução",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-local-disposable-migration-rehearsal-phase-022.mjs",
    "--self-test",
  ],
  { cwd: root, encoding: "utf8" },
);
const selfTestPayload =
  selfTest.status === 0 ? JSON.parse(selfTest.stdout) : {};
expect(
  selfTest.status === 0 &&
    selfTestPayload.safe_baseline === "accepted" &&
    selfTestPayload.negative_tests === 18 &&
    selfTestPayload.mutants_rejected === 85 &&
    selfTestPayload.mutants_total === 85,
  "baseline sintética é aceita e 85 mutantes são rejeitados",
);
expect(
  selfTestPayload.remote_command_executed === false &&
    selfTestPayload.file_written === false &&
    selfTestPayload.local_database_started === false &&
    selfTestPayload.docker_accessed === false &&
    selfTestPayload.migration_applied === false &&
    selfTestPayload.linked_project_accessed === false &&
    selfTestPayload.production_touched === false,
  "autoteste comprova ausência de efeitos",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-local-disposable-migration-rehearsal-phase-022.mjs"],
  { cwd: root, encoding: "utf8" },
);
const assessmentPayload =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : {};
expect(
  assessment.status === 0 &&
    assessmentPayload.status ===
      "local_rehearsal_contract_ready_phase_021_receipt_and_human_authorization_required" &&
    assessmentPayload.rehearsal_gates.passed === 31 &&
    assessmentPayload.rehearsal_gates.total === 83 &&
    assessmentPayload.rehearsal_plan.generated_in_memory === false &&
    assessmentPayload.rehearsal_plan.commands_executed === 0,
  "avaliação real permanece bloqueada sem recibo e autorização",
);
expect(
  assessmentPayload.inputs.cli_version === "2.109.1" &&
    assessmentPayload.inputs.preserved_migration_files === 126 &&
    assessmentPayload.inputs.preserved_migration_manifest_sha256 ===
      evidence.baseline.migration_manifest_sha256,
  "CLI e inventário local conferem com a evidência",
);
expect(
  assessmentPayload.conclusion.ready_for_single_disposable_local_rehearsal ===
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
    assessmentPayload.safety.local_database_started === false &&
    assessmentPayload.safety.docker_accessed === false &&
    assessmentPayload.safety.migration_applied === false &&
    assessmentPayload.safety.pgtap_executed === false &&
    assessmentPayload.safety.lint_executed === false &&
    assessmentPayload.safety.rollback_executed === false &&
    assessmentPayload.safety.cleanup_executed === false &&
    assessmentPayload.safety.remote_read_executed === false &&
    assessmentPayload.safety.remote_write_executed === false &&
    assessmentPayload.safety.linked_project_accessed === false &&
    assessmentPayload.safety.build_executed === false &&
    assessmentPayload.safety.release_package_created === false,
  "avaliação não toca Docker, banco, remoto, build ou ZIP",
);

const phase021Regression = spawnSync(
  process.execPath,
  ["scripts/check-atlas-local-migration-authoring-phase-021.mjs"],
  { cwd: root, encoding: "utf8" },
);
const phase021Payload =
  phase021Regression.status === 0
    ? JSON.parse(phase021Regression.stdout)
    : {};
expect(
  phase021Regression.status === 0 &&
    phase021Payload.passed === 48 &&
    phase021Payload.total === 48,
  "regressão da Fase 21 permanece verde",
);
expect(
  evidence.validation.phase_021_regression === "48/48" &&
    evidence.validation.typecheck === "passed" &&
    evidence.validation.lint === "passed" &&
    evidence.validation.secret_scan === "passed" &&
    Number.isInteger(evidence.validation.secret_scan_files) &&
    evidence.validation.secret_scan_files > 0 &&
    evidence.validation.credentials_detected === 0,
  "evidência consolida regressão, qualidade e ausência de credenciais",
);
expect(
  evidence.validation.phase_022_checks ===
    `${checks.length + 1}/${checks.length + 1}`,
  "evidência registra total exato dos checks da Fase 22",
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
      phase: "22/24",
      passed: checks.length,
      total: checks.length,
      gates: "31/83",
      mutants: "85/85",
      local_database_started: false,
      docker_accessed: false,
      remote_execution: false,
      linked_project_accessed: false,
      migration_applied: false,
      build_executed: false,
      package_created: false,
    },
    null,
    2,
  ),
);

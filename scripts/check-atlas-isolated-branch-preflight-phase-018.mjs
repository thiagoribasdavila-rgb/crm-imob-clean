import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

const config = readJson(
  "config/atlas-10x-phase-018-isolated-branch-preflight.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-018/isolated-branch-preflight-evidence.json",
);
const packageJson = readJson("package.json");
const evaluator = read(
  "scripts/run-atlas-isolated-branch-preflight-phase-018.mjs",
);
const template = read(
  "docs/templates/ATLAS_ISOLATED_BRANCH_PREFLIGHT_ATTESTATION_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_018_ISOLATED_BRANCH_PREFLIGHT.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_018_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-018.v1" &&
    config.phase === 18 &&
    config.total_phases === 24,
  "contrato da Fase 18 está versionado",
);
expect(
  config.input_contract.required_dossier_decision ===
    "approved_for_manual_homologation_preflight_only" &&
    config.input_contract.required_permit_status ===
      "approved_for_isolated_read_only_preflight" &&
    config.input_contract.required_observation_status ===
      "isolated_branch_preflight_observed",
  "entradas exigem decisões explícitas",
);
expect(
  config.target_contract.required_environment === "homologation" &&
    config.target_contract.required_initial_health === "preflight_pending" &&
    config.target_contract.required_observed_health === "preflight_observed",
  "alvo avança de pending para observed",
);
expect(
  config.target_contract.allowed_target_types.includes(
    "supabase_preview_branch",
  ) &&
    config.target_contract.allowed_target_types.includes(
      "supabase_persistent_branch",
    ),
  "somente branches Supabase isoladas são aceitas",
);
expect(
  config.target_contract.production_target_forbidden === true &&
    config.target_contract.main_branch_forbidden === true &&
    config.target_contract.allowed_data_policies.includes("data_less") &&
    config.target_contract.allowed_data_policies.includes("synthetic_only"),
  "produção, main e dados reais são proibidos",
);
expect(
  config.target_contract.allowed_descriptor_fields.length === 10 &&
    config.required_gates.includes("target_descriptor_shape_is_exact"),
  "descritor do alvo tem forma exata",
);
expect(
  config.permit_contract.one_shot_required === true &&
    config.permit_contract.maximum_validity_minutes === 30 &&
    config.permit_contract.scope ===
      "isolated_supabase_branch_read_only_metadata_and_catalog",
  "permit é curto, de uso único e read-only",
);
expect(
  config.permit_contract.remote_metadata_read_allowed === true &&
    config.permit_contract.remote_schema_catalog_read_allowed === true &&
    config.permit_contract.remote_migration_ledger_read_allowed === true &&
    config.permit_contract.remote_advisor_summary_read_allowed === true,
  "permit limita leitura a metadados e resumos",
);
expect(
  config.permit_contract.business_rows_read_allowed === false &&
    config.permit_contract.auth_rows_read_allowed === false &&
    config.permit_contract.storage_objects_read_allowed === false &&
    config.permit_contract.data_export_allowed === false,
  "linhas, Auth, Storage e exportação ficam proibidos",
);
expect(
  config.permit_contract.remote_ddl_allowed === false &&
    config.permit_contract.remote_dml_allowed === false &&
    config.permit_contract.migration_apply_allowed === false &&
    config.permit_contract.db_push_allowed === false &&
    config.permit_contract.migration_repair_allowed === false &&
    config.permit_contract.branch_mutation_allowed === false,
  "todas as mutações remotas ficam proibidas",
);
expect(
  config.observation_contract.postgres_major === 17 &&
    config.observation_contract.cli_version === "2.109.1",
  "observação exige PostgreSQL 17 e CLI conhecida",
);
expect(
  config.allowed_observation_checks.length === 10 &&
    new Set(config.allowed_observation_checks).size === 10,
  "dez checks sanitizados são únicos",
);
expect(
  config.required_observation_count_fields.length === 10 &&
    new Set(config.required_observation_count_fields).size === 10,
  "dez contagens sanitizadas são únicas",
);
expect(
  config.observation_contract.sanitized_counts_only === true &&
    config.observation_contract.object_names_forbidden === true &&
    config.observation_contract.raw_sql_forbidden === true &&
    config.observation_contract.raw_cli_output_forbidden === true,
  "observação aceita contagens, nunca saída bruta",
);
expect(
  config.observation_contract.credentials_forbidden === true &&
    config.observation_contract.personal_data_forbidden === true &&
    config.observation_contract.business_data_forbidden === true &&
    config.observation_contract.auth_user_data_forbidden === true,
  "segredos e dados reais não entram na evidência",
);
expect(
  config.required_gates.length === 54 &&
    new Set(config.required_gates).size === 54,
  "54 gates obrigatórios são únicos",
);
expect(
  config.execution_policy.this_evaluator_executes_remote_commands === false &&
    config.execution_policy.this_evaluator_writes_files === false,
  "avaliador é local, read-only e sem escrita",
);
expect(
  config.execution_policy.allows_future_one_shot_remote_metadata_read_with_valid_permit ===
    true &&
    config.execution_policy.allows_future_one_shot_remote_schema_catalog_read_with_valid_permit ===
      true,
  "futura leitura exige permit válido",
);
expect(
  config.execution_policy.allows_remote_ddl === false &&
    config.execution_policy.allows_remote_dml === false &&
    config.execution_policy.allows_migration_apply === false &&
    config.execution_policy.allows_db_push === false &&
    config.execution_policy.allows_migration_repair === false,
  "contrato não autoriza DDL, DML, migration, push ou repair",
);
expect(
  config.execution_policy.allows_branch_creation === false &&
    config.execution_policy.allows_branch_update === false &&
    config.execution_policy.allows_branch_pause === false &&
    config.execution_policy.allows_branch_delete === false &&
    config.execution_policy.allows_branch_merge === false,
  "branch não pode ser criada, alterada, pausada, apagada ou mesclada",
);
expect(
  config.execution_policy.allows_production === false &&
    config.execution_policy.allows_real_data_copy === false &&
    config.execution_policy.allows_business_data_read === false &&
    config.execution_policy.allows_auth_user_read === false &&
    config.execution_policy.allows_storage_object_read === false,
  "produção e dados reais permanecem fora do escopo",
);
expect(
  config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "build e ZIP permanecem reservados ao checkpoint",
);
expect(
  evidence.status === "preflight_not_observed" &&
    evidence.assessment.gates_passed === 6 &&
    evidence.assessment.gates_total === 54 &&
    evidence.assessment.mutants_rejected === 30 &&
    evidence.assessment.mutants_total === 30,
  "evidência registra 6/54 gates e 30/30 mutantes",
);
expect(
  evidence.validation.phase_018_checks === "43/43" &&
    evidence.validation.phase_017_regression === "43/43" &&
    evidence.validation.typecheck === "passed" &&
    evidence.validation.lint === "passed" &&
    evidence.validation.secret_scan === "passed" &&
    evidence.validation.secret_scan_files === 2997 &&
    evidence.validation.credentials_detected === 0,
  "evidência consolida validações e varredura de segredos",
);
expect(
  Object.values(evidence.inputs).every((value) => value === false),
  "nenhum artefato operacional foi presumido",
);
expect(
  evidence.decision.ready_for_sanitized_remediation_planning === false &&
    evidence.decision.remote_apply_authorized === false &&
    evidence.decision.production_authorized === false &&
    evidence.decision.real_data_copy_authorized === false,
  "nenhuma autorização operacional foi fabricada",
);
expect(
  Object.values(evidence.privacy).every((value) => value === false),
  "evidência não contém dados, nomes ou segredos",
);
expect(
  Object.values(evidence.safety).every((value) => value === false),
  "nenhuma ação remota, build ou ZIP foi executado",
);
expect(
  template.includes("nunca deve conter project ref") &&
    template.includes("Validade máxima: 30 minutos") &&
    template.includes("Nenhuma migration foi aplicada"),
  "template humano declara limites essenciais",
);
expect(
  evaluator.includes("validateDossier") &&
    evaluator.includes("validateTarget") &&
    evaluator.includes("validatePermit") &&
    evaluator.includes("validateObservation"),
  "avaliador separa os quatro contratos críticos",
);
expect(
  evaluator.includes("safeWorkspacePath") &&
    evaluator.includes("exactKeys") &&
    evaluator.includes("permit_hash_bindings_match") &&
    evaluator.includes("observation_hash_bindings_match"),
  "avaliador protege caminhos, forma e vínculos por hash",
);
expect(
  evaluator.includes("remote_read_executed === true") &&
    evaluator.includes("remote_write_executed === false") &&
    evaluator.includes("migration_applied === false"),
  "observação distingue leitura autorizada de escrita proibida",
);
expect(
  !evaluator.includes("writeFileSync") &&
    !evaluator.includes("execSync") &&
    !evaluator.includes("spawnSync") &&
    !evaluator.includes("supabase db push") &&
    !evaluator.includes("supabase migration repair"),
  "avaliador não grava nem executa comandos operacionais",
);
expect(
  packageJson.scripts?.["atlas:branch-preflight:assess"]?.includes(
    "run-atlas-isolated-branch-preflight-phase-018.mjs",
  ) &&
    packageJson.scripts?.["atlas:branch-preflight:check"]?.includes(
      "check-atlas-isolated-branch-preflight-phase-018.mjs",
    ),
  "comandos da Fase 18 estão publicados",
);
expect(
  runbook.includes("6/54") &&
    runbook.includes("30/30") &&
    runbook.includes("preflight_pending") &&
    runbook.includes("não foi executado"),
  "runbook registra estado real e fail-closed",
);
expect(
  runbook.includes("supabase.com/docs/guides/deployment/branching") &&
    runbook.includes("supabase.com/docs/guides/deployment/database-migrations") &&
    runbook.includes("supabase.com/docs/guides/database/postgres/row-level-security") &&
    runbook.includes("supabase.com/changelog/47796"),
  "runbook usa documentação oficial atual do Supabase",
);
expect(
  resultDoc.includes("6/54") &&
    resultDoc.includes("30/30") &&
    resultDoc.includes("Migration aplicada | Não") &&
    resultDoc.includes("ZIP criado | Não"),
  "resultado registra gates, mutantes e preservação operacional",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-isolated-branch-preflight-phase-018.mjs",
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
    selfTestPayload.mutants_rejected === 30 &&
    selfTestPayload.mutants_total === 30,
  "baseline segura passa e 30 mutantes são rejeitados",
);
expect(
  selfTestPayload.remote_command_executed === false &&
    selfTestPayload.file_written === false &&
    selfTestPayload.migration_applied === false &&
    selfTestPayload.production_touched === false,
  "autoteste não toca remoto, arquivo, migration ou produção",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-isolated-branch-preflight-phase-018.mjs"],
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
      "preflight_contract_ready_remote_execution_not_authorized" &&
    assessmentPayload.conclusion
      ?.ready_for_sanitized_remediation_planning === false,
  "avaliação falha fechado sem artefatos e observação",
);
expect(
  assessmentPayload.specification?.passed === 6 &&
    assessmentPayload.specification?.total === 54 &&
    assessmentPayload.specification?.blockers?.length === 48,
  "avaliação registra 6/54 gates e 48 blockers",
);
expect(
  assessmentPayload.safety?.evaluator_executed_remote_command === false &&
    assessmentPayload.safety?.remote_write_executed === false &&
    assessmentPayload.safety?.migration_applied === false &&
    assessmentPayload.safety?.production_touched === false &&
    assessmentPayload.safety?.build_executed === false &&
    assessmentPayload.safety?.release_package_created === false,
  "execução preserva remoto, migration, produção, build e ZIP",
);

const phase017Regression = spawnSync(
  process.execPath,
  ["scripts/check-atlas-homologation-decision-dossier-phase-017.mjs"],
  { encoding: "utf8" },
);
expect(
  phase017Regression.status === 0 &&
    phase017Regression.stdout.includes("43/43 checks passed"),
  "regressão da Fase 17 permanece verde",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exit(1);

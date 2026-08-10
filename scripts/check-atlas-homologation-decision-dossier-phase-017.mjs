import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

const config = readJson(
  "config/atlas-10x-phase-017-homologation-decision-dossier.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-017/homologation-decision-dossier-evidence.json",
);
const packageJson = readJson("package.json");
const evaluator = read(
  "scripts/run-atlas-homologation-decision-dossier-phase-017.mjs",
);
const template = read(
  "docs/templates/ATLAS_HOMOLOGATION_DECISION_DOSSIER_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_017_HOMOLOGATION_DECISION_DOSSIER.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_017_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-017.v1" &&
    config.phase === 17 &&
    config.total_phases === 24,
  "contrato da Fase 17 está versionado",
);
expect(
  config.input_contract.required_local_result_status ===
    "approved_local_rehearsal" &&
    config.input_contract.required_recovery_status ===
      "approved_recovery_drill" &&
    config.input_contract.required_decision_status ===
      "approved_for_homologation_preflight_only",
  "entradas exigem estados explicitamente aprovados",
);
expect(
  config.local_rehearsal_contract.scope ===
    "isolated_loopback_pg17_only" &&
    config.local_rehearsal_contract.postgres_major === 17 &&
    config.local_rehearsal_contract.cli_version === "2.109.1",
  "ensaio local exige PostgreSQL 17 e CLI conhecida",
);
expect(
  config.local_rehearsal_contract.second_reset_required === true &&
    config.local_rehearsal_contract.second_dynamic_test_required === true &&
    config.local_rehearsal_contract.idempotency_required === true,
  "ensaio exige repetição e idempotência",
);
expect(
  config.local_rehearsal_contract.security_advisor_required === true &&
    config.local_rehearsal_contract.performance_advisor_required === true &&
    config.local_rehearsal_contract.catalog_delta_exact_required === true,
  "advisors e delta exato são gates",
);
expect(
  config.recovery_contract.database_restore_required === true &&
    config.recovery_contract.storage_restore_required === true &&
    config.recovery_contract.authenticated_smoke_required === true,
  "recuperação cobre banco, Storage e smoke autenticado",
);
expect(
  config.recovery_contract.immutable_previous_v3_artifact_required === true &&
    config.recovery_contract.legacy_v2_rollback_forbidden === true &&
    config.recovery_contract.director_approval_required === true,
  "rollback usa V3 imutável e aprovação da diretoria",
);
expect(
  config.target_contract.allowed_target_types.includes(
    "supabase_preview_branch",
  ) &&
    config.target_contract.allowed_target_types.includes(
      "supabase_persistent_branch",
    ) &&
    config.target_contract.required_environment === "homologation",
  "alvo é branch Supabase isolada de homologação",
);
expect(
  config.target_contract.production_target_forbidden === true &&
    config.target_contract.main_branch_forbidden === true &&
    config.target_contract.allowed_data_policies.includes("data_less") &&
    config.target_contract.allowed_data_policies.includes("synthetic_only"),
  "produção, main e dados reais são proibidos",
);
expect(
  config.target_contract.raw_project_ref_forbidden === true &&
    config.target_contract.api_url_forbidden === true &&
    config.target_contract.api_keys_forbidden === true &&
    config.target_contract.connection_string_forbidden === true,
  "descritor do alvo não aceita identidade ou credencial em claro",
);
expect(
  config.target_contract.branch_health_must_be_preflight_pending === true &&
    config.required_gates.includes(
      "target_branch_health_is_preflight_pending",
    ),
  "saúde da branch permanece pendente até o preflight",
);
expect(
  config.target_contract.allowed_descriptor_fields.length === 10 &&
    config.required_gates.includes("target_descriptor_shape_is_exact"),
  "descritor do alvo possui forma exata e versionada",
);
expect(
  config.decision_contract.one_shot_required === true &&
    config.decision_contract.maximum_validity_hours === 24 &&
    config.decision_contract.independent_reviewer_required === true,
  "decisão é curta, de uso único e independente",
);
expect(
  config.decision_contract.local_result_sha256_required === true &&
    config.decision_contract.recovery_evidence_sha256_required === true &&
    config.decision_contract.target_descriptor_sha256_required === true &&
    config.decision_contract.manifest_sha256_required === true,
  "decisão vincula evidências críticas por hash",
);
expect(
  config.decision_contract.risk_register_required === true &&
    config.decision_contract.every_risk_requires_owner_and_disposition ===
      true,
  "todo risco exige responsável e disposição",
);
expect(
  config.decision_contract.decision_does_not_authorize_remote_apply === true &&
    config.decision_contract.decision_does_not_authorize_production === true &&
    config.decision_contract.decision_does_not_authorize_real_data_copy ===
      true,
  "decisão não autoriza aplicação, produção ou cópia real",
);
expect(
  config.dossier_contract.generated_only_when_all_gates_pass === true &&
    config.dossier_contract.generated_in_memory_before_manual_export === true &&
    config.dossier_contract.raw_inputs_embedded === false,
  "dossiê só nasce com todos os gates e primeiro fica em memória",
);
expect(
  config.dossier_contract.secrets_embedded === false &&
    config.dossier_contract.personal_data_embedded === false &&
    config.dossier_contract.contains_apply_command === false &&
    config.dossier_contract.contains_db_push_command === false,
  "dossiê não contém dados, segredos ou comando destrutivo",
);
expect(
  config.required_gates.length === 64 &&
    new Set(config.required_gates).size === config.required_gates.length,
  "64 gates obrigatórios são únicos",
);
expect(
  config.execution_policy.allows_remote_metadata_read === false &&
    config.execution_policy.allows_remote_schema_read === false &&
    config.execution_policy.allows_remote_ddl === false &&
    config.execution_policy.allows_remote_dml === false,
  "contrato não permite leitura ou escrita remota",
);
expect(
  config.execution_policy.allows_branch_creation === false &&
    config.execution_policy.allows_branch_merge === false &&
    config.execution_policy.allows_db_push === false &&
    config.execution_policy.allows_migration_repair === false,
  "branch, push, merge e repair permanecem proibidos",
);
expect(
  config.execution_policy.allows_real_data_copy === false &&
    config.execution_policy.allows_auth_user_read === false &&
    config.execution_policy.allows_business_data_read === false,
  "dados reais e auth.users permanecem fora do escopo",
);
expect(
  config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "build e ZIP continuam reservados ao checkpoint",
);
expect(
  evidence.status === "dossier_not_generated" &&
    evidence.assessment.gates_passed === 8 &&
    evidence.assessment.gates_total === 64 &&
    evidence.assessment.mutants_rejected === 23 &&
    evidence.assessment.mutants_total === 23 &&
    evidence.decision.all_gates_passed === false &&
    evidence.decision.dossier_generated === false,
  "evidência não alega decisão ou dossiê inexistente",
);
expect(
  Object.values(evidence.inputs).every((value) => value === false),
  "evidência registra todas as entradas reais como ausentes",
);
expect(
  evidence.decision.homologation_preflight_authorized === false &&
    evidence.decision.remote_apply_authorized === false &&
    evidence.decision.production_authorized === false &&
    evidence.decision.real_data_copy_authorized === false,
  "nenhuma autorização foi presumida",
);
expect(
  Object.values(evidence.privacy).every((value) => value === false),
  "evidência não contém segredo, dado pessoal ou identificador bruto",
);
expect(
  Object.values(evidence.safety).every((value) => value === false),
  "nenhuma ação operacional foi executada",
);
expect(
  template.includes("Não autoriza aplicar migration") &&
    template.includes("Não registrar project ref") &&
    template.includes("Aprovado somente para preflight manual"),
  "modelo humano declara limites e decisão permitida",
);
expect(
  template.includes("Restore do banco") &&
    template.includes("Restore do Storage") &&
    template.includes("RollBack") === false &&
    template.includes("Rollback não depende do V2"),
  "modelo cobre recuperação sem depender do V2",
);
expect(
  evaluator.includes("validateLocalRehearsal") &&
    evaluator.includes("validateRecovery") &&
    evaluator.includes("validateTarget") &&
    evaluator.includes("validateDecision"),
  "avaliador separa os quatro contratos críticos",
);
expect(
  evaluator.includes("safeWorkspacePath") &&
    evaluator.includes("sha256") &&
    evaluator.includes("target_descriptor_shape_is_exact") &&
    evaluator.includes("target_branch_health_is_preflight_pending"),
  "avaliador restringe caminhos, forma, hashes e saúde da branch",
);
expect(
  evaluator.includes("generated_in_memory") &&
    evaluator.includes("ready_for_manual_homologation_preflight") &&
    evaluator.includes("remote_apply_authorized: false"),
  "avaliador produz decisão explícita e limitada",
);
expect(
  !evaluator.includes("writeFileSync") &&
    !evaluator.includes("execSync") &&
    !evaluator.includes("spawnSync") &&
    !evaluator.includes("supabase db push") &&
    !evaluator.includes("supabase migration repair"),
  "avaliador não grava, executa banco, push ou repair",
);
expect(
  packageJson.scripts?.["atlas:homologation-dossier:assess"]?.includes(
    "run-atlas-homologation-decision-dossier-phase-017.mjs",
  ) &&
    packageJson.scripts?.["atlas:homologation-dossier:check"]?.includes(
      "check-atlas-homologation-decision-dossier-phase-017.mjs",
    ),
  "comandos da Fase 17 estão publicados",
);
expect(
  runbook.includes("não cria branch") &&
    runbook.includes("64 gates") &&
    runbook.includes("preflight_pending") &&
    runbook.includes("data_less"),
  "runbook explica isolamento, gates e estado do alvo",
);
expect(
  runbook.includes("supabase.com/docs/guides/deployment/branching") &&
    runbook.includes("supabase.com/docs/guides/deployment/database-migrations") &&
    runbook.includes("supabase.com/docs/guides/database/postgres/row-level-security"),
  "runbook usa documentação oficial atual do Supabase",
);
expect(
  resultDoc.includes("23/23") &&
    resultDoc.includes("8/64") &&
    resultDoc.includes("Migration aplicada | Não"),
  "resultado registra mutantes, gates e preservação operacional",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-homologation-decision-dossier-phase-017.mjs",
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
    selfTestPayload.mutants_rejected === 23 &&
    selfTestPayload.mutants_total === 23,
  "baseline segura passa e 23 mutantes são rejeitados",
);
expect(
  selfTestPayload.remote_read_executed === false &&
    selfTestPayload.remote_write_executed === false &&
    selfTestPayload.migration_applied === false &&
    selfTestPayload.dossier_persisted === false,
  "autoteste não acessa remoto, aplica migration ou grava dossiê",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-homologation-decision-dossier-phase-017.mjs"],
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
      "homologation_dossier_contract_ready_rehearsal_blocked" &&
    assessmentPayload.conclusion?.ready_for_manual_homologation_preflight ===
      false,
  "avaliação falha fechado sem ensaio, restore, alvo e aprovação",
);
expect(
  assessmentPayload.specification?.passed === 8 &&
    assessmentPayload.specification?.total === 64 &&
    assessmentPayload.dossier?.generated_in_memory === false,
  "avaliação registra 8/64 gates e não gera dossiê",
);
expect(
  assessmentPayload.safety?.remote_read_executed === false &&
    assessmentPayload.safety?.remote_write_executed === false &&
    assessmentPayload.safety?.migration_applied === false &&
    assessmentPayload.safety?.production_touched === false &&
    assessmentPayload.safety?.build_executed === false &&
    assessmentPayload.safety?.release_package_created === false,
  "execução preserva remoto, migration, produção, build e ZIP",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exit(1);

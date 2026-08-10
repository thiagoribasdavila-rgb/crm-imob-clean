import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

const config = readJson(
  "config/atlas-10x-phase-019-sanitized-remediation-plan.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-019/sanitized-remediation-plan-evidence.json",
);
const packageJson = readJson("package.json");
const evaluator = read(
  "scripts/run-atlas-sanitized-remediation-plan-phase-019.mjs",
);
const template = read(
  "docs/templates/ATLAS_SANITIZED_REMEDIATION_PLAN_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_019_SANITIZED_REMEDIATION_PLAN.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_019_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-019.v1" &&
    config.phase === 19 &&
    config.total_phases === 24,
  "contrato da Fase 19 está versionado",
);
expect(
  config.objective.includes("contagens sanitizadas") &&
    config.objective.includes("sem nomes de objetos") &&
    config.objective.includes("migration"),
  "objetivo limita o plano a dados sanitizados",
);
expect(
  config.input_contract.required_observation_schema_version ===
    "atlas.isolated_branch_preflight_observation.v1" &&
    config.input_contract.required_observation_status ===
      "isolated_branch_preflight_observed",
  "entrada exige observação válida da Fase 18",
);
expect(
  config.plan_contract.schema_version ===
    "atlas.sanitized_remediation_plan.v1" &&
    config.plan_contract.ready_status ===
      "sanitized_remediation_plan_ready_for_local_design" &&
    config.plan_contract.empty_status ===
      "no_sanitized_findings_observed",
  "plano possui estados controlados",
);
expect(
  config.plan_contract.required_item_fields.length === 11 &&
    new Set(config.plan_contract.required_item_fields).size === 11,
  "itens possuem forma exata",
);
expect(
  config.plan_contract.required_source_fields.length === 7 &&
    new Set(config.plan_contract.required_source_fields).size === 7,
  "sete hashes vinculam a origem",
);
expect(
  config.plan_contract.human_review_required === true &&
    config.plan_contract.counts_only === true,
  "plano exige humano e aceita somente contagens",
);
expect(
  config.plan_contract.object_names_forbidden === true &&
    config.plan_contract.raw_sql_forbidden === true &&
    config.plan_contract.raw_cli_output_forbidden === true,
  "nomes, SQL e saída bruta são proibidos",
);
expect(
  config.plan_contract.credentials_forbidden === true &&
    config.plan_contract.personal_data_forbidden === true &&
    config.plan_contract.business_data_forbidden === true &&
    config.plan_contract.auth_user_data_forbidden === true,
  "segredos e linhas reais são proibidos",
);
expect(
  config.workstreams.length === 7 &&
    new Set(config.workstreams.map((item) => item.id)).size === 7,
  "sete workstreams controlados são únicos",
);
expect(
  config.workstreams.some(
    (item) =>
      item.finding_class === "rls_coverage" &&
      item.source_count_field === "tables_without_rls" &&
      item.priority === "P0",
  ),
  "RLS sem cobertura é P0",
);
expect(
  config.workstreams.some(
    (item) =>
      item.finding_class === "data_api_grants" &&
      item.verification_strategy === "verify_grants_and_rls_together",
  ),
  "grants e RLS são verificados juntos",
);
expect(
  config.workstreams.some(
    (item) =>
      item.finding_class === "update_policy_pairing" &&
      item.remediation_intent === "pair_select_using_and_with_check",
  ),
  "UPDATE preserva SELECT, USING e WITH CHECK",
);
expect(
  config.workstreams.some(
    (item) =>
      item.finding_class === "view_security" &&
      item.remediation_intent === "enforce_invoker_or_revoke_exposure",
  ),
  "views recebem tratamento de segurança",
);
expect(
  config.workstreams.some(
    (item) =>
      item.finding_class === "security_definer" &&
      item.verification_strategy ===
        "verify_search_path_identity_and_execute_grants",
  ),
  "funções privilegiadas exigem verificação completa",
);
expect(
  config.workstreams.some(
    (item) =>
      item.finding_class === "security_advisors" &&
      item.priority === "P0",
  ) &&
    config.workstreams.some(
      (item) =>
        item.finding_class === "performance_advisors" &&
        item.priority === "P2",
    ),
  "segurança antecede performance",
);
expect(
  !config.workstreams.some(
    (item) =>
      item.source_count_field === "migration_entries" ||
      item.source_count_field === "exposed_tables",
  ),
  "inventário não é convertido automaticamente em falha",
);
expect(
  config.required_gates.length === 48 &&
    new Set(config.required_gates).size === 48,
  "48 gates obrigatórios são únicos",
);
expect(
  config.execution_policy.this_evaluator_executes_remote_commands === false &&
    config.execution_policy.this_evaluator_writes_files === false,
  "avaliador é local e read-only",
);
expect(
  config.execution_policy.allows_remote_read === false &&
    config.execution_policy.allows_remote_ddl === false &&
    config.execution_policy.allows_remote_dml === false,
  "nenhuma operação remota é autorizada",
);
expect(
  config.execution_policy.allows_migration_generation === false &&
    config.execution_policy.allows_migration_apply === false &&
    config.execution_policy.allows_db_push === false &&
    config.execution_policy.allows_migration_repair === false,
  "migration, push e repair ficam proibidos",
);
expect(
  config.execution_policy.allows_branch_mutation === false &&
    config.execution_policy.allows_production === false &&
    config.execution_policy.allows_real_data_copy === false,
  "branch, produção e cópia real ficam proibidas",
);
expect(
  config.execution_policy.allows_business_data_read === false &&
    config.execution_policy.allows_auth_user_read === false &&
    config.execution_policy.allows_storage_object_read === false,
  "dados comerciais, Auth e Storage ficam fora",
);
expect(
  config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "build e ZIP continuam no checkpoint",
);
expect(
  evidence.status === "remediation_plan_not_generated" &&
    evidence.assessment.gates_passed === 11 &&
    evidence.assessment.gates_total === 48 &&
    evidence.assessment.sanitized_plan_ready === false,
  "evidência registra bloqueio real 11/48",
);
expect(
  evidence.assessment.mutants_rejected === 28 &&
    evidence.assessment.mutants_total === 28,
  "evidência registra 28/28 mutantes",
);
expect(
  Object.values(evidence.inputs).every((value) => value === false),
  "nenhuma entrada operacional foi presumida",
);
expect(
  evidence.decision.ready_for_local_migration_design === false &&
    evidence.decision.remote_apply_authorized === false &&
    evidence.decision.production_authorized === false &&
    evidence.decision.human_review_required === true,
  "decisão não fabrica autorização",
);
expect(
  Object.values(evidence.privacy).every((value) => value === false),
  "evidência não contém nomes, dados ou segredos",
);
expect(
  Object.values(evidence.safety).every((value) => value === false),
  "nenhuma ação operacional foi executada",
);
expect(
  evaluator.includes("validateHistoricalPermit") &&
    evaluator.includes("validateObservation") &&
    evaluator.includes("buildSanitizedRemediationPlan") &&
    evaluator.includes("validateSanitizedRemediationPlan"),
  "avaliador separa fonte, construção e validação",
);
expect(
  evaluator.includes("safeWorkspacePath") &&
    evaluator.includes("source_chain_is_hash_bound") &&
    evaluator.includes("plan_source_hashes_are_sha256"),
  "caminhos e cadeia são protegidos por hashes",
);
expect(
  evaluator.includes("plan_counts_match_observation") &&
    evaluator.includes("plan_requires_human_review") &&
    evaluator.includes("plan_authorizes_no_remote_action"),
  "plano exige fidelidade, humano e zero autoridade",
);
expect(
  !evaluator.includes("writeFileSync") &&
    !evaluator.includes("execSync") &&
    !evaluator.includes("supabase db push") &&
    !evaluator.includes("supabase migration repair"),
  "avaliador não grava nem executa comandos perigosos",
);
expect(
  template.includes("nunca contém nomes de tabelas") &&
    template.includes("Revisão humana: obrigatória") &&
    template.includes("Nenhuma migration foi gerada ou aplicada"),
  "template humano explicita os limites",
);
expect(
  runbook.includes("sete workstreams controlados") &&
    runbook.includes("migration_entries") &&
    runbook.includes("não gera SQL"),
  "runbook documenta escopo e inventário",
);
expect(
  resultDoc.includes("11/48") &&
    resultDoc.includes("28/28") &&
    resultDoc.includes("Plano real gerado | Não"),
  "resultado mede o estado sem inflar conclusão",
);
expect(
  packageJson.scripts?.["atlas:remediation-plan:assess"]?.includes(
    "run-atlas-sanitized-remediation-plan-phase-019.mjs",
  ) &&
    packageJson.scripts?.["atlas:remediation-plan:check"]?.includes(
      "check-atlas-sanitized-remediation-plan-phase-019.mjs",
    ),
  "comandos da Fase 19 estão publicados",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-sanitized-remediation-plan-phase-019.mjs",
    "--self-test",
  ],
  { encoding: "utf8" },
);
const selfTestPayload =
  selfTest.status === 0 ? JSON.parse(selfTest.stdout) : {};
expect(
  selfTest.status === 0 &&
    selfTestPayload.safe_baseline === "accepted" &&
    selfTestPayload.total_findings === 18 &&
    selfTestPayload.active_workstreams === 7 &&
    selfTestPayload.mutants_rejected === 28 &&
    selfTestPayload.mutants_total === 28,
  "teste sintético aceita baseline e rejeita 28 mutantes",
);
expect(
  selfTestPayload.remote_command_executed === false &&
    selfTestPayload.file_written === false &&
    selfTestPayload.migration_generated === false &&
    selfTestPayload.migration_applied === false &&
    selfTestPayload.production_touched === false,
  "teste sintético comprova ausência de efeitos",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-sanitized-remediation-plan-phase-019.mjs"],
  { encoding: "utf8" },
);
const assessmentPayload =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : {};
expect(
  assessment.status === 0 &&
    assessmentPayload.status ===
      "remediation_plan_contract_ready_preflight_observation_required" &&
    assessmentPayload.specification.passed === 11 &&
    assessmentPayload.specification.total === 48 &&
    assessmentPayload.plan.generated_in_memory === false,
  "avaliação real permanece bloqueada sem evidência",
);
expect(
  assessmentPayload.conclusion.ready_for_local_migration_design === false &&
    assessmentPayload.conclusion.remote_apply_authorized === false &&
    assessmentPayload.conclusion.production_authorized === false &&
    assessmentPayload.conclusion.human_review_required === true,
  "conclusão mantém revisão humana e zero autorização",
);
expect(
  assessmentPayload.safety.evaluator_executed_remote_command === false &&
    assessmentPayload.safety.evaluator_wrote_file === false &&
    assessmentPayload.safety.remote_read_executed === false &&
    assessmentPayload.safety.remote_write_executed === false &&
    assessmentPayload.safety.migration_generated === false &&
    assessmentPayload.safety.migration_applied === false &&
    assessmentPayload.safety.build_executed === false &&
    assessmentPayload.safety.release_package_created === false,
  "avaliação real não toca remoto, migration, build ou ZIP",
);
expect(
  evidence.validation.phase_018_regression === "43/43" &&
    evidence.validation.typecheck === "passed" &&
    evidence.validation.lint === "passed" &&
    evidence.validation.secret_scan === "passed" &&
    evidence.validation.secret_scan_files === 3004 &&
    evidence.validation.credentials_detected === 0,
  "evidência consolida regressão, qualidade e segredos",
);
expect(
  evidence.validation.phase_019_checks ===
    `${checks.length + 1}/${checks.length + 1}`,
  "evidência registra total exato dos checks da Fase 19",
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
      phase: "19/24",
      passed: checks.length,
      total: checks.length,
      gates: "11/48",
      mutants: "28/28",
      remote_execution: false,
      migration_generated_or_applied: false,
      build_executed: false,
      package_created: false,
    },
    null,
    2,
  ),
);

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const config = json(
  "config/atlas-10x-phase-020-local-remediation-specification.json",
);
const evidence = json(
  "artifacts/runtime/phase-020/local-remediation-specification-evidence.json",
);
const packageJson = json("package.json");
const evaluator = read(
  "scripts/run-atlas-local-remediation-specification-phase-020.mjs",
);
const template = read(
  "docs/templates/ATLAS_REMEDIATION_WORKSTREAM_APPROVAL_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_020_LOCAL_REMEDIATION_SPECIFICATION.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_020_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);
const unique = (values) => new Set(values).size === values.length;

expect(
  config.schema_version === "atlas.10x.phase-020.v1" &&
    config.phase === 20 &&
    config.total_phases === 24,
  "contrato da Fase 20 está versionado",
);
expect(
  config.objective.includes("explicitamente aprovados") &&
    config.objective.includes("sem nomes de objetos") &&
    config.objective.includes("sem nomes de objetos") &&
    config.objective.includes("build ou ZIP"),
  "objetivo limita aprovação, dados e release",
);
expect(
  config.build_policy === "build_only_on_release_package" &&
    config.status ===
      "local_specification_contract_ready_phase_019_plan_and_human_approval_required",
  "estado inicial permanece fail-closed",
);
expect(
  config.input_contract.approval_path ===
    "artifacts/runtime/phase-020/manual/remediation-workstream-approval.json" &&
    config.input_contract.required_plan_schema_version ===
      "atlas.sanitized_remediation_plan.v1" &&
    config.input_contract.required_approval_schema_version ===
      "atlas.remediation_workstream_approval.v1",
  "entradas e schemas são exatos",
);
expect(
  config.input_contract.required_approval_status ===
    "approved_for_local_specification_only" &&
    config.input_contract.required_approval_scope ===
      "sanitized_active_workstreams_only" &&
    config.input_contract.approval_ttl_minutes === 60,
  "aprovação é local, restrita e curta",
);
expect(
  config.approval_contract.required_fields.length === 13 &&
    unique(config.approval_contract.required_fields) &&
    config.approval_contract.required_authorization_fields.length === 15 &&
    unique(config.approval_contract.required_authorization_fields),
  "forma da aprovação é fechada",
);
expect(
  config.approval_contract.requires_non_empty_approval === true &&
    config.approval_contract.requires_exact_active_partition === true &&
    config.approval_contract.requires_human_reviewer === true &&
    config.approval_contract.requires_change_ticket === true,
  "aprovação exige decisão humana completa",
);
expect(
  config.approval_contract.object_names_forbidden === true &&
    config.approval_contract.raw_sql_forbidden === true &&
    config.approval_contract.credentials_forbidden === true &&
    config.approval_contract.personal_data_forbidden === true &&
    config.approval_contract.business_data_forbidden === true &&
    config.approval_contract.auth_user_data_forbidden === true,
  "aprovação não transporta objetos, SQL ou dados",
);
expect(
  config.specification_contract.schema_version ===
    "atlas.local_remediation_specification.v1" &&
    config.specification_contract.ready_status ===
      "local_specifications_ready_for_human_authoring",
  "schema da especificação é local e versionado",
);
expect(
  config.specification_contract.required_root_fields.length === 7 &&
    config.specification_contract.required_source_fields.length === 4 &&
    config.specification_contract.required_summary_fields.length === 4 &&
    config.specification_contract.required_item_fields.length === 14,
  "formas da especificação são exatas",
);
expect(
  config.specification_contract.human_sql_authoring_required === true &&
    config.specification_contract.rollback_required === true &&
    config.specification_contract.migration_files_created === 0 &&
    config.specification_contract.raw_sql_forbidden === true &&
    config.specification_contract.object_names_forbidden === true,
  "especificação exige humano e não cria migration",
);
expect(
  config.design_catalog.length === 7 &&
    unique(config.design_catalog.map((item) => item.workstream_id)) &&
    config.design_catalog.every(
      (item) =>
        item.design_requirements.length === 3 &&
        item.verification_cases.length === 3,
    ),
  "sete padrões de desenho têm três requisitos e três testes",
);
expect(
  config.design_catalog.some(
    (item) =>
      item.workstream_id === "WS-RLS-001" &&
      item.design_requirements.includes("tenant_predicate_review") &&
      item.verification_cases.includes("cross_tenant_access_denied"),
  ),
  "RLS exige fronteira tenant negativa",
);
expect(
  config.design_catalog.some(
    (item) =>
      item.workstream_id === "WS-GRANT-002" &&
      item.design_requirements.includes("rls_and_grants_reviewed_together") &&
      item.verification_cases.includes("granted_role_respects_rls"),
  ),
  "grants e RLS são verificados juntos",
);
expect(
  config.design_catalog.some(
    (item) =>
      item.workstream_id === "WS-UPDATE-003" &&
      item.design_requirements.includes("select_policy_pairing") &&
      item.design_requirements.includes("with_check_predicate_required"),
  ),
  "UPDATE exige SELECT, USING e WITH CHECK",
);
expect(
  config.design_catalog.some(
    (item) =>
      item.workstream_id === "WS-VIEW-004" &&
      item.design_requirements.includes("security_invoker_preferred"),
  ),
  "views preferem security_invoker",
);
expect(
  config.design_catalog.some(
    (item) =>
      item.workstream_id === "WS-DEFINER-005" &&
      item.design_requirements.includes("fixed_search_path_if_definer_required") &&
      item.verification_cases.includes("public_execute_denied"),
  ),
  "funções privilegiadas exigem search_path e grants explícitos",
);
expect(
  config.design_catalog.some(
    (item) =>
      item.workstream_id === "WS-SECADV-006" &&
      item.verification_cases.includes("security_advisor_finding_resolved"),
  ) &&
    config.design_catalog.some(
      (item) =>
        item.workstream_id === "WS-PERFADV-007" &&
        item.design_requirements.includes("security_semantics_preserved"),
    ),
  "advisors preservam segurança antes de performance",
);
expect(
  config.required_gates.length === 50 &&
    unique(config.required_gates),
  "50 gates obrigatórios são únicos",
);
expect(
  config.execution_policy.this_evaluator_executes_remote_commands === false &&
    config.execution_policy.this_evaluator_writes_files === false &&
    config.execution_policy.allows_local_specification_in_memory === true,
  "avaliador é local, em memória e sem escrita",
);
expect(
  config.execution_policy.allows_sql_authoring === false &&
    config.execution_policy.allows_migration_generation === false &&
    config.execution_policy.allows_remote_read === false &&
    config.execution_policy.allows_remote_write === false &&
    config.execution_policy.allows_migration_apply === false &&
    config.execution_policy.allows_db_push === false &&
    config.execution_policy.allows_migration_repair === false,
  "SQL, migration e acesso remoto seguem proibidos",
);
expect(
  config.execution_policy.allows_branch_mutation === false &&
    config.execution_policy.allows_production === false &&
    config.execution_policy.allows_business_data_read === false &&
    config.execution_policy.allows_auth_user_read === false &&
    config.execution_policy.allows_storage_object_read === false &&
    config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "dados, produção, build e ZIP permanecem fora do escopo",
);
expect(
  config.next_phase.includes("Fase 21/24") &&
    config.next_phase.includes("Supabase CLI") &&
    config.next_phase.includes("sem aplicação remota"),
  "próxima fase mantém autoria local e zero apply",
);
expect(
  evaluator.includes("assessSanitizedRemediationPlan") &&
    evaluator.includes("validateWorkstreamApproval") &&
    evaluator.includes("buildLocalRemediationSpecification") &&
    evaluator.includes("validateLocalRemediationSpecification"),
  "avaliador encadeia plano, aprovação, construção e validação",
);
expect(
  evaluator.includes("approval_partitions_active_workstreams") &&
    evaluator.includes("approval_authorizes_local_specification_only") &&
    evaluator.includes("specification_contains_only_approved_workstreams"),
  "avaliador fecha partição e seleção",
);
expect(
  evaluator.includes("specification_requires_rollback") &&
    evaluator.includes("specification_requires_human_sql_authoring") &&
    evaluator.includes("specification_contains_no_migration_file"),
  "avaliador cobra rollback, humano e zero migration",
);
expect(
  !evaluator.includes("writeFile") &&
    !evaluator.includes("execSync") &&
    !evaluator.includes("spawnSync") &&
    !evaluator.includes("supabase db push") &&
    !evaluator.includes("supabase migration new"),
  "avaliador não grava nem executa comandos",
);
expect(
  template.includes("não autoriza SQL") &&
    template.includes("validade em no máximo 60 minutos") &&
    template.includes("Revisão humana: obrigatória") &&
    template.includes("Nenhuma migration foi gerada ou aplicada"),
  "template humano explicita limites essenciais",
);
expect(
  runbook.includes("aprovação humana curta e vinculada por hash") &&
    runbook.includes("Sete padrões de desenho") &&
    runbook.includes("não gera SQL") &&
    runbook.includes("Fase 21/24"),
  "runbook documenta fluxo e limites",
);
expect(
  runbook.includes(
    "https://supabase.com/docs/guides/api/securing-your-api",
  ) &&
    runbook.includes(
      "https://supabase.com/docs/guides/database/postgres/row-level-security",
    ) &&
    runbook.includes(
      "https://supabase.com/docs/guides/database/secure-data",
    ),
  "runbook referencia documentação oficial atual",
);
expect(
  resultDoc.includes("11/50") &&
    resultDoc.includes("41/41") &&
    resultDoc.includes("Especificação real gerada | Não") &&
    resultDoc.includes("Migration criada ou aplicada | Não"),
  "resultado mede o estado sem inflar conclusão",
);
expect(
  packageJson.scripts?.["atlas:remediation-spec:assess"]?.includes(
    "run-atlas-local-remediation-specification-phase-020.mjs",
  ) &&
    packageJson.scripts?.["atlas:remediation-spec:check"]?.includes(
      "check-atlas-local-remediation-specification-phase-020.mjs",
    ),
  "comandos da Fase 20 estão publicados",
);
expect(
  evidence.phase === "20/24" &&
    evidence.assessment.gates_passed === 11 &&
    evidence.assessment.gates_total === 50 &&
    evidence.assessment.mutants_rejected === 41 &&
    evidence.assessment.mutants_total === 41,
  "evidência registra gates e mutantes",
);
expect(
  evidence.inputs.phase_019_plan_ready === false &&
    evidence.inputs.approval_exists === false &&
    evidence.decision.ready_for_local_migration_authoring === false &&
    evidence.decision.remote_apply_authorized === false &&
    evidence.decision.production_authorized === false,
  "evidência não presume plano, aprovação ou autorização",
);
expect(
  Object.values(evidence.privacy).every((value) => value === false) &&
    evidence.safety.remote_command_executed === false &&
    evidence.safety.migration_generated === false &&
    evidence.safety.migration_applied === false &&
    evidence.safety.production_touched === false &&
    evidence.safety.build_executed === false &&
    evidence.safety.release_package_created === false,
  "evidência preserva privacidade e segurança",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-local-remediation-specification-phase-020.mjs",
    "--self-test",
  ],
  { encoding: "utf8" },
);
const selfTestPayload =
  selfTest.status === 0 ? JSON.parse(selfTest.stdout) : {};
expect(
  selfTest.status === 0 &&
    selfTestPayload.safe_baseline === "accepted" &&
    selfTestPayload.approved_workstreams === 6 &&
    selfTestPayload.deferred_workstreams === 1 &&
    selfTestPayload.approved_findings === 13 &&
    selfTestPayload.mutants_rejected === 41 &&
    selfTestPayload.mutants_total === 41,
  "baseline sintética é aceita e 41 mutantes são rejeitados",
);
expect(
  selfTestPayload.remote_command_executed === false &&
    selfTestPayload.file_written === false &&
    selfTestPayload.migration_generated === false &&
    selfTestPayload.migration_applied === false &&
    selfTestPayload.production_touched === false,
  "autoteste comprova ausência de efeitos",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-local-remediation-specification-phase-020.mjs"],
  { encoding: "utf8" },
);
const assessmentPayload =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : {};
expect(
  assessment.status === 0 &&
    assessmentPayload.status ===
      "local_specification_contract_ready_phase_019_plan_and_human_approval_required" &&
    assessmentPayload.specification_gates.passed === 11 &&
    assessmentPayload.specification_gates.total === 50 &&
    assessmentPayload.local_specification.generated_in_memory === false &&
    assessmentPayload.local_specification.migration_files_created === 0,
  "avaliação real permanece bloqueada sem plano e aprovação",
);
expect(
  assessmentPayload.conclusion.ready_for_local_migration_authoring === false &&
    assessmentPayload.conclusion.remote_apply_authorized === false &&
    assessmentPayload.conclusion.production_authorized === false &&
    assessmentPayload.conclusion.human_sql_authoring_required === true,
  "conclusão exige humano e mantém zero autorização",
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
  "avaliação não toca remoto, migration, build ou ZIP",
);

const phase019Regression = spawnSync(
  process.execPath,
  ["scripts/check-atlas-sanitized-remediation-plan-phase-019.mjs"],
  { encoding: "utf8" },
);
const phase019Payload =
  phase019Regression.status === 0
    ? JSON.parse(phase019Regression.stdout)
    : {};
expect(
  phase019Regression.status === 0 &&
    phase019Payload.passed === 45 &&
    phase019Payload.total === 45,
  "regressão da Fase 19 permanece verde",
);
expect(
  evidence.validation.phase_019_regression === "45/45" &&
    evidence.validation.typecheck === "passed" &&
    evidence.validation.lint === "passed" &&
    evidence.validation.secret_scan === "passed" &&
    Number.isInteger(evidence.validation.secret_scan_files) &&
    evidence.validation.secret_scan_files > 0 &&
    evidence.validation.credentials_detected === 0,
  "evidência consolida regressão, qualidade e ausência de credenciais",
);
expect(
  evidence.validation.phase_020_checks ===
    `${checks.length + 1}/${checks.length + 1}`,
  "evidência registra total exato dos checks da Fase 20",
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
      phase: "20/24",
      passed: checks.length,
      total: checks.length,
      gates: "11/50",
      mutants: "41/41",
      remote_execution: false,
      migration_generated_or_applied: false,
      build_executed: false,
      package_created: false,
    },
    null,
    2,
  ),
);

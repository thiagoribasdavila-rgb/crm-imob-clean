import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const config = json(
  "config/atlas-10x-phase-024-final-human-homologation-decision.json",
);
const evidence = json(
  "artifacts/runtime/phase-024/final-human-homologation-decision-evidence.json",
);
const packageJson = json("package.json");
const evaluator = read(
  "scripts/run-atlas-final-human-homologation-decision-phase-024.mjs",
);
const template = read(
  "docs/templates/ATLAS_FINAL_HOMOLOGATION_DECISION_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_024_FINAL_HUMAN_HOMOLOGATION_DECISION.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_024_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);
const unique = (values) => new Set(values).size === values.length;
const exactFalse = (value) =>
  Object.values(value ?? {}).every((entry) => entry === false);

expect(
  config.schema_version === "atlas.10x.phase-024.v1" &&
    config.phase === 24 &&
    config.total_phases === 24,
  "contrato da Fase 24 está versionado",
);
expect(
  config.status ===
      "final_homologation_decision_contract_ready_phase_023_dossier_and_human_decision_required" &&
    config.build_policy ===
      "build_only_in_separately_authorized_release_cycle",
  "estado inicial permanece bloqueado e sem release",
);
expect(
  config.objective.includes("fail-closed") &&
    config.objective.includes("plano de mudança controlado separado") &&
    config.objective.includes("não autoriza leitura remota") &&
    config.objective.includes("aplicação de migration") &&
    config.objective.includes("ZIP"),
  "objetivo separa decisão documental de execução",
);
expect(
  config.input_contract.execution_receipt_path ===
      "artifacts/runtime/phase-022/manual/local-rehearsal-execution-receipt.json" &&
    config.input_contract.human_review_path ===
      "artifacts/runtime/phase-023/manual/homologation-evidence-review.json" &&
    config.input_contract.sanitized_dossier_path ===
      "artifacts/runtime/phase-023/manual/sanitized-homologation-dossier.json" &&
    config.input_contract.final_decision_path ===
      "artifacts/runtime/phase-024/manual/final-homologation-decision.json",
  "quatro artefatos usam caminhos exatos",
);
expect(
  config.input_contract.required_dossier_schema_version ===
      "atlas.sanitized_homologation_evidence_dossier.v1" &&
    config.input_contract.required_decision_schema_version ===
      "atlas.final_homologation_decision.v1" &&
    config.input_contract.decision_ttl_minutes === 30,
  "schemas e validade curta são exatos",
);
expect(
  config.input_contract.required_dossier_status ===
      "ready_for_human_homologation_decision" &&
    config.input_contract.required_decision_status ===
      "approved_for_controlled_homologation_change_planning" &&
    config.input_contract.required_decision_scope ===
      "phase_023_sanitized_dossier_only",
  "status e escopo limitam a decisão ao dossiê",
);
expect(
  config.decision_contract.required_root_fields.length === 14 &&
    unique(config.decision_contract.required_root_fields),
  "decisão possui forma raiz fechada",
);
expect(
  config.decision_contract.required_environment_fields.length === 14 &&
    unique(config.decision_contract.required_environment_fields),
  "ambiente-alvo possui forma fechada",
);
expect(
  config.decision_contract.required_check_fields.length === 16 &&
    unique(config.decision_contract.required_check_fields),
  "revisões humanas possuem forma fechada",
);
expect(
  config.decision_contract.required_authorization_fields.length === 18 &&
    unique(config.decision_contract.required_authorization_fields),
  "autorizações da decisão possuem forma fechada",
);
expect(
  config.decision_contract.required_decision ===
      "prepare_separate_controlled_change_plan_only" &&
    JSON.stringify(config.decision_contract.allowed_postgres_majors) ===
      JSON.stringify([15, 17]),
  "decisão só prepara plano e recusa PostgreSQL 14",
);
expect(
  config.decision_contract.required_environment_fields.includes(
    "data_api_grants_and_rls_reviewed",
  ) &&
    config.decision_contract.required_environment_fields.includes(
      "view_and_function_boundaries_reviewed",
    ) &&
    config.decision_contract.required_environment_fields.includes(
      "service_secret_boundary_reviewed",
    ),
  "ambiente revisa grants, RLS, views, funções e segredo",
);
expect(
  config.decision_contract.required_check_fields.includes(
    "security_invoker_reviewed",
  ) &&
    config.decision_contract.required_check_fields.includes(
      "function_execution_boundary_reviewed",
    ) &&
    config.decision_contract.required_check_fields.includes(
      "no_real_data_read_confirmed",
    ),
  "checks cobrem fronteiras e ausência de leitura real",
);
expect(
  config.record_contract.schema_version ===
      "atlas.final_homologation_decision_record.v1" &&
    config.record_contract.ready_status ===
      "eligible_for_separate_controlled_change_plan",
  "registro final possui schema e estado próprios",
);
expect(
  config.record_contract.required_root_fields.length === 9 &&
    config.record_contract.required_source_fields.length === 4 &&
    unique(config.record_contract.required_root_fields) &&
    unique(config.record_contract.required_source_fields),
  "registro e cadeia de origem têm forma fechada",
);
expect(
  config.record_contract.required_evidence_fields.length === 8 &&
    config.record_contract.required_security_fields.length === 6,
  "evidência e segurança do registro são completas",
);
expect(
  config.record_contract.required_decision_fields.length === 10 &&
    config.record_contract.required_privacy_fields.length === 8 &&
    config.record_contract.required_authorization_fields.length === 16,
  "decisão, privacidade e autorização do registro são exatas",
);
expect(
  [
    "remote_apply_authorized",
    "linked_project_authorized",
    "production_authorized",
    "build_authorized",
    "zip_authorized",
    "deploy_authorized",
  ].every((field) =>
    config.record_contract.required_decision_fields.includes(field),
  ),
  "registro torna todas as proibições operacionais explícitas",
);
expect(
  config.required_gates.length === 67 &&
    unique(config.required_gates),
  "67 gates são obrigatórios e únicos",
);
expect(
  [
    "sanitized_dossier_hash_chain_matches",
    "decision_dossier_hash_matches",
    "decision_postgres_version_is_supported",
    "record_source_hashes_match",
    "record_requires_separate_controlled_change",
  ].every((gate) => config.required_gates.includes(gate)),
  "hashes, versão e mudança separada viram gates",
);
expect(
  [
    "remote_not_accessed",
    "linked_project_not_accessed",
    "production_not_touched",
    "business_or_auth_data_not_read",
    "build_not_executed",
    "package_not_created",
    "deploy_not_executed",
    "hostinger_not_mutated",
    "meta_not_mutated",
    "whatsapp_not_sent",
  ].every((gate) => config.required_gates.includes(gate)),
  "efeitos proibidos viram gates explícitos",
);
expect(
  config.execution_policy.this_evaluator_executes_commands === false &&
    config.execution_policy.this_evaluator_writes_files === false &&
    config.execution_policy.allows_record_in_memory === true,
  "avaliador é puro e registro existe só em memória",
);
expect(
  Object.entries(config.execution_policy)
    .filter(([field]) => field.startsWith("allows_"))
    .every(
      ([field, value]) =>
        field === "allows_record_in_memory"
          ? value === true
          : value === false,
    ),
  "política permite somente o registro em memória",
);
expect(
  config.official_references.includes(
    "https://supabase.com/docs/guides/api/securing-your-api",
  ) &&
    config.official_references.includes(
      "https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026",
    ) &&
    config.official_references.includes(
      "https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change",
    ),
  "contrato referencia segurança e compatibilidade oficiais",
);
expect(
  evaluator.includes("validateExecutionReceipt") &&
    evaluator.includes("validateHumanReview") &&
    evaluator.includes("validateSanitizedDossier") &&
    evaluator.includes("validateFinalDecision") &&
    evaluator.includes("validateFinalDecisionRecord"),
  "avaliador valida cada elo separadamente",
);
expect(
  evaluator.includes("buildSanitizedDossier") &&
    evaluator.includes("buildFinalDecisionRecord") &&
    evaluator.includes("assessFinalHumanHomologationDecision") &&
    evaluator.includes("selfTest"),
  "avaliador exporta construção, avaliação e autoteste",
);
expect(
  evaluator.includes("execution_receipt_sha256") &&
    evaluator.includes("human_review_sha256") &&
    evaluator.includes("sanitized_dossier_sha256") &&
    evaluator.includes("final_decision_sha256"),
  "cadeia completa de hashes é validada",
);
expect(
  evaluator.includes('environment.hosting_provider === "hostinger"') &&
    evaluator.includes('environment.database_provider === "supabase"') &&
    evaluator.includes('environment.target === "homologation"'),
  "ambiente real é restrito a Hostinger, Supabase e homologação",
);
expect(
  evaluator.includes("allowed_postgres_majors.includes") &&
    evaluator.includes("environment.pg14_not_used === true"),
  "avaliador exige versão suportada e rejeita PostgreSQL 14",
);
expect(
  !evaluator.includes('from "node:child_process"') &&
    !evaluator.includes("spawnSync(") &&
    !evaluator.includes("execSync(") &&
    !evaluator.includes("writeFileSync(") &&
    !evaluator.includes("appendFileSync(") &&
    !evaluator.includes("mkdirSync(") &&
    !evaluator.includes("rmSync("),
  "avaliador não executa comandos nem grava arquivos",
);
expect(
  template.includes(
    '"status": "approved_for_controlled_homologation_change_planning"',
  ) &&
    template.includes(
      '"decision": "prepare_separate_controlled_change_plan_only"',
    ) &&
    template.includes("no máximo 30 minutos"),
  "template documenta status, decisão e validade",
);
expect(
  template.includes('"homologation_status_recording": true') &&
    template.includes(
      '"controlled_change_plan_preparation": true',
    ) &&
    template.includes('"remote_read": false') &&
    template.includes('"release_package": false') &&
    template.includes('"deploy": false'),
  "template libera somente status e preparação de plano",
);
expect(
  template.includes("Não copie SQL") &&
    template.includes("dados de clientes") &&
    template.includes("strings de conexão"),
  "template proíbe evidência sensível ou bruta",
);
expect(
  runbook.includes("21 de 67") &&
    runbook.includes("31%") &&
    runbook.includes("114/114") &&
    runbook.includes("46"),
  "runbook expõe medição atual",
);
expect(
  runbook.includes("Contrato implementado") &&
    runbook.includes("Evidência homologável") &&
    runbook.includes("Execução autorizada"),
  "runbook distingue contrato, evidência e autoridade",
);
expect(
  runbook.toLowerCase().includes("grants e rls") &&
    runbook.includes("PostgreSQL 14") &&
    runbook.includes("Hostinger") &&
    runbook.includes("Supabase"),
  "runbook cobre segurança, compatibilidade e alvo",
);
expect(
  runbook.includes("não cria build ou ZIP") &&
    runbook.includes("não faz deploy") &&
    runbook.includes("não altera campanha Meta") &&
    runbook.includes("não envia WhatsApp"),
  "runbook preserva limites operacionais",
);
expect(
  resultDoc.includes("21/67") &&
    resultDoc.includes("114/114") &&
    resultDoc.includes("Registro final | Não gerado") &&
    resultDoc.includes("ZIP criado | Não") &&
    resultDoc.includes("Deploy executado | Não"),
  "resultado registra medição bloqueada",
);
expect(
  evidence.schema_version === "atlas.10x.phase-024.v1" &&
    evidence.phase === "24/24" &&
    evidence.status ===
      "final_homologation_decision_contract_ready_phase_023_dossier_and_human_decision_required",
  "evidência atual é versionada e honesta",
);
expect(
  evidence.final_decision_gates.passed === 21 &&
    evidence.final_decision_gates.total === 67 &&
    evidence.final_decision_gates.percentage === 31 &&
    evidence.final_decision_gates.blockers.length === 46,
  "evidência registra gates e blockers exatos",
);
expect(
  evidence.inputs.phase_022_assessment_available === true &&
    evidence.inputs.phase_023_assessment_available === true &&
    evidence.inputs.execution_receipt_exists === false &&
    evidence.inputs.human_review_exists === false &&
    evidence.inputs.sanitized_dossier_exists === false &&
    evidence.inputs.final_decision_exists === false,
  "evidência registra avaliações e entradas ausentes",
);
expect(
  evidence.final_record.generated_in_memory === false &&
    evidence.final_record.persisted === false &&
    evidence.final_record.operational_authority_granted === false,
  "registro final permanece ausente e sem autoridade",
);
expect(
  exactFalse(evidence.safety),
  "evidência confirma zero efeito operacional",
);
expect(
  evidence.conclusion.governance_foundation_cycle_complete === true &&
    evidence.conclusion.eligible_for_separate_controlled_change_plan ===
      false &&
    evidence.conclusion.human_execution_authorization_still_required ===
      true,
  "conclusão encerra fundação sem liberar plano",
);
expect(
  [
    "remote_apply_authorized",
    "production_authorized",
    "build_authorized",
    "zip_authorized",
    "deploy_authorized",
  ].every((field) => evidence.conclusion[field] === false),
  "conclusão não concede autoridade operacional",
);
expect(
  packageJson.scripts["atlas:homologation-final:assess"] ===
      "node scripts/run-atlas-final-human-homologation-decision-phase-024.mjs" &&
    packageJson.scripts["atlas:homologation-final:check"] ===
      "node scripts/check-atlas-final-human-homologation-decision-phase-024.mjs",
  "scripts npm da Fase 24 estão registrados",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-final-human-homologation-decision-phase-024.mjs",
    "--self-test",
  ],
  { cwd: root, encoding: "utf8" },
);
let selfTestResult = {};
try {
  selfTestResult = JSON.parse(selfTest.stdout || "{}");
} catch {
  selfTestResult = {};
}
expect(
  selfTest.status === 0 && selfTestResult.passed === true,
  "autoteste do avaliador é aprovado",
);
expect(
  selfTestResult.mutants?.rejected === 114 &&
    selfTestResult.mutants?.total === 114 &&
    selfTestResult.mutants?.decision_rejected === 59 &&
    selfTestResult.mutants?.record_rejected === 51 &&
    selfTestResult.mutants?.dossier_rejected === 4,
  "114 mutantes são rejeitados nos três contratos",
);
expect(
  Object.values(selfTestResult.valid_fixture ?? {}).every(Boolean),
  "fixtures válidas passam por toda a cadeia",
);
expect(
  Object.values(selfTestResult.effects ?? {}).every(
    (value) => value === 0 || value === false,
  ),
  "autoteste produz zero efeito",
);

const assessment = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-final-human-homologation-decision-phase-024.mjs",
  ],
  { cwd: root, encoding: "utf8" },
);
let assessmentResult = {};
try {
  assessmentResult = JSON.parse(assessment.stdout || "{}");
} catch {
  assessmentResult = {};
}
expect(
  assessment.status === 0 &&
    assessmentResult.schema_version === "atlas.10x.phase-024.v1",
  "avaliação real é legível",
);
expect(
  assessmentResult.final_decision_gates?.passed === 21 &&
    assessmentResult.final_decision_gates?.total === 67 &&
    assessmentResult.final_decision_gates?.blockers?.length === 46,
  "avaliação real mede 21/67",
);
expect(
  JSON.stringify(assessmentResult) === JSON.stringify(evidence),
  "evidência persistida corresponde exatamente à avaliação",
);
expect(
  assessmentResult.inputs?.execution_receipt_exists === false &&
    assessmentResult.inputs?.human_review_exists === false &&
    assessmentResult.inputs?.sanitized_dossier_exists === false &&
    assessmentResult.inputs?.final_decision_exists === false,
  "avaliação real permanece bloqueada por quatro entradas",
);
expect(
  assessmentResult.conclusion
    ?.eligible_for_separate_controlled_change_plan === false &&
    assessmentResult.conclusion
      ?.human_execution_authorization_still_required === true &&
    assessmentResult.final_record?.operational_authority_granted ===
      false,
  "avaliação real não concede aprovação automática",
);
expect(
  exactFalse(assessmentResult.safety),
  "avaliação real produz zero efeito",
);

const phase023Regression = spawnSync(
  process.execPath,
  [
    "scripts/check-atlas-sanitized-homologation-evidence-dossier-phase-023.mjs",
  ],
  { cwd: root, encoding: "utf8" },
);
expect(
  phase023Regression.status === 0 &&
    phase023Regression.stdout.includes("61/61 checks passed"),
  "regressão da Fase 23 permanece aprovada",
);

const phase022Regression = spawnSync(
  process.execPath,
  [
    "scripts/check-atlas-local-disposable-migration-rehearsal-phase-022.mjs",
  ],
  { cwd: root, encoding: "utf8" },
);
let phase022RegressionResult = {};
try {
  phase022RegressionResult = JSON.parse(
    phase022Regression.stdout || "{}",
  );
} catch {
  phase022RegressionResult = {};
}
expect(
  phase022Regression.status === 0 &&
    phase022RegressionResult.status === "passed" &&
    phase022RegressionResult.passed === 61 &&
    phase022RegressionResult.total === 61,
  "regressão da Fase 22 permanece aprovada",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;

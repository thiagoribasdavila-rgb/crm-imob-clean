import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const config = json(
  "config/atlas-10x-phase-023-sanitized-homologation-evidence-dossier.json",
);
const evidence = json(
  "artifacts/runtime/phase-023/sanitized-homologation-evidence-dossier.json",
);
const packageJson = json("package.json");
const evaluator = read(
  "scripts/run-atlas-sanitized-homologation-evidence-dossier-phase-023.mjs",
);
const template = read(
  "docs/templates/ATLAS_HOMOLOGATION_EVIDENCE_REVIEW_TEMPLATE.md",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_023_SANITIZED_HOMOLOGATION_EVIDENCE_DOSSIER.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_023_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);
const unique = (values) => new Set(values).size === values.length;

expect(
  config.schema_version === "atlas.10x.phase-023.v1" &&
    config.phase === 23 &&
    config.total_phases === 24,
  "contrato da Fase 23 está versionado",
);
expect(
  config.objective.includes("fail-closed") &&
    config.objective.includes("somente em memória") &&
    config.objective.includes("sem executar comandos") &&
    config.objective.includes("sem ZIP"),
  "objetivo bloqueia efeitos operacionais",
);
expect(
  config.status ===
      "homologation_evidence_contract_ready_phase_022_execution_receipt_and_human_review_required" &&
    config.build_policy === "build_only_on_release_package",
  "estado inicial permanece bloqueado e sem build",
);
expect(
  config.input_contract.execution_receipt_path ===
      "artifacts/runtime/phase-022/manual/local-rehearsal-execution-receipt.json" &&
    config.input_contract.human_review_path ===
      "artifacts/runtime/phase-023/manual/homologation-evidence-review.json",
  "entradas manuais usam caminhos exatos",
);
expect(
  config.input_contract.required_receipt_schema_version ===
      "atlas.local_rehearsal_execution_receipt.v1" &&
    config.input_contract.required_review_schema_version ===
      "atlas.homologation_evidence_review.v1" &&
    config.input_contract.review_ttl_minutes === 30,
  "schemas e validade curta são exatos",
);
expect(
  config.source_contract.required_cli_version === "2.109.1" &&
    config.source_contract.required_project_id ===
      "atlas-phase-022-rehearsal" &&
    config.source_contract.required_workdir ===
      ".atlas/runtime/phase-022/rehearsal",
  "CLI e isolamento herdados são fixos",
);
expect(
  config.source_contract.required_test_file ===
      "supabase/tests/atlas_security_remediation_test.sql" &&
    config.source_contract.required_test_count === 18,
  "arquivo pgTAP e contagem são fixos",
);
expect(
  config.receipt_contract.required_root_fields.length === 11 &&
    unique(config.receipt_contract.required_root_fields),
  "recibo possui forma raiz fechada",
);
expect(
  config.receipt_contract.required_source_fields.length === 10 &&
    config.receipt_contract.required_environment_fields.length === 7 &&
    unique(config.receipt_contract.required_source_fields) &&
    unique(config.receipt_contract.required_environment_fields),
  "origem e ambiente do recibo têm forma fechada",
);
expect(
  config.receipt_contract.required_execution_fields.length === 13 &&
    unique(config.receipt_contract.required_execution_fields),
  "execução exige timestamps e todas as etapas",
);
expect(
  config.receipt_contract.required_test_result_fields.length === 6 &&
    config.receipt_contract.required_lint_result_fields.length === 4,
  "pgTAP e lint têm resultados mínimos",
);
expect(
  config.receipt_contract.required_fingerprint_fields.length === 6 &&
    config.receipt_contract.required_cleanup_fields.length === 7,
  "fingerprints e cleanup são completos",
);
expect(
  config.receipt_contract.required_privacy_fields.length === 8 &&
    config.receipt_contract.required_authorization_fields.length === 12,
  "privacidade e autorizações do recibo são exatas",
);
expect(
  config.review_contract.required_root_fields.length === 13 &&
    config.review_contract.required_check_fields.length === 10 &&
    unique(config.review_contract.required_root_fields) &&
    unique(config.review_contract.required_check_fields),
  "revisão humana tem forma fechada",
);
expect(
  config.review_contract.required_authorization_fields.length === 14 &&
    config.review_contract.required_decision ===
      "prepare_human_homologation_decision_only",
  "revisão limita autorização à decisão",
);
expect(
  config.review_contract.requires_human_reviewer === true &&
    config.review_contract.requires_change_ticket === true &&
    config.review_contract.requires_one_shot === true,
  "revisor, ticket e uso único são obrigatórios",
);
expect(
  config.dossier_contract.schema_version ===
      "atlas.sanitized_homologation_evidence_dossier.v1" &&
    config.dossier_contract.ready_status ===
      "ready_for_human_homologation_decision",
  "dossiê possui schema e estado próprios",
);
expect(
  config.dossier_contract.required_root_fields.length === 11 &&
    config.dossier_contract.required_source_fields.length === 5 &&
    config.dossier_contract.required_environment_fields.length === 6,
  "dossiê tem raiz, origem e ambiente fechados",
);
expect(
  config.dossier_contract.required_verification_fields.length === 8 &&
    config.dossier_contract.required_security_coverage_fields.length === 8,
  "verificação e segurança do dossiê são completas",
);
expect(
  config.dossier_contract.required_rollback_fields.length === 4 &&
    config.dossier_contract.required_cleanup_fields.length === 5 &&
    config.dossier_contract.required_decision_fields.length === 6,
  "rollback, cleanup e decisão são exatos",
);
expect(
  config.security_test_catalog.length === 18 &&
    unique(config.security_test_catalog),
  "catálogo possui 18 provas únicas",
);
expect(
  ["select", "insert", "update", "delete"].every((operation) =>
    config.security_test_catalog.includes(
      `anonymous_${operation}_denied`,
    ),
  ),
  "CRUD anônimo é negado integralmente",
);
expect(
  ["select", "insert", "update", "delete"].every((operation) =>
    config.security_test_catalog.includes(
      `cross_tenant_${operation}_denied`,
    ),
  ),
  "CRUD entre tenants é negado integralmente",
);
expect(
  ["select", "insert", "update", "delete"].every((operation) =>
    config.security_test_catalog.includes(
      `owned_row_${operation}_allowed`,
    ),
  ),
  "CRUD próprio permitido é provado integralmente",
);
expect(
  config.security_test_catalog.includes(
    "data_api_requires_explicit_grant_and_rls",
  ) &&
    config.security_test_catalog.includes(
      "granted_role_still_respects_rls",
    ),
  "grants da Data API e RLS são comprovados juntos",
);
expect(
  config.security_test_catalog.includes(
    "view_respects_security_invoker",
  ) &&
    config.security_test_catalog.includes(
      "public_function_execute_denied",
    ) &&
    config.security_test_catalog.includes(
      "service_role_secret_absent_from_client",
    ),
  "views, funções e segredo de serviço têm fronteiras",
);
expect(
  config.required_gates.length === 84 &&
    unique(config.required_gates),
  "84 gates são obrigatórios e únicos",
);
expect(
  [
    "receipt_schema_fingerprint_restored",
    "receipt_history_fingerprint_restored",
    "receipt_cleanup_is_targeted_and_complete",
    "review_receipt_hash_matches",
    "dossier_requires_human_approval",
  ].every((gate) => config.required_gates.includes(gate)),
  "restauração, cleanup, hash e decisão humana viram gates",
);
expect(
  [
    "remote_not_accessed",
    "linked_project_not_accessed",
    "production_not_touched",
    "build_not_executed",
    "package_not_created",
  ].every((gate) => config.required_gates.includes(gate)),
  "efeitos proibidos viram gates explícitos",
);
expect(
  config.execution_policy.this_evaluator_executes_commands === false &&
    config.execution_policy.this_evaluator_writes_files === false &&
    config.execution_policy.allows_dossier_in_memory === true,
  "avaliador é puro e dossiê existe só em memória",
);
expect(
  [
    "allows_remote_read",
    "allows_remote_write",
    "allows_linked_project",
    "allows_db_push",
    "allows_production",
    "allows_build",
    "allows_release_package",
  ].every((field) => config.execution_policy[field] === false),
  "política proíbe remoto, produção e release",
);
expect(
  config.official_references.includes(
    "https://supabase.com/docs/guides/local-development/cli/testing-and-linting",
  ) &&
    config.official_references.includes(
      "https://supabase.com/docs/guides/api/securing-your-api",
    ),
  "contrato referencia teste e segurança oficiais",
);
expect(
  evaluator.includes("validateExecutionReceipt") &&
    evaluator.includes("validateHumanReview") &&
    evaluator.includes("validateSanitizedDossier"),
  "avaliador separa recibo, revisão e dossiê",
);
expect(
  evaluator.includes("securityCatalogHash") &&
    evaluator.includes("execution_receipt_sha256") &&
    evaluator.includes("human_review_sha256"),
  "cadeia de hashes é validada",
);
expect(
  evaluator.includes("receipt_migration_changed_schema") &&
    evaluator.includes("receipt_schema_fingerprint_restored") &&
    evaluator.includes("receipt_history_fingerprint_restored"),
  "mudança e restauração são comprovadas",
);
expect(
  evaluator.includes("used_all_flag === false") &&
    evaluator.includes("residual_containers === 0") &&
    evaluator.includes("residual_volumes === 0"),
  "cleanup global e resíduos são recusados",
);
expect(
  !evaluator.includes('from "node:child_process"') &&
    !evaluator.includes("spawnSync(") &&
    !evaluator.includes("execSync(") &&
    !evaluator.includes("writeFileSync("),
  "avaliador não executa comandos nem grava arquivos",
);
expect(
  !evaluator.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !evaluator.includes("DATABASE_URL") &&
    !evaluator.includes(["NEXT", "PUBLIC", "SUPABASE"].join("_")),
  "avaliador não lê nomes de credenciais",
);
expect(
  template.includes(
    "atlas.local_rehearsal_execution_receipt.v1",
  ) &&
    template.includes("atlas.homologation_evidence_review.v1"),
  "template documenta os dois artefatos",
);
expect(
  template.includes('"contains_raw_sql": false') &&
    template.includes('"contains_connection_strings": false') &&
    template.includes('"linked_project": false') &&
    template.includes('"release_package": false'),
  "template exclui evidência bruta e autoridade externa",
);
expect(
  template.includes('"dossier_generation": true') &&
    template.includes(
      '"homologation_decision_preparation": true',
    ) &&
    template.includes("no máximo 30 minutos"),
  "revisão só prepara dossiê e decisão por tempo curto",
);
expect(
  runbook.includes("16 de 84 gates") &&
    runbook.includes("18 de 18 testes pgTAP") &&
    runbook.includes("zero container e volume residual"),
  "runbook expõe estado e evidência exigida",
);
expect(
  runbook.includes("Grants controlam") &&
    runbook.includes("RLS controla") &&
    runbook.includes("PostgreSQL 14"),
  "runbook cobre segurança e compatibilidade atual",
);
expect(
  runbook.includes("não cria build ou ZIP") &&
    runbook.includes("projeto linked"),
  "runbook preserva limites operacionais",
);
expect(
  resultDoc.includes("16/84") &&
    resultDoc.includes("113/113") &&
    resultDoc.includes("61/61") &&
    resultDoc.includes("3.032 arquivos; 0 credenciais") &&
    resultDoc.includes("Dossiê gerado | Não"),
  "resultado registra medição bloqueada",
);
expect(
  evidence.schema_version === "atlas.phase-023.evidence.v1" &&
    evidence.phase === "23/24" &&
    evidence.status === "homologation_evidence_not_generated",
  "evidência atual é versionada e honesta",
);
expect(
  evidence.assessment.gates_passed === 16 &&
    evidence.assessment.gates_total === 84 &&
    evidence.assessment.mutants_rejected === 113 &&
    evidence.assessment.mutants_total === 113 &&
    evidence.validation.phase_023_checks === "61/61" &&
    evidence.validation.phase_022_regression === "61/61" &&
    evidence.validation.typecheck === "passed" &&
    evidence.validation.lint === "passed" &&
    evidence.validation.secret_scan === "passed" &&
    evidence.validation.secret_scan_files === 3032 &&
    evidence.validation.credentials_detected === 0,
  "evidência registra gates e mutantes exatos",
);
expect(
  evidence.inputs.phase_022_assessment_available === true &&
    evidence.inputs.execution_receipt_exists === false &&
    evidence.inputs.human_review_exists === false,
  "evidência registra entradas ausentes",
);
expect(
  evidence.decision.ready_for_human_homologation_decision === false &&
    evidence.decision.human_approval_required === true &&
    evidence.decision.remote_apply_authorized === false &&
    evidence.decision.production_authorized === false,
  "decisão permanece bloqueada e humana",
);
expect(
  Object.values(evidence.privacy).every((value) => value === false),
  "evidência não carrega conteúdo sensível",
);
expect(
  Object.values(evidence.safety).every((value) => value === false),
  "evidência confirma zero efeito operacional",
);
expect(
  packageJson.scripts["atlas:homologation-evidence:assess"] ===
      "node scripts/run-atlas-sanitized-homologation-evidence-dossier-phase-023.mjs" &&
    packageJson.scripts["atlas:homologation-evidence:check"] ===
      "node scripts/check-atlas-sanitized-homologation-evidence-dossier-phase-023.mjs",
  "scripts npm da Fase 23 estão registrados",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-sanitized-homologation-evidence-dossier-phase-023.mjs",
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
  selfTestResult.mutants?.rejected === 113 &&
    selfTestResult.mutants?.total === 113,
  "113 mutantes são rejeitados",
);
expect(
  selfTestResult.valid_fixture?.receipt === true &&
    selfTestResult.valid_fixture?.review === true &&
    selfTestResult.valid_fixture?.dossier === true,
  "fixtures válidas passam pelos três validadores",
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
    "scripts/run-atlas-sanitized-homologation-evidence-dossier-phase-023.mjs",
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
    assessmentResult.schema_version === "atlas.10x.phase-023.v1",
  "avaliação real é legível",
);
expect(
  assessmentResult.dossier_gates?.passed === 16 &&
    assessmentResult.dossier_gates?.total === 84,
  "avaliação real mede 16/84",
);
expect(
  assessmentResult.inputs?.execution_receipt_exists === false &&
    assessmentResult.inputs?.human_review_exists === false &&
    assessmentResult.dossier?.generated_in_memory === false,
  "avaliação real permanece bloqueada por entradas ausentes",
);
expect(
  assessmentResult.conclusion
    ?.ready_for_human_homologation_decision === false &&
    assessmentResult.conclusion?.human_approval_required === true &&
    assessmentResult.conclusion?.remote_apply_authorized === false,
  "avaliação real não concede aprovação automática",
);
expect(
  Object.values(assessmentResult.safety ?? {}).every(
    (value) => value === false,
  ),
  "avaliação real produz zero efeito",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;

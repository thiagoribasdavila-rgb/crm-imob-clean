import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));
const config = readJson(
  "config/atlas-10x-phase-015-isolated-migration-package.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-015/isolated-migration-package-evidence.json",
);
const packageJson = readJson("package.json");
const generator = read(
  "scripts/run-atlas-isolated-migration-package-phase-015.mjs",
);
const reviewTemplate = read(
  "scripts/sql/phase-015-isolated-migration-review-template.sql",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_015_ISOLATED_MIGRATION_PACKAGE.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_015_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-015.v1" &&
    config.phase === 15 &&
    config.total_phases === 24,
  "contrato da Fase 15 está versionado",
);
expect(
  config.input_contract.required_approval_scope ===
    "isolated_loopback_pg17_only" &&
    config.input_contract.expected_postgres_major === 17,
  "aprovação limita o ensaio a loopback PostgreSQL 17",
);
expect(
  config.approval_contract.human_approval_required === true &&
    config.approval_contract.backlog_sha256_required === true &&
    config.approval_contract.snapshot_sha256_required === true &&
    config.approval_contract.approval_does_not_authorize_remote_apply === true,
  "recibo humano vincula backlog e snapshot sem autorizar remoto",
);
expect(
  config.migration_package_contract.automatic_file_creation_allowed ===
    false &&
    config.migration_package_contract.executable_sql_allowed_before_approval ===
      false &&
    config.migration_package_contract.migration_must_be_scaffolded_with_cli ===
      true,
  "nenhuma migration ou SQL nasce automaticamente",
);
expect(
  config.migration_package_contract.transaction_required_when_supported ===
    true &&
    config.migration_package_contract.lock_timeout_required === true &&
    config.migration_package_contract.statement_timeout_required === true,
  "ensaio exige transação e limites de espera",
);
expect(
  config.migration_package_contract.preconditions_required === true &&
    config.migration_package_contract.postconditions_required === true &&
    config.migration_package_contract.idempotency_review_required === true,
  "precondições, pós-condições e idempotência são obrigatórias",
);
expect(
  config.migration_package_contract.dynamic_rls_tests_required === true &&
    config.migration_package_contract.database_advisors_required === true &&
    config.migration_package_contract.local_reset_required === true,
  "RLS dinâmico, advisors e reset local fecham o ensaio",
);
expect(
  config.migration_package_contract.automatic_rollback_allowed === false &&
    config.migration_package_contract.rollback_may_not_restore_unsafe_access ===
      true &&
    config.migration_package_contract.reversibility_classes.length === 3,
  "rollback é classificado e nunca reabre exposição",
);
expect(
  config.non_migratable_categories.includes("CANONICAL_ENTITY_MISSING") &&
    config.non_migratable_categories.includes("INVENTORY_INCOMPLETE"),
  "lacunas de inventário não viram DDL",
);
expect(
  config.cli_contract.verified_cli_version === "2.109.1" &&
    config.cli_contract.forbidden_tokens.includes("--linked") &&
    config.cli_contract.forbidden_tokens.includes("--db-url") &&
    config.cli_contract.forbidden_tokens.includes("supabase db push") &&
    config.cli_contract.forbidden_tokens.includes(
      "supabase migration repair",
    ),
  "contrato do CLI proíbe alvos e reparos remotos",
);
expect(
  config.execution_policy.allows_migration_scaffold === false &&
    config.execution_policy.allows_local_database_reset === false &&
    config.execution_policy.allows_remote_ddl === false &&
    config.execution_policy.allows_remote_dml === false,
  "fase atual não cria arquivo, reseta banco ou escreve remoto",
);
expect(
  config.execution_policy.allows_build === false &&
    config.execution_policy.allows_release_package === false,
  "build e ZIP continuam reservados ao checkpoint",
);
expect(
  evidence.status === "migration_package_not_generated" &&
    evidence.package.generated === false &&
    evidence.package.executable_sql_generated === false &&
    evidence.package.migration_file_created === false,
  "evidência não alega pacote, SQL ou migration",
);
expect(
  evidence.cli.local_cli_detected === true &&
    evidence.cli.version === "2.109.1" &&
    evidence.cli.help_inspected === true &&
    evidence.cli.isolated_home_used === true,
  "CLI local foi inspecionado com home isolado",
);
expect(
  evidence.cli.linked_command_used === false &&
    evidence.cli.db_url_used === false &&
    evidence.cli.db_push_used === false &&
    evidence.cli.migration_repair_used === false,
  "nenhum comando remoto ou reparo de histórico foi usado",
);
expect(
  evidence.safety.remote_read_executed === false &&
    evidence.safety.remote_write_executed === false &&
    evidence.safety.live_homologation_touched === false &&
    evidence.safety.migration_applied === false,
  "remoto, homologação e migrations permanecem intactos",
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
  "modelo não possui comando SQL executável",
);
expect(
  reviewTemplate.includes("RLS e grants") &&
    reviewTemplate.includes("USING e WITH CHECK") &&
    reviewTemplate.includes("security_invoker") &&
    reviewTemplate.includes("SECURITY DEFINER"),
  "modelo cobre os controles essenciais do Supabase",
);
expect(
  generator.includes("validateApprovedPackage") &&
    generator.includes("createMigrationPackage") &&
    generator.includes("rollbackDoesNotReopenExposure"),
  "gerador valida aprovação, pacote e rollback",
);
expect(
  generator.includes("p0PrecedesP1") &&
    generator.includes("dependencyClosureComplete") &&
    generator.includes("exactObjectKey"),
  "gerador impõe severidade, dependências e allowlist exata",
);
expect(
  !generator.includes("writeFileSync") &&
    !generator.includes("execSync") &&
    !generator.includes("spawnSync"),
  "gerador não grava nem executa comandos",
);
expect(
  packageJson.scripts?.["atlas:migration-package:assess"]?.includes(
    "run-atlas-isolated-migration-package-phase-015.mjs",
  ) &&
    packageJson.scripts?.["atlas:migration-package:check"]?.includes(
      "check-atlas-isolated-migration-package-phase-015.mjs",
    ),
  "comandos da Fase 15 estão publicados",
);
expect(
  runbook.includes("não é autorização de produção") &&
    runbook.includes("correção segura para frente") &&
    runbook.includes("Supabase em 2026"),
  "runbook explica escopo, rollback e controles atuais",
);
expect(
  resultDoc.includes("15/15") &&
    resultDoc.includes("Homologação alterada | Não"),
  "resultado registra mutantes e preservação operacional",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-isolated-migration-package-phase-015.mjs",
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
    selfTestPayload.mutants_classified === 15 &&
    selfTestPayload.mutants_total === 15 &&
    selfTestPayload.executable_sql === "not_generated" &&
    selfTestPayload.migration_file === "not_created",
  "baseline segura passa e 15 mutantes são bloqueados",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-isolated-migration-package-phase-015.mjs"],
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
      "isolated_migration_contract_ready_approval_blocked" &&
    assessmentPayload.conclusion?.ready_for_cli_scaffold_review === false,
  "avaliação falha fechado sem backlog, snapshot e recibo",
);
expect(
  assessmentPayload.approval?.accepted === false &&
    assessmentPayload.migration_package?.generated_in_memory === false &&
    assessmentPayload.conclusion?.migration_created === false &&
    assessmentPayload.conclusion?.migration_applied === false,
  "ausência de aprovação não produz pacote ou migration",
);
expect(
  assessmentPayload.safety?.remote_write_executed === false &&
    assessmentPayload.safety?.live_homologation_touched === false &&
    assessmentPayload.safety?.build_executed === false &&
    assessmentPayload.safety?.release_package_created === false,
  "execução preserva remoto, homologação, build e ZIP",
);

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exit(1);

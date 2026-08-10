import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-011-canonical-baseline-package.json"),
);
const manifest = JSON.parse(
  read("artifacts/runtime/phase-011/canonical-baseline-manifest.json"),
);
const packageJson = JSON.parse(read("package.json"));
const assessor = read(
  "scripts/run-atlas-canonical-baseline-package-phase-011.mjs",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_011_CANONICAL_BASELINE_PACKAGE.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_011_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-011.v1" &&
    config.phase === 11 &&
    config.total_phases === 24,
  "contrato da Fase 11 está versionado",
);
expect(
  config.supabase_cli_contract.verified_version === "2.109.1" &&
    config.supabase_cli_contract.explicit_target_flag_required === true,
  "CLI atual e alvo explícito são obrigatórios",
);
expect(
  config.supabase_cli_contract.live_homologation_db_pull_allowed ===
    false &&
    config.supabase_cli_contract.live_homologation_db_dump_allowed ===
      false,
  "captura direta da homologação é proibida",
);
expect(
  config.execution_policy.remote_ddl_enabled === false &&
    config.execution_policy.remote_dml_enabled === false &&
    config.execution_policy.migration_repair_enabled === false &&
    config.execution_policy.migration_push_enabled === false,
  "DDL, DML, repair e push permanecem bloqueados",
);
expect(
  config.local_history_contract.expected_file_count === 126 &&
    config.local_history_contract.expected_duplicate_version_count ===
      3 &&
    config.local_history_contract.rename_existing_files === false,
  "histórico local é referência imutável",
);
expect(
  config.baseline_content_contract.required_schemas.includes(
    "public",
  ) &&
    config.baseline_content_contract.conditional_schemas.includes(
      "auth",
    ) &&
    config.baseline_content_contract.conditional_schemas.includes(
      "storage",
    ),
  "escopo de schemas é mínimo e condicional",
);
expect(
  config.baseline_content_contract.required_security_invariants.includes(
    "rls_and_data_api_grants_validated_separately",
  ) &&
    config.baseline_content_contract.required_security_invariants.includes(
      "update_policies_have_select_visibility_using_and_with_check",
    ),
  "RLS, grants e UPDATE têm invariantes explícitas",
);
expect(
  config.baseline_content_contract.required_security_invariants.includes(
    "security_definer_functions_have_explicit_search_path_and_execute_audit",
  ) &&
    config.baseline_content_contract.required_security_invariants.includes(
      "exposed_views_use_security_invoker_or_are inaccessible_to_api_roles",
    ),
  "funções e views não criam bypass implícito",
);
expect(
  config.baseline_content_contract.business_data_allowed === false &&
    config.baseline_content_contract.personal_data_allowed === false &&
    config.baseline_content_contract.auth_user_rows_allowed === false &&
    config.baseline_content_contract.synthetic_fixtures_only === true,
  "baseline aceita somente fixtures sintéticas",
);
expect(
  config.required_package_artifacts.length === 10 &&
    config.required_package_artifacts.includes(
      "canonical_baseline.sql",
    ) &&
    config.required_package_artifacts.includes(
      "checksums.sha256",
    ),
  "pacote final exige baseline e checksums",
);
expect(
  manifest.tooling.project_config_present === false &&
    manifest.tooling.container_runtime_available === false &&
    manifest.target.type === "not_provisioned",
  "bloqueios locais reais estão declarados",
);
expect(
  Object.values(manifest.privacy).every((value) => value === false),
  "manifesto não persiste segredos ou dados reais",
);
expect(
  Object.values(manifest.execution).every((value) => value === false),
  "manifesto não alega execução remota ou release",
);
expect(
  assessor.includes("canonical_baseline_rehearsal_ready") &&
    assessor.includes("business_data_not_copied") &&
    assessor.includes("structuredClone"),
  "avaliador possui caminho positivo e mutante de privacidade",
);
expect(
  packageJson.scripts?.["atlas:baseline-package:assess"]?.includes(
    "run-atlas-canonical-baseline-package-phase-011.mjs",
  ) &&
    packageJson.scripts?.["atlas:baseline-package:check"]?.includes(
      "check-atlas-canonical-baseline-package-phase-011.mjs",
    ),
  "comandos da Fase 11 estão publicados",
);
expect(
  runbook.includes("db pull") &&
    runbook.includes("PostgreSQL 17") &&
    runbook.includes("security_invoker") &&
    runbook.includes("fixtures sintéticas"),
  "runbook cobre captura, alvo e segurança",
);
expect(
  resultDoc.includes("Baseline SQL gerado | Não") &&
    resultDoc.includes("Alteração remota | Não") &&
    resultDoc.includes("ZIP criado | Não"),
  "resultado não alega baseline, mutação ou release",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-canonical-baseline-package-phase-011.mjs",
    "--self-test",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste e mutante de dados reais");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-canonical-baseline-package-phase-011.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status ===
    "canonical_baseline_package_prepared_execution_blocked" &&
    assessed?.specification?.percentage === 100,
  "pacote está completo e execução permanece bloqueada",
);
expect(
  assessed?.readiness?.blockers?.includes(
    "project_config_present",
  ) &&
    assessed?.readiness?.blockers?.includes(
      "isolated_target_available",
    ) &&
    assessed?.readiness?.blockers?.includes(
      "baseline_replay_passed",
    ),
  "gate enumera os bloqueios reais",
);
expect(
  assessed?.authorization?.live_homologation_db_pull === false &&
    assessed?.authorization?.migration_repair === false &&
    assessed?.authorization?.migration_push === false &&
    assessed?.authorization?.build === false &&
    assessed?.authorization?.release_package === false,
  "nenhuma ação perigosa é autorizada",
);
expect(
  assessed?.conclusion?.package_contract_complete === true &&
    assessed?.conclusion?.baseline_generated === false &&
    assessed?.conclusion?.homologation_untouched === true &&
    assessed?.conclusion?.production_ready === false,
  "conclusão separa especificação de execução",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) {
  console.error(
    `ATLAS CANONICAL BASELINE PACKAGE CHECK: FAILED (${failures.length})`,
  );
  process.exit(1);
}

console.log(
  `ATLAS CANONICAL BASELINE PACKAGE CHECK: PASSED (${checks.length}/${checks.length})`,
);

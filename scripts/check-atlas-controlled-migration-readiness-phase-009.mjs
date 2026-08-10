import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-009-controlled-migration-readiness.json"),
);
const packageJson = JSON.parse(read("package.json"));
const assessor = read(
  "scripts/run-atlas-controlled-migration-readiness-phase-009.mjs",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_009_CONTROLLED_MIGRATION_READINESS.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_009_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-009.v1" &&
    config.phase === 9 &&
    config.total_phases === 24,
  "contrato da Fase 9 está versionado",
);
expect(
  config.target_environment === "isolated_clone" &&
    config.execution_policy.remote_execution_enabled === false &&
    config.execution_policy.linked_project_execution_enabled === false,
  "avaliação bloqueia projeto remoto e vinculado",
);
expect(
  config.execution_policy.migration_creation_enabled === false &&
    config.execution_policy.migration_rename_enabled === false,
  "migration nova ou renomeada depende de prova",
);
expect(
  config.execution_policy.requires_sanitized_backup === true &&
    config.execution_policy.requires_remote_history_snapshot === true &&
    config.execution_policy.requires_dynamic_rls_evidence === true,
  "backup, histórico e prova RLS são obrigatórios",
);
expect(
  config.toolchain_contract.supabase_cli_expected_version ===
      "2.109.1" &&
    config.toolchain_contract.telemetry_disabled === true &&
    config.toolchain_contract.isolated_home_required === true,
  "toolchain do Supabase é fixa e isolada",
);
expect(
  Object.keys(
    config.migration_contract.duplicate_versions_detected,
  ).length === 3,
  "três versões duplicadas estão inventariadas",
);
expect(
  config.migration_contract.duplicate_resolution_policy ===
    "compare_remote_history_before_rename_or_repair",
  "duplicidades só podem ser corrigidas após reconciliação remota",
);
expect(
  config.backup_contract.must_exclude_secrets === true &&
    config.backup_contract.must_exclude_unnecessary_personal_data ===
      true &&
    config.backup_contract.restore_target_must_be_loopback === true,
  "contrato do backup é sanitizado e local",
);
expect(
  assessor.includes('"docker", ["info"]') &&
    assessor.includes("SUPABASE_TELEMETRY_DISABLED") &&
    assessor.includes("node_modules/.bin/supabase"),
  "avaliador verifica runtime e CLI sem telemetria",
);
expect(
  assessor.includes("duplicateVersionCount") &&
    assessor.includes("local_migration_versions_unique") &&
    assessor.includes("remote_migration_history_captured"),
  "avaliador impede cadeia local divergente",
);
expect(
  assessor.includes("phase_008_dynamic_rls_passed") &&
    assessor.includes("candidate_and_rollback_paired"),
  "avaliação encadeia a prova da Fase 8 e rollback",
);
expect(
  packageJson.scripts?.["atlas:migration-readiness:assess"]?.includes(
    "run-atlas-controlled-migration-readiness-phase-009.mjs",
  ) &&
    packageJson.scripts?.["atlas:migration-readiness:check"]?.includes(
      "check-atlas-controlled-migration-readiness-phase-009.mjs",
    ),
  "comandos de avaliação e gate estão publicados",
);
expect(
  runbook.includes("migration list") &&
    runbook.includes("clone sanitizado") &&
    runbook.includes("Docker") &&
    runbook.includes("Não renomear"),
  "runbook explica a sequência segura",
);
expect(
  resultDoc.includes("Migration aplicada | Não") &&
    resultDoc.includes("Build executado | Não") &&
    resultDoc.includes("ZIP criado | Não") &&
    resultDoc.includes("3 versões duplicadas"),
  "resultado não alega execução nem release",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-controlled-migration-readiness-phase-009.mjs",
    "--self-test",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste do avaliador");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-controlled-migration-readiness-phase-009.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status === "controlled_migration_rehearsal_blocked",
  "estado real permanece bloqueado sem ambiente isolado",
);
expect(
  assessed?.inventory?.migrations?.duplicateVersionCount === 3,
  "avaliação confirma as três colisões reais",
);
expect(
  assessed?.controls?.values?.supabase_config_present === true &&
    Object.entries(assessed?.controls?.values ?? {}).every(
      ([control, passed]) =>
        assessed?.controls?.blockers?.includes(control) ===
        (passed === false),
    ) &&
    assessed?.controls?.blockers?.includes(
      "docker_compatible_runtime_available",
    ) &&
    assessed?.controls?.blockers?.includes(
      "sanitized_backup_available",
    ) &&
    assessed?.controls?.blockers?.includes(
      "remote_migration_history_captured",
    ) &&
    assessed?.controls?.blockers?.includes(
      "local_migration_versions_unique",
    ),
  "bloqueios materiais são fail-closed",
);
expect(
  assessed?.execution?.remote_write_executed === false &&
    assessed?.execution?.migration_created === false &&
    assessed?.execution?.migration_renamed === false &&
    assessed?.execution?.migration_applied === false &&
    assessed?.execution?.build_executed === false &&
    assessed?.execution?.package_created === false,
  "avaliação permanece local e sem release",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) {
  console.error(
    `ATLAS CONTROLLED MIGRATION READINESS CHECK: FAILED (${failures.length})`,
  );
  process.exit(1);
}

console.log(
  `ATLAS CONTROLLED MIGRATION READINESS CHECK: PASSED (${checks.length}/${checks.length})`,
);

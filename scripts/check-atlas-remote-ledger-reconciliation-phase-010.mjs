import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-010-remote-ledger-reconciliation.json"),
);
const evidence = JSON.parse(
  read(config.remote_ledger_contract.evidence_path),
);
const packageJson = JSON.parse(read("package.json"));
const assessor = read(
  "scripts/run-atlas-remote-ledger-reconciliation-phase-010.mjs",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_010_REMOTE_LEDGER_RECONCILIATION.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_010_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-010.v1" &&
    config.phase === 10 &&
    config.total_phases === 24,
  "contrato da Fase 10 está versionado",
);
expect(
  config.execution_policy.remote_metadata_read_enabled === true &&
    config.execution_policy.remote_ddl_enabled === false &&
    config.execution_policy.remote_dml_enabled === false,
  "somente metadados remotos são permitidos",
);
expect(
  config.execution_policy.migration_repair_enabled === false &&
    config.execution_policy.migration_push_enabled === false &&
    config.execution_policy.migration_rename_enabled === false,
  "repair, push e rename permanecem bloqueados",
);
expect(
  evidence.project_alias === "atlas-v3-homologacao" &&
    evidence.project_health === "ACTIVE_HEALTHY" &&
    evidence.postgres_major === 17,
  "snapshot identifica o ambiente saudável sem expor o ref",
);
expect(
  evidence.remote_ledger.migration_count === 179 &&
    evidence.remote_ledger.unique_remote_versions === 179 &&
    evidence.remote_ledger.names_with_embedded_original_version ===
      141,
  "contagens do ledger remoto estão registradas",
);
expect(
  evidence.local_ledger.migration_file_count === 124 &&
    evidence.local_ledger.duplicate_version_count === 3 &&
    evidence.local_ledger.direct_cli_version_parity === false,
  "divergência entre ledger remoto e cadeia local é explícita",
);
expect(
  evidence.confirmed_collision_mappings.length === 6,
  "seis aplicações remotas reconciliam as três colisões locais",
);
expect(
  config.collision_reconciliation.every(
    (item) =>
      item.rename_authorized === false &&
      item.canonical_intent_for_second.endsWith("01"),
  ),
  "intenção canônica é conhecida sem autorizar renomeio",
);
expect(
  config.baseline_strategy.required === true &&
    config.baseline_strategy.archive_existing_migrations === true &&
    config.baseline_strategy.preserve_remote_history === true,
  "baseline novo preserva histórico existente",
);
expect(
  config.baseline_strategy.requires_sanitized_clone === true &&
    config.baseline_strategy.requires_dynamic_rls_rehearsal === true &&
    config.baseline_strategy.requires_human_approval === true,
  "baseline depende de clone, RLS e aprovação",
);
expect(
  evidence.additional_schema_health_query.executed === false &&
    evidence.additional_schema_health_query.database_reached === false,
  "consulta adicional bloqueada não é alegada como evidência",
);
expect(
  Object.values(evidence.sanitization).every((value) => value === false),
  "snapshot não persiste segredos, refs, SQL bruto ou dados pessoais",
);
expect(
  assessor.includes("direct_cli_push_authorized: false") &&
    assessor.includes("remote_history_repair_authorized: false") &&
    assessor.includes("isolated_canonical_baseline_required: true"),
  "avaliador fecha ações incompatíveis com o ledger",
);
expect(
  assessor.includes("structuredClone") &&
    assessor.includes("remote_versions_unique"),
  "autoteste rejeita mutante com versão remota duplicada",
);
expect(
  packageJson.scripts?.["atlas:remote-ledger:assess"]?.includes(
    "run-atlas-remote-ledger-reconciliation-phase-010.mjs",
  ) &&
    packageJson.scripts?.["atlas:remote-ledger:check"]?.includes(
      "check-atlas-remote-ledger-reconciliation-phase-010.mjs",
    ),
  "comandos da Fase 10 estão publicados",
);
expect(
  runbook.includes("179") &&
    runbook.includes("124") &&
    runbook.includes("migration repair") &&
    runbook.includes("baseline canônico"),
  "runbook explica a divergência e a decisão segura",
);
expect(
  runbook.includes("Supabase CLI") &&
    runbook.includes("timestamps"),
  "runbook registra a semântica de versionamento",
);
expect(
  resultDoc.includes("Alteração remota | Não") &&
    resultDoc.includes("Build executado | Não") &&
    resultDoc.includes("ZIP criado | Não"),
  "resultado não alega mutações nem release",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-remote-ledger-reconciliation-phase-010.mjs",
    "--self-test",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste e teste mutante");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-remote-ledger-reconciliation-phase-010.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status ===
    "remote_ledger_reconciled_baseline_required" &&
    assessed?.score?.percentage === 100,
  "ledger remoto reconciliado com gate completo",
);
expect(
  assessed?.ledger?.localMigrationFileCount ===
      config.local_ledger_contract.expected_file_count &&
    assessed?.ledger?.localDuplicateVersionCount === 3 &&
    assessed?.ledger?.directCliVersionParity === false,
  "inventário local real permanece fail-closed",
);
expect(
  assessed?.conclusion?.direct_cli_push_authorized === false &&
    assessed?.conclusion?.remote_history_repair_authorized === false &&
    assessed?.conclusion?.isolated_canonical_baseline_required ===
      true &&
    assessed?.conclusion?.production_ready === false,
  "conclusão autoriza somente o desenho do baseline isolado",
);
expect(
  assessed?.execution?.remote_write_executed === false &&
    assessed?.execution?.migration_repair_executed === false &&
    assessed?.execution?.migration_push_executed === false &&
    assessed?.execution?.migration_renamed === false &&
    assessed?.execution?.build_executed === false &&
    assessed?.execution?.package_created === false,
  "execução permanece sem escrita, build ou pacote",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) {
  console.error(
    `ATLAS REMOTE LEDGER RECONCILIATION CHECK: FAILED (${failures.length})`,
  );
  process.exit(1);
}

console.log(
  `ATLAS REMOTE LEDGER RECONCILIATION CHECK: PASSED (${checks.length}/${checks.length})`,
);

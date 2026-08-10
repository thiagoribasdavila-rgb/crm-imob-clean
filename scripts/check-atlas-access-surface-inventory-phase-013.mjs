import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));
const config = readJson(
  "config/atlas-10x-phase-013-access-surface-inventory.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-013/access-surface-inventory-evidence.json",
);
const packageJson = readJson("package.json");
const assessor = read(
  "scripts/run-atlas-access-surface-inventory-phase-013.mjs",
);
const sql = read("scripts/sql/phase-013-access-surface-readonly.sql");
const runbook = read(
  "docs/ATLAS_10X_PHASE_013_ACCESS_SURFACE_INVENTORY.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_013_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-013.v1" &&
    config.phase === 13 &&
    config.total_phases === 24,
  "contrato da Fase 13 está versionado",
);
expect(
  config.input_contract.allowed_target_kind ===
    "isolated_loopback_pg17" &&
    config.input_contract.expected_postgres_major === 17 &&
    config.execution_policy.allows_remote_metadata_read === false,
  "inventário só aceita clone PostgreSQL 17 em loopback",
);
expect(
  config.inventory_contract.table_rows_allowed === false &&
    config.inventory_contract.function_bodies_allowed === false &&
    config.inventory_contract.raw_policy_expressions_allowed === false &&
    config.inventory_contract.database_url_allowed === false,
  "contrato proíbe dados, corpos, predicados e URL",
);
expect(
  config.security_contract.required_invariants.includes(
    "rls_and_grants_validated_separately",
  ) &&
    config.security_contract.required_invariants.includes(
      "update_requires_select_using_and_with_check",
    ) &&
    config.security_contract.required_invariants.includes(
      "views_use_security_invoker_or_are_not_api_exposed",
    ),
  "invariantes oficiais de acesso estão explícitas",
);
expect(
  config.required_runtime_gates.length === 32,
  "32 gates fail-closed cobrem captura e segurança",
);
expect(
  evidence.status === "inventory_not_captured" &&
    evidence.inventory.captured === false &&
    evidence.safety.live_homologation_touched === false,
  "evidência inicial não alega captura",
);
expect(
  evidence.safety.business_data_read === false &&
    evidence.safety.auth_user_data_read === false &&
    evidence.safety.function_bodies_persisted === false &&
    evidence.safety.policy_expressions_persisted === false,
  "evidência preserva dados e definições sensíveis",
);
expect(
  /^\s*begin;/im.test(sql) &&
    /set transaction read only;/i.test(sql) &&
    /^\s*rollback;/im.test(sql),
  "consulta de catálogo usa transação somente leitura e rollback",
);
expect(
  sql.includes("pg_class") &&
    sql.includes("pg_policy") &&
    sql.includes("pg_proc") &&
    sql.includes("pg_default_acl") &&
    sql.includes("aclexplode"),
  "consulta inventaria objetos, políticas, funções e ACL",
);
expect(
  !/\bfrom\s+(?:public|auth|storage)\./i.test(sql) &&
    !/^\s*insert\s+into\b/im.test(sql) &&
    !/^\s*update\s+(?:public|auth|storage)\./im.test(sql) &&
    !/^\s*delete\s+from\b/im.test(sql),
  "consulta não lê tabelas de negócio nem contém DML",
);
expect(
  !sql.includes("pg_get_functiondef") &&
    !sql.includes("'qual'") &&
    !sql.includes("'with_check_expression'"),
  "snapshot não persiste corpos ou predicados brutos",
);
expect(
  assessor.includes("historical_migrations_only_not_effective_database_state") &&
    assessor.includes("canonical_snapshot_required_for_security_approval"),
  "histórico local não é tratado como estado efetivo",
);
expect(
  assessor.includes("exposed_tables_have_rls") &&
    assessor.includes("security_definer_execute_is_minimal") &&
    assessor.includes("update_policies_are_complete") &&
    assessor.includes("default_privileges_are_safe"),
  "avaliador cobre RLS, definer, UPDATE e privilégios padrão",
);
expect(
  packageJson.scripts?.["atlas:access-surface:assess"]?.includes(
    "run-atlas-access-surface-inventory-phase-013.mjs",
  ) &&
    packageJson.scripts?.["atlas:access-surface:check"]?.includes(
      "check-atlas-access-surface-inventory-phase-013.mjs",
    ),
  "comandos da Fase 13 estão publicados",
);
expect(
  runbook.includes("Fonte canônica") &&
    runbook.includes("histórico local") &&
    runbook.includes("somente leitura") &&
    runbook.includes("Não executar"),
  "runbook distingue referência de evidência",
);
expect(
  resultDoc.includes("Inventário canônico capturado | Não") &&
    resultDoc.includes("Homologação alterada | Não") &&
    resultDoc.includes("Build executado | Não") &&
    resultDoc.includes("ZIP criado | Não"),
  "resultado não alega execução ou release",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-access-surface-inventory-phase-013.mjs",
    "--self-test",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
const selfTestOutput =
  selfTest.status === 0 ? JSON.parse(selfTest.stdout) : null;
expect(
  selfTest.status === 0 &&
    selfTestOutput?.safe_baseline === "accepted" &&
    selfTestOutput?.mutants_rejected === 9,
  "autoteste aceita baseline seguro e rejeita 9 mutantes",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-access-surface-inventory-phase-013.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status ===
    "access_surface_contract_ready_capture_blocked" &&
    assessed?.conclusion?.security_approved === false,
  "aprovação permanece bloqueada sem snapshot canônico",
);
expect(
  assessed?.specification?.blockers?.includes(
    "phase_012_capture_accepted",
  ) &&
    assessed?.specification?.blockers?.includes(
      "catalog_snapshot_exists",
    ) &&
    assessed?.specification?.blockers?.includes(
      "exposed_tables_have_rls",
    ),
  "gate enumera captura e segurança ainda não comprovadas",
);
expect(
  assessed?.local_reference?.files === 126 &&
    assessed?.local_reference?.security_definer_declarations > 0 &&
    assessed?.local_reference?.authority ===
      "historical_migrations_only_not_effective_database_state",
  "referência local é medida e rotulada corretamente",
);
expect(
  assessed?.safety?.remote_read_executed === false &&
    assessed?.safety?.remote_write_executed === false &&
    assessed?.safety?.live_homologation_touched === false &&
    assessed?.safety?.build_executed === false &&
    assessed?.safety?.package_created === false,
  "fase não toca ambiente externo nem gera release",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  console.error(
    `ATLAS ACCESS SURFACE INVENTORY CHECK: FAILED (${failures.length})`,
  );
  process.exit(1);
}

console.log(
  `ATLAS ACCESS SURFACE INVENTORY CHECK: PASSED (${checks.length}/${checks.length})`,
);

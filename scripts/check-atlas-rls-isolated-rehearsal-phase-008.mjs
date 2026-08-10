import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-008-isolated-rls-rehearsal.json"),
);
const packageJson = JSON.parse(read("package.json"));
const dynamicTest = read(
  "supabase/tests/database/phase_008_dynamic_rls_isolation.test.sql",
);
const snapshotQuery = read(
  "supabase/tests/fixtures/phase_008_acl_snapshot.sql",
);
const executor = read(
  "scripts/execute-atlas-rls-isolated-rehearsal-phase-008.mjs",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_008_DYNAMIC_RLS_REHEARSAL.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_008_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-008.v1" &&
    config.phase === 8 &&
    config.total_phases === 24,
  "contrato da Fase 8 está versionado",
);
expect(
  config.target_environment === "isolated_clone" &&
    config.execution_policy.remote_execution_enabled === false &&
    config.execution_policy.linked_project_execution_enabled === false,
  "ensaio aceita apenas clone isolado e bloqueia projeto vinculado",
);
expect(
  config.execution_policy.requires_loopback_database === true &&
    config.execution_policy.requires_two_organizations === true &&
    config.execution_policy.requires_human_approval === true,
  "loopback, dois tenants e aprovação são obrigatórios",
);
expect(
  config.reference_fixture_contract.fixture_source ===
      "sanitized_restored_clone" &&
    config.reference_fixture_contract.fixture_values_persisted_in_evidence ===
      false &&
    config.execution_policy.allows_fixture_creation === false,
  "fixtures vêm do clone sanitizado e não são persistidas",
);
expect(
  config.personas.length === 5 &&
    config.dynamic_scenarios.length === 10,
  "matriz dinâmica cobre cinco personas e dez cenários",
);
expect(
  dynamicTest.includes("phase_008_isolated_clone_required") &&
    dynamicTest.includes(
      "phase_008_organization_a_fixture_contract_unsatisfied",
    ) &&
    dynamicTest.includes(
      "phase_008_organization_b_fixture_contract_unsatisfied",
    ),
  "pgTAP falha fechado sem clone ou fixtures mínimas",
);
expect(
  [
    "app.atlas_phase_008_broker_a",
    "app.atlas_phase_008_manager_a",
    "app.atlas_phase_008_director_a",
    "app.atlas_phase_008_actor_b",
  ].every((marker) => dynamicTest.includes(marker)),
  "pgTAP impersona toda a hierarquia e o segundo tenant",
);
expect(
  dynamicTest.includes("lead_create_forbidden") &&
    dynamicTest.includes("project-write-not-authorized") &&
    dynamicTest.includes(
      "public.bulk_transfer_leads(uuid,uuid,uuid[],uuid,text)",
    ) &&
    dynamicTest.includes(
      "public.distribute_project_leads(uuid,uuid,uuid,integer)",
    ),
  "RPCs críticas têm provas negativas",
);
expect(
  dynamicTest.trimStart().startsWith("begin;") &&
    dynamicTest.trimEnd().endsWith("rollback;") &&
    !/\bcommit\s*;/i.test(dynamicTest),
  "ensaio é transacional e sempre reverte",
);
expect(
  !/\b(insert\s+into|delete\s+from|truncate\s+table)\b/i.test(
    dynamicTest,
  ),
  "ensaio não cria nem remove fixtures",
);
expect(
  snapshotQuery.includes("atlas_phase_008_acl_snapshot_v1") &&
    snapshotQuery.includes(
      "information_schema.role_table_grants",
    ) &&
    snapshotQuery.includes("pg_policies") &&
    snapshotQuery.includes(
      "information_schema.role_routine_grants",
    ) &&
    !/\b(insert|update|delete|drop|truncate|alter)\b/i.test(
      snapshotQuery,
    ),
  "snapshot de ACL é completo e somente leitura",
);
expect(
  executor.includes("non_loopback_database_forbidden") &&
    executor.includes("explicit_execution_approval_required") &&
    executor.includes('"--db-url"') &&
    !executor.includes('"--linked"'),
  "executor bloqueia remoto e nunca usa --linked",
);
expect(
  executor.includes("containsSecrets: false") &&
    executor.includes("containsPersonalData: false") &&
    executor.includes("containsFixtureIdentifiers: false") &&
    executor.includes("rawCliOutputPersisted: false"),
  "evidência do executor é sanitizada",
);
expect(
  packageJson.scripts?.["atlas:rls-dynamic:assess"]?.includes(
    "run-atlas-rls-isolated-rehearsal-phase-008.mjs",
  ) &&
    packageJson.scripts?.["atlas:rls-dynamic:execute"]?.includes(
      "execute-atlas-rls-isolated-rehearsal-phase-008.mjs",
    ) &&
    packageJson.scripts?.["atlas:rls-dynamic:check"]?.includes(
      "check-atlas-rls-isolated-rehearsal-phase-008.mjs",
    ),
  "comandos de avaliação, execução e gate estão publicados",
);
expect(
  runbook.includes("GRANT") &&
    runbook.includes("RLS") &&
    runbook.includes("duas organizações") &&
    runbook.includes("Supabase") &&
    runbook.includes("Fase 9"),
  "runbook explica camadas de acesso e sequência segura",
);
expect(
  resultDoc.includes("Alteração remota | Não") &&
    resultDoc.includes("Build executado | Não") &&
    resultDoc.includes("ZIP criado | Não") &&
    resultDoc.includes("Ensaio dinâmico executado | Não"),
  "resultado não alega execução ou release",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-rls-isolated-rehearsal-phase-008.mjs", "--self-test"],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste do avaliador");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-rls-isolated-rehearsal-phase-008.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status === "isolated_rls_rehearsal_pending",
  "estado real aguarda prova dinâmica",
);
expect(
  assessed?.coverage?.personas === 5 &&
    assessed?.coverage?.dynamic_scenarios === 10 &&
    assessed?.coverage?.organizations_required === 2,
  "avaliação reporta a cobertura correta",
);
expect(
  assessed?.execution?.remote_write_executed === false &&
    assessed?.execution?.linked_project_used === false &&
    assessed?.execution?.build_executed === false &&
    assessed?.execution?.package_created === false,
  "avaliação permanece local e sem release",
);
expect(
  assessed?.controls?.blockers?.includes(
    "reference_fixture_contract_satisfied",
  ) &&
    assessed?.controls?.blockers?.includes(
      "cross_tenant_denial_passed",
    ) &&
    assessed?.controls?.blockers?.includes(
      "rollback_rehearsal_passed",
    ),
  "ausência de evidência mantém gates fechados",
);

const rejectedRemote = spawnSync(
  process.execPath,
  ["scripts/execute-atlas-rls-isolated-rehearsal-phase-008.mjs"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ATLAS_RLS_REHEARSAL_ENVIRONMENT: "isolated_clone",
      ATLAS_RLS_REHEARSAL_APPROVED: "true",
      ATLAS_RLS_REHEARSAL_DATABASE_URL:
        "postgresql://fixture:fixture@example.invalid:5432/postgres",
      ATLAS_RLS_REHEARSAL_ACL_SNAPSHOT_PATH:
        "artifacts/runtime/nonexistent-phase-008-snapshot.json",
    },
  },
);
const rejection = JSON.parse(rejectedRemote.stderr);
expect(
  rejectedRemote.status === 1 &&
    rejection.errorCode === "non_loopback_database_forbidden" &&
    rejection.remoteWriteExecuted === false,
  "mutante com host remoto é rejeitado antes de qualquer execução",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) {
  console.error(
    `ATLAS ISOLATED RLS REHEARSAL CHECK: FAILED (${failures.length})`,
  );
  process.exit(1);
}

console.log(
  `ATLAS ISOLATED RLS REHEARSAL CHECK: PASSED (${checks.length}/${checks.length})`,
);

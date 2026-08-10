import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-007-access-matrix.json"),
);
const packageJson = JSON.parse(read("package.json"));
const candidate = read(
  "supabase/migration-drafts/20260723070000_phase_007_rls_access_hardening_candidate.sql",
);
const rollback = read(
  "supabase/migration-drafts/20260723070000_phase_007_rls_access_hardening_candidate.rollback.sql",
);
const tests = read(
  "supabase/tests/database/phase_007_rls_access_matrix.test.sql",
);
const developerPage = read("app/(crm)/atlas-v3/developer/page.tsx");
const reactivationRoute = read("app/api/v1/crm/reactivation/route.ts");
const runbook = read("docs/ATLAS_10X_PHASE_007_RLS_ACCESS_MATRIX.md");
const resultDoc = read("docs/ATLAS_10X_PHASE_007_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-007.v1" &&
    config.phase === 7 &&
    config.total_phases === 24,
  "contrato da fase 7 está versionado",
);
expect(
  config.target_environment === "atlas-v3-homologacao" &&
    config.execution_policy.remote_execution_enabled === false,
  "alvo é homologação e execução remota está bloqueada",
);
expect(
  config.execution_policy.requires_isolated_clone === true &&
    config.execution_policy.requires_acl_snapshot === true &&
    config.execution_policy.requires_human_approval === true,
  "clone, ACL e aprovação humana são gates obrigatórios",
);
expect(
  config.table_contracts.length === 12 &&
    config.table_contracts.every(
      (item) =>
        item.direct_roles.length === 1 &&
        item.direct_roles[0] === "service_role",
    ),
  "12 tabelas estão classificadas como acesso interno",
);
expect(
  config.function_contracts.length === 10 &&
    config.function_contracts.filter(
      (item) => item.classification === "trigger_only",
    ).length === 3,
  "10 funções e 3 gatilhos têm contrato explícito",
);
expect(
  config.roles.length === 7 &&
    config.roles.some(
      (item) =>
        item.role === "cross_tenant_actor" &&
        item.expected_access === "deny",
    ),
  "matriz cobre hierarquia e negação cross-tenant",
);
expect(
  !developerPage.includes('.from("projects")') &&
    !reactivationRoute.includes('.from("projects")'),
  "consumidores residuais de projects foram removidos",
);
expect(
  developerPage.includes('.from("developments")') &&
    reactivationRoute.includes('.from("developments")'),
  "consumidores usam developments canônico",
);
expect(
  candidate.includes("phase_007_isolated_clone_required") &&
    candidate.includes("phase_007_schema_drift") &&
    candidate.trimEnd().endsWith("rollback;") &&
    !/\bcommit\s*;/i.test(candidate),
  "candidato exige clone, detecta drift e sempre reverte",
);
expect(
  config.table_contracts.every(({ table }) =>
    candidate.includes(
      `create policy ${table}_phase007_no_direct_api`,
    ),
  ),
  "12 policies explícitas de negação estão presentes",
);
expect(
  config.table_contracts.every(
    ({ table }) =>
      candidate.includes(
        `revoke all on table public.${table} from public, anon, authenticated`,
      ) &&
      candidate.includes(
        `grant all on table public.${table} to service_role`,
      ),
  ),
  "grants server-only estão explícitos",
);
expect(
  !/\b(drop\s+table|truncate\s+table|delete\s+from)\b/i.test(candidate),
  "candidato não contém DDL destrutivo",
);
expect(
  rollback.includes("phase_007_acl_snapshot_required") &&
    rollback.includes(
      "phase_007_generate_rollback_from_approved_acl_snapshot",
    ),
  "rollback falha fechado sem snapshot de ACL",
);
expect(
  tests.includes("phase_007_isolated_clone_required") &&
    tests.includes("select no_plan();") &&
    tests.includes("select * from finish();") &&
    tests.trimEnd().endsWith("rollback;"),
  "contrato pgTAP é isolado e reversível",
);
expect(
  packageJson.scripts?.["atlas:rls-matrix:assess"]?.includes(
    "run-atlas-rls-access-matrix-phase-007.mjs",
  ) &&
    packageJson.scripts?.["atlas:rls-matrix:check"]?.includes(
      "check-atlas-rls-access-matrix-phase-007.mjs",
    ),
  "gates estão expostos no package",
);
expect(
  runbook.includes("Grants") &&
    runbook.includes("RLS") &&
    runbook.includes("Fase 8") &&
    runbook.includes("developments"),
  "runbook explica contrato, legado e próxima prova",
);
expect(
  resultDoc.includes("Alteração remota | Não") &&
    resultDoc.includes("Build executado | Não") &&
    resultDoc.includes("ZIP criado | Não") &&
    resultDoc.includes("Produção liberada | Não"),
  "resultado mantém release bloqueado",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-rls-access-matrix-phase-007.mjs", "--self-test"],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste do avaliador");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-rls-access-matrix-phase-007.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status === "rls_access_matrix_rehearsal_pending",
  "estado real aguarda ensaio isolado",
);
expect(
  assessed?.classification?.tables === 12 &&
    assessed?.classification?.functions === 10 &&
    assessed?.classification?.browser_legacy_project_consumers === 0,
  "avaliação comprova escopo e limpeza do legado",
);
expect(
  assessed?.execution?.remote_write_executed === false &&
    assessed?.execution?.migration_applied === false &&
    assessed?.execution?.build_executed === false &&
    assessed?.execution?.package_created === false,
  "avaliação permanece local e sem release",
);
expect(
  assessed?.controls?.blockers?.includes(
    "isolated_clone_receipt_approved",
  ) &&
    assessed?.controls?.blockers?.includes(
      "cross_tenant_denial_passed",
    ) &&
    assessed?.controls?.blockers?.includes(
      "rollback_rehearsal_passed",
    ),
  "provas dinâmicas ausentes bloqueiam corretamente",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) {
  console.error(`ATLAS RLS ACCESS MATRIX CHECK: FAILED (${failures.length})`);
  process.exit(1);
}

console.log(
  `ATLAS RLS ACCESS MATRIX CHECK: PASSED (${checks.length}/${checks.length})`,
);

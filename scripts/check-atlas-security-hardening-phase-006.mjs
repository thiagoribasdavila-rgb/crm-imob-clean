import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-006-security-hardening.json"),
);
const snapshot = JSON.parse(
  read("config/atlas-10x-phase-006-remote-security-snapshot.json"),
);
const packageJson = JSON.parse(read("package.json"));
const runner = read("scripts/run-atlas-security-hardening-phase-006.mjs");
const proposal = read(
  "scripts/sql/phase-006-rls-grants-functions-hardening-proposal.sql",
);
const runbook = read("docs/ATLAS_10X_PHASE_006_SECURITY_HARDENING.md");
const result = read("docs/ATLAS_10X_PHASE_006_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-006.v1",
  "contrato de hardening versionado",
);
expect(
  config.target_environment === "atlas-v3-homologacao",
  "alvo permanece homologação V3",
);
expect(
  config.execution_policy.default_mode === "assessment_only" &&
    config.execution_policy.remote_execution_enabled === false,
  "execução remota está bloqueada",
);
expect(
  config.execution_policy.allows_destructive_ddl === false &&
    config.execution_policy.allows_policy_drop_without_replacement === false,
  "DDL destrutivo e policy sem substituição são proibidos",
);
expect(
  config.no_policy_table_review.length === 12 &&
    config.no_policy_table_review.every(
      (item) => item.decision === "unresolved",
    ),
  "12 tabelas permanecem fail-closed até classificação",
);
expect(
  config.privileged_function_review.length === 10 &&
    config.privileged_function_review.filter(
      (item) => item.class === "trigger_only",
    ).length === 3,
  "10 funções privilegiadas e 3 gatilhos estão classificados",
);
expect(
  snapshot.advisor_findings.rls_enabled_without_policy.count === 12 &&
    snapshot.advisor_findings.anon_security_definer_executable.count === 3 &&
    snapshot.advisor_findings.authenticated_security_definer_executable.count ===
      10,
  "snapshot preserva achados oficiais",
);
expect(
  snapshot.contains_personal_data === false &&
    snapshot.contains_secret_values === false,
  "snapshot está sanitizado",
);
expect(
  snapshot.execution.remote_write_executed === false &&
    snapshot.execution.grant_changed === false &&
    snapshot.execution.policy_changed === false,
  "nenhuma alteração remota foi executada",
);
expect(
  packageJson.scripts?.["atlas:security-hardening:assess"]?.includes(
    "run-atlas-security-hardening-phase-006.mjs",
  ),
  "avaliador está exposto no package",
);
expect(
  packageJson.scripts?.["atlas:security-hardening:check"]?.includes(
    "check-atlas-security-hardening-phase-006.mjs",
  ),
  "verificador está exposto no package",
);
expect(
  proposal.trimStart().includes("begin;") &&
    proposal.trimEnd().endsWith("rollback;") &&
    !/\bcommit\s*;/i.test(proposal),
  "proposta é transacional e sempre reversível",
);
expect(
  proposal.includes("phase_006_blocked") &&
    proposal.includes("where decision = 'unresolved'"),
  "proposta falha fechada sem decisões",
);
expect(
  [
    "apply_opportunity_commission_sla",
    "refresh_commission_status",
    "scaffold_project_intelligence",
  ].every(
    (name) =>
      proposal.includes(`revoke execute on function public.${name}()`) &&
      proposal.includes(
        `alter function public.${name}() set search_path = ''`,
      ),
  ),
  "gatilhos antigos recebem hardening proposto",
);
expect(
  !/\b(drop\s+table|truncate\s+table|delete\s+from)\b/i.test(proposal),
  "proposta não contém operação destrutiva",
);
expect(
  ![
    "apply_migration(",
    "execute_sql(",
    "supabase db push",
    "auth.admin.createUser(",
  ].some((operation) => runner.includes(operation)),
  "avaliador não contém operação remota",
);
expect(
  runbook.includes("Grants e RLS são camadas diferentes") &&
    runbook.includes("não prova exposição direta") &&
    runbook.includes("fase 7"),
  "runbook explica o risco sem alegações indevidas",
);
expect(
  result.includes("Alteração remota | Não") &&
    result.includes("Build executado | Não") &&
    result.includes("ZIP criado | Não") &&
    result.includes("Produção liberada | Não"),
  "resultado mantém gates de release fechados",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-security-hardening-phase-006.mjs", "--self-test"],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste do avaliador");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-security-hardening-phase-006.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status === "security_hardening_blocked",
  "estado real permanece bloqueado",
);
expect(
  assessed?.execution?.remote_write_executed === false &&
    assessed?.execution?.migration_applied === false &&
    assessed?.execution?.build_executed === false &&
    assessed?.execution?.package_created === false,
  "avaliação real permanece somente leitura",
);
expect(
  assessed?.controls?.blockers?.includes(
    "rls_enabled_without_policy_zero",
  ) &&
    assessed?.controls?.blockers?.includes(
      "anon_security_definer_executable_zero",
    ),
  "achados do advisor bloqueiam corretamente",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) {
  console.error(`ATLAS SECURITY HARDENING CHECK: FAILED (${failures.length})`);
  process.exit(1);
}

console.log(`ATLAS SECURITY HARDENING CHECK: PASSED (${checks.length}/${checks.length})`);

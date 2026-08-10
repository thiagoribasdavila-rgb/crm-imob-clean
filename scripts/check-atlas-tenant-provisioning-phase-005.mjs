import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-005-tenant-provisioning.json"),
);
const evidence = JSON.parse(
  read("config/atlas-10x-phase-005-provisioning-evidence.json"),
);
const packageJson = JSON.parse(read("package.json"));
const runner = read("scripts/run-atlas-tenant-provisioning-phase-005.mjs");
const runbook = read("docs/ATLAS_10X_PHASE_005_TENANT_PROVISIONING.md");
const result = read("docs/ATLAS_10X_PHASE_005_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-005.v1",
  "contrato de provisionamento versionado",
);
expect(
  config.target_environment === "atlas-v3-homologacao",
  "alvo permanece homologação V3",
);
expect(
  config.execution_policy.default_mode === "plan_only" &&
    config.execution_policy.remote_execution_enabled === false,
  "execução remota está bloqueada por padrão",
);
expect(
  config.execution_policy.allows_user_deletion === false &&
    config.execution_policy.allows_history_deletion === false,
  "exclusões destrutivas são proibidas",
);
expect(
  config.secret_policy.trusted_server_only === true &&
    config.secret_policy.never_print_values === true &&
    config.secret_policy.never_store_passwords === true,
  "segredos permanecem somente no servidor",
);
expect(
  config.canonical_identity_slots
    .map(({ commercial_role: role }) => role)
    .join(",") === "director,director,superintendent,manager,broker",
  "cadeia comercial completa está no pacote",
);
expect(
  config.canonical_identity_slots.every(
    (slot) => slot.email_env && !slot.email && !slot.name,
  ),
  "pacote não contém nomes nem e-mails pessoais",
);
expect(
  config.ordered_steps.indexOf("create_or_resolve_single_homologation_organization") <
    config.ordered_steps.indexOf("invite_or_resolve_auth_users_server_side") &&
    config.ordered_steps.indexOf("invite_or_resolve_auth_users_server_side") <
      config.ordered_steps.indexOf("upsert_profiles_with_auth_primary_keys"),
  "ordem organização, Auth e profiles é determinística",
);
expect(
  config.rollback_contract.revoke_sessions_first === true &&
    config.rollback_contract.preserve_leads_tasks_events_and_audit_history ===
      true &&
    config.rollback_contract.delete_auth_users === false,
  "rollback preserva identidade e histórico",
);
expect(
  evidence.contains_personal_data === false &&
    evidence.contains_secret_values === false,
  "evidência está sanitizada",
);
expect(
  evidence.execution.remote_write_executed === false &&
    evidence.execution.organization_created === false &&
    evidence.execution.auth_users_created === false,
  "nenhum provisionamento foi executado",
);
expect(
  packageJson.scripts?.["atlas:tenant-provisioning:plan"]?.includes(
    "run-atlas-tenant-provisioning-phase-005.mjs",
  ),
  "planejador está exposto no package",
);
expect(
  packageJson.scripts?.["atlas:tenant-provisioning:check"]?.includes(
    "check-atlas-tenant-provisioning-phase-005.mjs",
  ),
  "verificador está exposto no package",
);
expect(
  runner.includes('"tenant_provisioning_blocked"') &&
    runner.includes("human_execution_approval") &&
    runner.includes("phase_003_schema_parity_ready"),
  "gate falha fechado",
);
expect(
  ![
    "auth.admin.createUser(",
    "auth.admin.inviteUserByEmail(",
    "apply_migration(",
    "supabase db push",
    '.from("organizations").insert(',
    '.from("profiles").upsert(',
  ].some((operation) => runner.includes(operation)),
  "planejador não contém operação remota",
);
expect(
  runbook.includes("Supabase 2026") &&
    runbook.includes("director → superintendent → manager → broker") &&
    runbook.includes("não cria"),
  "runbook registra atualização técnica e limites",
);
expect(
  result.includes("Tenant criado | Não") &&
    result.includes("Usuários Auth criados | Não") &&
    result.includes("ZIP criado | Não") &&
    result.includes("Produção liberada | Não"),
  "resultado mantém todos os gates fechados",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-tenant-provisioning-phase-005.mjs", "--self-test"],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste do planejador");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-tenant-provisioning-phase-005.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status === "tenant_provisioning_blocked",
  "estado real permanece bloqueado",
);
expect(
  assessed?.execution?.remote_write_executed === false &&
    assessed?.execution?.auth_users_created === false,
  "avaliação real permaneceu somente leitura",
);

for (const [label, passed] of checks)
  console.log(`${passed ? "✓" : "✗"} ${label}`);

if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(
  `\nFase 5/24 aprovada estruturalmente: ${checks.length} controles de provisionamento.`,
);

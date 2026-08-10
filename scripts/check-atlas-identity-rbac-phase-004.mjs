import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-004-identity-rbac.json"),
);
const snapshot = JSON.parse(
  read("config/atlas-10x-phase-004-remote-identity-snapshot.json"),
);
const packageJson = JSON.parse(read("package.json"));
const runner = read("scripts/run-atlas-identity-rbac-phase-004.mjs");
const proposal = read(
  "scripts/sql/phase-004-canonical-rbac-hardening-proposal.sql",
);
const report = read("docs/ATLAS_10X_PHASE_004_IDENTITY_RBAC.md");
const result = read("docs/ATLAS_10X_PHASE_004_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-004.v1",
  "contrato versionado",
);
expect(
  config.target_environment === "atlas-v3-homologacao",
  "homologação V3 permanece o alvo",
);
expect(
  config.remote_write_policy === "read_only_audit",
  "auditoria é somente leitura",
);
expect(
  config.authorization_source.authorization ===
    "public_profiles_server_resolved",
  "profiles resolvido no servidor é fonte de autorização",
);
expect(
  config.authorization_source.forbidden_sources.includes("user_metadata"),
  "metadata editável é proibido para autorização",
);
expect(
  config.commercial_hierarchy.map(({ role }) => role).join(",") ===
    "director,superintendent,manager,broker",
  "hierarquia comercial completa está definida",
);
expect(
  packageJson.scripts?.["atlas:identity-rbac:assess"]?.includes(
    "run-atlas-identity-rbac-phase-004.mjs",
  ),
  "avaliação exposta no package",
);
expect(
  packageJson.scripts?.["atlas:identity-rbac:check"]?.includes(
    "check-atlas-identity-rbac-phase-004.mjs",
  ),
  "verificador exposto no package",
);
expect(
  snapshot.source === "supabase_mcp_read_only" &&
    snapshot.contains_personal_data === false,
  "snapshot remoto sanitizado",
);
expect(
  snapshot.target.auth_users === 0 &&
    snapshot.target.organizations === 0 &&
    snapshot.target.profiles === 0 &&
    snapshot.observed_at === "2026-07-23",
  "snapshot histórico pré-bootstrap é identificado",
);
expect(
  snapshot.target.public_tables === snapshot.target.rls_enabled_tables &&
    snapshot.target.rls_disabled_tables === 0,
  "RLS está habilitado na superfície pública observada",
);
expect(
  snapshot.security_advisors.rls_enabled_without_policy.count === 12,
  "tabelas sem policy são registradas",
);
expect(
  snapshot.security_advisors.anon_security_definer_executable.count === 3,
  "funções privilegiadas expostas a anon são registradas",
);
expect(
  runner.includes('"identity_rbac_blocked"') &&
    runner.includes("no_unbound_tenant_fallback") &&
    runner.includes("remote_evidence_max_age_days") &&
    runner.includes("cross_tenant_denial_verified"),
  "gate falha fechado",
);
expect(
  ![
    "apply_migration(",
    "supabase db push",
    "auth.admin.createUser",
    "auth.admin.inviteUserByEmail",
  ].some((operation) => runner.includes(operation)),
  "avaliador não cria usuários nem escreve remotamente",
);
expect(
  proposal.includes("PROPOSTA NÃO APLICADA") &&
    proposal.includes("update of organization_id, access_role") &&
    proposal.includes("superintendent_requires_director") &&
    proposal.includes("broker_requires_manager"),
  "proposta corrige o trigger e preserva a cadeia completa",
);
expect(
  !proposal.includes("commit;") &&
    proposal.includes("rollback;"),
  "proposta permanece ensaio reversível",
);
expect(
  report.includes("dois modelos") &&
    report.includes("ATLAS_DEFAULT_ORGANIZATION_ID") &&
    report.includes("access_role"),
  "relatório explica as divergências locais",
);
expect(
  result.includes("Produção liberada | Não") &&
    result.includes("ZIP criado | Não") &&
    result.includes("Usuários criados | Não"),
  "resultado preserva gates de identidade e release",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-identity-rbac-phase-004.mjs", "--self-test"],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(selfTest.status === 0, "autoteste do avaliador");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-identity-rbac-phase-004.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status === "identity_rbac_blocked",
  "estado real permanece bloqueado",
);
expect(
  assessed?.release?.remote_write_executed === false &&
    assessed?.release?.auth_users_created === false,
  "execução real permaneceu somente leitura",
);

for (const [label, passed] of checks)
  console.log(`${passed ? "✓" : "✗"} ${label}`);

if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(
  `\nFase 4/24 aprovada estruturalmente: ${checks.length} controles de identidade e RBAC.`,
);

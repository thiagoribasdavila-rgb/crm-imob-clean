import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-003-schema-parity.json"),
);
const snapshot = JSON.parse(
  read("config/atlas-10x-phase-003-remote-schema-snapshot.json"),
);
const packageJson = JSON.parse(read("package.json"));
const runner = read("scripts/run-atlas-schema-parity-phase-003.mjs");
const report = read("docs/ATLAS_10X_PHASE_003_SCHEMA_PARITY.md");
const result = read("docs/ATLAS_10X_PHASE_003_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-003.v1",
  "contrato versionado",
);
expect(
  config.target_environment === "atlas-v3-homologacao",
  "homologação V3 é o alvo inequívoco",
);
expect(
  config.legacy_environment === "atlas-ai-crm-v1",
  "ambiente legado está separado",
);
expect(
  config.remote_write_policy === "read_only_audit",
  "auditoria é somente leitura",
);
expect(
  packageJson.scripts?.["atlas:schema-parity:assess"]?.includes(
    "run-atlas-schema-parity-phase-003.mjs",
  ),
  "avaliação exposta no package",
);
expect(
  packageJson.scripts?.["atlas:schema-parity:check"]?.includes(
    "check-atlas-schema-parity-phase-003.mjs",
  ),
  "verificador exposto no package",
);
expect(
  snapshot.source === "supabase_mcp_read_only" &&
    snapshot.contains_personal_data === false,
  "snapshot remoto sanitizado",
);
expect(
  snapshot.target.tables === snapshot.target.rls_enabled_tables &&
    snapshot.target.rls_disabled_tables === 0,
  "cobertura RLS observada",
);
expect(
  snapshot.target.selected_rows.organizations === 0 &&
    snapshot.target.selected_rows.profiles === 0 &&
    snapshot.observed_at === "2026-07-23",
  "snapshot histórico pré-bootstrap é identificado",
);
expect(
  Object.keys(snapshot.local_comparison.duplicate_local_versions).length > 0,
  "colisões locais são detectadas",
);
expect(
  snapshot.local_comparison.local_logical_missing_remotely.length > 0 &&
    snapshot.local_comparison.remote_logical_not_in_local.length > 0,
  "drift bidirecional é explícito",
);
expect(
  runner.includes('"schema_parity_blocked"') &&
    runner.includes("local_versions_unique") &&
    runner.includes("remote_evidence_max_age_days") &&
    runner.includes("migration_history_logically_equal"),
  "gate falha fechado",
);
expect(
  ![
    "supabase db push",
    "supabase migration repair",
    "supabase db reset",
    "apply_migration(",
  ].some((operation) => runner.includes(operation)),
  "avaliador não contém escrita remota",
);
expect(
  report.includes("snapshot histórico") &&
    report.includes("177 tabelas") &&
    report.includes("17151 leads") &&
    report.includes("não é paridade"),
  "relatório distingue estrutura e operação",
);
expect(
  result.includes("Produção liberada | Não") &&
    result.includes("ZIP criado | Não"),
  "resultado preserva o gate de release",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-schema-parity-phase-003.mjs", "--self-test"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);
expect(selfTest.status === 0, "autoteste do avaliador");

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-schema-parity-phase-003.mjs"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);
const assessed = assessment.status === 0
  ? JSON.parse(assessment.stdout)
  : null;
expect(
  assessed?.status === "schema_parity_blocked",
  "estado real permanece bloqueado",
);
expect(
  assessed?.release?.remote_write_executed === false,
  "execução real permaneceu somente leitura",
);

for (const [label, passed] of checks)
  console.log(`${passed ? "✓" : "✗"} ${label}`);

if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(
  `\nFase 3/24 aprovada estruturalmente: ${checks.length} controles de paridade.`,
);

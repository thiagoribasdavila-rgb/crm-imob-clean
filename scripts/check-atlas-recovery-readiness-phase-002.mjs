import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(
  read("config/atlas-10x-phase-002-recovery.json"),
);
const packageJson = JSON.parse(read("package.json"));
const contract = read("lib/governance/recovery-contract.ts");
const route = read("app/api/v1/governance/rollback/route.ts");
const acceptance = read(
  "app/api/v1/governance/executive-acceptance/route.ts",
);
const panel = read(
  "app/(crm)/atlas-v3/audit/RollbackDrillPanel.tsx",
);
const auditPage = read("app/(crm)/atlas-v3/audit/page.tsx");
const report = read("docs/ATLAS_10X_PHASE_002_RECOVERY.md");
const result = read("docs/ATLAS_10X_PHASE_002_RESULT.md");
const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-002.v1",
  "contrato versionado",
);
expect(
  config.rollback_strategy === "previous_v3_release",
  "rollback aponta para versão anterior do V3",
);
expect(config.legacy_v2_accepted === false, "V2 legado não é aceito");
expect(
  config.production_policy === "blocked_until_recovery_drill_passes",
  "produção falha fechada",
);
expect(
  packageJson.scripts?.["atlas:recovery:assess"]?.includes(
    "run-atlas-recovery-readiness-phase-002.mjs",
  ),
  "avaliação exposta no package",
);
expect(
  packageJson.scripts?.["atlas:recovery:check"]?.includes(
    "check-atlas-recovery-readiness-phase-002.mjs",
  ),
  "verificador exposto no package",
);
expect(
  contract.includes("ATLAS_V3_RELEASE_ROLLBACK:"),
  "evidência V3 possui marcador inequívoco",
);
expect(
  contract.includes("storageEvidenceReference"),
  "Storage possui evidência separada",
);
expect(
  contract.includes("artifactReference"),
  "pacote imutável é obrigatório",
);
expect(
  route.includes(".like(\"notes\", `${V3_RELEASE_ROLLBACK_MARKER}%`)"),
  "rollback V2 antigo não qualifica a listagem",
);
expect(
  acceptance.includes(
    ".like(\"notes\", `${V3_RELEASE_ROLLBACK_MARKER}%`)",
  ),
  "rollback V2 antigo não qualifica aceite executivo",
);
expect(
  route.includes('status === "passed"') &&
    route.includes("healthStatus < 200 || healthStatus > 399"),
  "aprovação exige health check válido",
);
expect(
  panel.includes("O V2 histórico não é aceito"),
  "interface explica a estratégia atual",
);
expect(
  panel.includes("Evidência dos arquivos"),
  "interface solicita evidência do Storage",
);
expect(
  auditPage.includes("restauração isolada do banco"),
  "governança diferencia backup e restauração",
);
expect(
  report.includes("backup do banco não inclui os objetos do Storage"),
  "limite do backup documentado",
);
expect(
  report.includes("não executa restauração automaticamente"),
  "automação não altera ambiente remoto",
);
expect(
  result.includes("Produção liberada | Não"),
  "resultado mantém produção bloqueada",
);

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-recovery-readiness-phase-002.mjs", "--self-test"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);
expect(selfTest.status === 0, "autoteste do avaliador");

for (const [label, passed] of checks)
  console.log(`${passed ? "✓" : "✗"} ${label}`);

if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(
  `\nFase 2/24 aprovada estruturalmente: ${checks.length} controles de recuperação.`,
);

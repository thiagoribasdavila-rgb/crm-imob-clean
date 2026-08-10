import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const evidence = json(
  "artifacts/runtime/human-gates/f02-f16-upstream-readiness-evidence.json",
);
const packageJson = json("package.json");
const coordinator = read(
  "scripts/run-atlas-upstream-technical-readiness-f02-f16.mjs",
);
const documentation = read(
  "docs/ATLAS_UPSTREAM_TECHNICAL_READINESS_F02_F16.md",
);
const checks = [];
const expect = (condition, label) =>
  checks.push({ passed: Boolean(condition), label });

expect(
  evidence.schema_version ===
    "atlas.upstream_technical_readiness.f02-f16.v1",
  "evidência consolidada está versionada",
);
expect(
  evidence.status === "upstream_technical_chain_blocked" &&
    evidence.ready === false,
  "cadeia real permanece fail-closed",
);
expect(
  evidence.tracks?.recovery?.first_blocking_phase === 2 &&
    evidence.tracks.recovery.phases_total === 1,
  "trilha de recuperação identifica F02",
);
expect(
  evidence.tracks?.local_migration?.first_blocking_phase === 12 &&
    evidence.tracks.local_migration.phases_total === 5,
  "trilha local identifica F12 como primeiro bloqueio",
);
expect(
  evidence.tracks.local_migration.phases
    .map((phase) => phase.phase)
    .join(",") === "12,13,14,15,16",
  "F12–F16 estão ordenadas",
);

const expectedMetrics = new Map([
  [2, [0, 7, 0]],
  [12, [15, 28, 54]],
  [13, [4, 32, 13]],
  [14, [6, 21, 29]],
  [15, [13, 40, 33]],
  [16, [10, 49, 20]],
]);
const phases = [
  ...evidence.tracks.recovery.phases,
  ...evidence.tracks.local_migration.phases,
];
for (const phase of phases) {
  const expected = expectedMetrics.get(phase.phase);
  expect(
    expected &&
      phase.gates.passed === expected[0] &&
      phase.gates.total === expected[1] &&
      phase.gates.percentage === expected[2] &&
      Array.isArray(phase.gates.blockers),
    `métricas reais da F${phase.phase} foram preservadas`,
  );
}

expect(
  evidence.recovery_contract?.accepted === false &&
    evidence.recovery_contract?.passed === 0 &&
    evidence.recovery_contract?.total === 10,
  "contrato completo de recuperação também permanece bloqueado",
);
expect(
  evidence.artifacts.length === 20,
  "vinte artefatos técnicos e humanos estão inventariados",
);
expect(
  evidence.artifacts.every(
    (artifact) =>
      artifact.path &&
      typeof artifact.exists === "boolean" &&
      Object.hasOwn(artifact, "sha256") &&
      !Object.hasOwn(artifact, "value"),
  ),
  "inventário expõe somente metadados e hashes",
);
expect(
  evidence.next_actions?.local_migration?.tooling_missing
    ?.project_config === false &&
    evidence.next_actions.local_migration.tooling_missing
      .container_runtime === true &&
    evidence.next_actions.local_migration.tooling_missing.psql === true,
  "config local está concluído e a próxima ação aponta runtime e psql ausentes",
);
expect(
  evidence.next_actions.local_migration.local_bootstrap
    ?.evidence_present === true &&
    evidence.next_actions.local_migration.local_bootstrap
      .evidence_parses === true &&
    evidence.next_actions.local_migration.local_bootstrap.status ===
      "local_supabase_bootstrap_complete" &&
    evidence.next_actions.local_migration.local_bootstrap
      .approval_present === true,
  "F12 incorpora o estado real do bootstrap local protegido",
);
expect(
  evidence.governance?.manual_approvals_created === false &&
    evidence.governance?.missing_evidence_never_counts_as_approval ===
      true &&
    evidence.governance?.rls_and_data_api_grants_verified_separately ===
      true,
  "governança mantém aprovação humana, RLS e GRANT separados",
);
expect(
  Object.values(evidence.safety).every((value) => value === false),
  "coordenador não toca banco, remoto, migration, build ou ZIP",
);
expect(
  evidence.ordered_safe_flow.length === 8 &&
    evidence.ordered_safe_flow[0].includes("f02") &&
    evidence.ordered_safe_flow[1].includes("f12") &&
    evidence.ordered_safe_flow[7].includes("f22"),
  "fluxo seguro cobre F02, F12–F16, F17–F21 e F22",
);
expect(
  packageJson.scripts?.["atlas:upstream-readiness:assess"]?.includes(
    "run-atlas-upstream-technical-readiness-f02-f16.mjs",
  ),
  "package expõe a avaliação consolidada",
);
expect(
  packageJson.scripts?.["atlas:upstream-readiness:check"]?.includes(
    "check-atlas-upstream-technical-readiness-f02-f16.mjs",
  ),
  "package expõe o check consolidado",
);

for (const marker of [
  "evaluateTrack",
  "manual_approvals_created: false",
  "historical_migrations_are_not_runtime_proof: true",
  "remote_read_executed: false",
  "migration_applied: false",
  "--write-evidence",
  "--self-test",
]) {
  expect(coordinator.includes(marker), `coordenador contém ${marker}`);
}

for (const marker of [
  "Fundação técnica F02–F16",
  "PostgreSQL 17",
  "não cria aprovação",
  "RLS",
  "`GRANT`",
  "F17–F21",
  "Hostinger",
]) {
  expect(documentation.includes(marker), `documentação contém ${marker}`);
}

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-upstream-technical-readiness-f02-f16.mjs",
    "--self-test",
  ],
  { cwd: root, encoding: "utf8" },
);
let selfTestPayload = {};
try {
  selfTestPayload = JSON.parse(selfTest.stdout);
} catch {
  selfTestPayload = {};
}
expect(
  selfTest.status === 0 &&
    selfTestPayload.tests_passed === 7 &&
    selfTestPayload.tests_total === 7,
  "autoteste fail-closed aprova 7/7",
);

const regressions = [
  "scripts/check-atlas-recovery-readiness-phase-002.mjs",
  "scripts/check-atlas-isolated-baseline-capture-phase-012.mjs",
  "scripts/check-atlas-access-surface-inventory-phase-013.mjs",
  "scripts/check-atlas-security-remediation-backlog-phase-014.mjs",
  "scripts/check-atlas-isolated-migration-package-phase-015.mjs",
  "scripts/check-atlas-local-migration-rehearsal-phase-016.mjs",
];
for (const script of regressions) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
  });
  expect(result.status === 0, `regressão aprovada: ${script}`);
}

const failures = checks.filter((check) => !check.passed);
if (failures.length > 0) {
  console.error(
    `ATLAS upstream F02-F16: REPROVADO (${checks.length - failures.length}/${checks.length})`,
  );
  for (const failure of failures) console.error(`- ${failure.label}`);
  process.exit(1);
}

console.log(
  `ATLAS upstream F02-F16: APROVADO (${checks.length}/${checks.length}) — fundação medida sem criar aprovação, tocar remoto, banco, migration, build ou ZIP.`,
);

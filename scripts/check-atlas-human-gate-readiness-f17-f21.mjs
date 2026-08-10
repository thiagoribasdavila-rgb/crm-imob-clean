import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const evidence = json(
  "artifacts/runtime/human-gates/f17-f21-readiness-evidence.json",
);
const packageJson = json("package.json");
const coordinator = read(
  "scripts/run-atlas-human-gate-readiness-f17-f21.mjs",
);
const documentation = read("docs/ATLAS_HUMAN_GATE_READINESS_F17_F21.md");
const checks = [];
const expect = (condition, label) =>
  checks.push({ passed: Boolean(condition), label });

expect(
  evidence.schema_version === "atlas.human_gate_readiness.f17-f21.v1",
  "evidência consolidada está versionada",
);
expect(
  evidence.status === "human_gate_chain_blocked" &&
    evidence.ready === false,
  "cadeia real permanece fail-closed",
);
expect(
  evidence.phases_total === 5 &&
    evidence.phases.length === 5 &&
    evidence.phases.map((item) => item.phase).join(",") ===
      "17,18,19,20,21",
  "cinco fases estão ordenadas",
);
expect(
  evidence.first_blocking_phase === 17,
  "primeiro bloqueio real é identificado na F17",
);
expect(
  evidence.phases.every(
    (item) =>
      typeof item.gates?.passed === "number" &&
      typeof item.gates?.total === "number" &&
      Array.isArray(item.gates?.blockers),
  ),
  "métricas dos gates foram normalizadas",
);
expect(
  evidence.technical_prerequisites.length === 3,
  "três pré-requisitos técnicos são inventariados",
);
expect(
  evidence.manual_artifacts.length === 6,
  "seis artefatos de decisão ou observação são inventariados",
);
expect(
  evidence.manual_artifacts.every(
    (artifact) =>
      artifact.path.startsWith("artifacts/runtime/") &&
      artifact.template.startsWith("docs/templates/") &&
      ("sha256" in artifact),
  ),
  "inventário expõe apenas caminho, presença e hash",
);
expect(
  evidence.governance.manual_approval_required === true &&
    evidence.governance.manual_approvals_created === false &&
    evidence.governance.missing_evidence_never_counts_as_approval === true,
  "aprovações continuam exclusivamente humanas",
);
expect(
  evidence.governance.rls_and_data_api_grants_verified_separately ===
    true,
  "RLS e GRANTs da Data API permanecem gates separados",
);
expect(
  Object.values(evidence.safety).every((value) => value === false),
  "coordenador não toca banco, remoto, migration, build ou ZIP",
);
expect(
  evidence.ordered_safe_flow.length === 7 &&
    evidence.ordered_safe_flow[0].includes("f15") &&
    evidence.ordered_safe_flow[6].includes("f22"),
  "fluxo seguro cobre F15 até F22",
);
expect(
  packageJson.scripts?.["atlas:human-gates:assess"]?.includes(
    "run-atlas-human-gate-readiness-f17-f21.mjs",
  ),
  "package expõe a avaliação consolidada",
);
expect(
  packageJson.scripts?.["atlas:human-gates:check"]?.includes(
    "check-atlas-human-gate-readiness-f17-f21.mjs",
  ),
  "package expõe o check consolidado",
);

for (const marker of [
  "evaluateChain",
  "manual_approvals_created: false",
  "remote_read_executed: false",
  "migration_applied: false",
  "--write-evidence",
  "--self-test",
]) {
  expect(coordinator.includes(marker), `coordenador contém ${marker}`);
}

for (const marker of [
  "Mesa de decisão F17–F21",
  "não cria aprovação",
  "RLS",
  "GRANT",
  "F22",
  "Hostinger",
]) {
  expect(documentation.includes(marker), `documentação contém ${marker}`);
}

const selfTest = spawnSync(
  process.execPath,
  ["scripts/run-atlas-human-gate-readiness-f17-f21.mjs", "--self-test"],
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
    selfTestPayload.tests_passed === 6 &&
    selfTestPayload.tests_total === 6,
  "autoteste fail-closed aprova 6/6",
);

const regressions = [
  "scripts/check-atlas-homologation-decision-dossier-phase-017.mjs",
  "scripts/check-atlas-isolated-branch-preflight-phase-018.mjs",
  "scripts/check-atlas-sanitized-remediation-plan-phase-019.mjs",
  "scripts/check-atlas-local-remediation-specification-phase-020.mjs",
  "scripts/check-atlas-local-migration-authoring-phase-021.mjs",
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
    `ATLAS human gates F17-F21: REPROVADO (${checks.length - failures.length}/${checks.length})`,
  );
  for (const failure of failures) console.error(`- ${failure.label}`);
  process.exit(1);
}

console.log(
  `ATLAS human gates F17-F21: APROVADO (${checks.length}/${checks.length}) — cadeia consolidada sem criar aprovação, tocar remoto, banco, migration, build ou ZIP.`,
);

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const packageJson = json("package.json");
const contract = json(
  "config/atlas-local-supabase-bootstrap-gate.json",
);
const readinessEvidencePath =
  "artifacts/runtime/phase-012/local-supabase-bootstrap-readiness.json";
const assessor = read(
  "scripts/run-atlas-local-supabase-bootstrap-readiness.mjs",
);
const executor = read(
  "scripts/execute-atlas-local-supabase-bootstrap.mjs",
);
const documentation = read(
  "docs/ATLAS_LOCAL_SUPABASE_BOOTSTRAP_GATE.md",
);
const checks = [];
const expect = (condition, label) =>
  checks.push({ label, passed: Boolean(condition) });

const runJson = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
  });
  return {
    status: result.status,
    output: result.status === 0 ? JSON.parse(result.stdout) : null,
  };
};

const assessorSelfTest = runJson([
  "scripts/run-atlas-local-supabase-bootstrap-readiness.mjs",
  "--self-test",
]);
const executorSelfTest = runJson([
  "scripts/execute-atlas-local-supabase-bootstrap.mjs",
  "--self-test",
]);
const assessment = runJson([
  "scripts/run-atlas-local-supabase-bootstrap-readiness.mjs",
  "--write-evidence",
]);
const executionEvidencePath = resolve(root, contract.evidence.path);
const executionEvidence = existsSync(executionEvidencePath)
  ? JSON.parse(readFileSync(executionEvidencePath, "utf8"))
  : null;

expect(
  contract.schema_version === "atlas.local_supabase_bootstrap.v1",
  "contrato do bootstrap está versionado",
);
expect(
  contract.cli.expected_version === "2.109.1" &&
    contract.cli.command === "init" &&
    contract.cli.allowed_args.length === 0,
  "comando permitido é somente supabase init sem argumentos",
);
expect(
  contract.cli.forbidden_args.includes("--force") &&
    contract.cli.forbidden_args.includes("--linked") &&
    contract.cli.forbidden_args.includes("--project-ref"),
  "force, linked e project-ref são proibidos",
);
expect(
  contract.safety.remote_project_access_allowed === false &&
    contract.safety.database_start_allowed === false &&
    contract.safety.migration_allowed === false &&
    contract.safety.data_access_allowed === false,
  "contrato proíbe remoto, banco, migration e dados",
);
expect(
  assessorSelfTest.status === 0 &&
    assessorSelfTest.output.tests_passed === 12,
  "autoteste do assessor aprova 12/12",
);
expect(
  executorSelfTest.status === 0 &&
    executorSelfTest.output.tests_passed === 12,
  "autoteste do executor aprova 12/12",
);
expect(
  assessment.status === 0 &&
    assessment.output.schema_version === contract.schema_version,
  "avaliação real produz evidência versionada",
);
expect(
  assessment.output.tooling.cli_version === "2.109.1" &&
    assessment.output.tooling.cli_version_matches === true,
  "CLI local fixada é detectada em HOME isolado",
);
expect(
  assessment.output.source.migrations_count > 0 &&
    assessment.output.source.migration_names_unique === true,
  "fila de migrations existe e possui nomes únicos",
);
expect(
  assessment.output.source.linked_project_marker_absent === true,
  "nenhum marcador linked foi encontrado",
);
expect(
  assessment.output.authorization.approval_created_by_assessor ===
    false,
  "assessor não cria aprovação em nome do operador",
);
expect(
  assessment.output.safety.init_executed === false &&
    assessment.output.safety.remote_accessed === false &&
    assessment.output.safety.database_started === false &&
    assessment.output.safety.migration_applied === false,
  "avaliação não executa init, remoto, banco ou migration",
);
expect(
  existsSync(
    resolve(root, readinessEvidencePath),
  ),
  "evidência de prontidão sanitizada foi materializada separadamente",
);
expect(
  assessment.output.status !== "local_supabase_bootstrap_complete" ||
    (executionEvidence?.status ===
      "local_supabase_bootstrap_complete" &&
      executionEvidence?.local_config?.valid === true &&
      executionEvidence?.execution?.postcondition_verified === true),
  "config concluído possui evidência de execução ou reconciliação verificada",
);
expect(
  packageJson.scripts?.["atlas:supabase-bootstrap:assess"]?.includes(
    "--write-evidence",
  ) &&
    packageJson.scripts?.["atlas:supabase-bootstrap:check"]?.includes(
      "check-atlas-local-supabase-bootstrap.mjs",
    ) &&
    packageJson.scripts?.[
      "atlas:supabase-bootstrap:execute"
    ]?.includes("--execute"),
  "package expõe avaliação, check e executor protegido",
);
for (const marker of [
  "sanitizedLocalEnvironment",
  "SUPABASE_TELEMETRY_DISABLED",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "DATABASE_URL",
  "commandContract([])",
  "classifyBootstrapPostcondition",
  "verified_existing_postcondition",
  "config existente não pode ser sobrescrito",
]) {
  expect(executor.includes(marker), `executor contém ${marker}`);
}
for (const marker of [
  "projectFingerprint",
  "approvalDraft",
  "linked_project_marker_absent",
  "approval_fingerprint_matches",
  "credentials_read: false",
]) {
  expect(assessor.includes(marker), `assessor contém ${marker}`);
}
for (const marker of [
  "supabase init",
  "não acessa",
  "PostgreSQL 17",
  "autorização explícita",
  "não executa build",
]) {
  expect(documentation.includes(marker), `documentação contém ${marker}`);
}

const failures = checks.filter((check) => !check.passed);
if (failures.length > 0) {
  console.error(
    `ATLAS Supabase bootstrap: REPROVADO (${checks.length - failures.length}/${checks.length})`,
  );
  for (const failure of failures) console.error(`- ${failure.label}`);
  process.exit(1);
}

console.log(
  `ATLAS Supabase bootstrap: APROVADO (${checks.length}/${checks.length}) — configuração local preparada com autorização vinculada, sem remoto, banco, migration, build ou ZIP.`,
);

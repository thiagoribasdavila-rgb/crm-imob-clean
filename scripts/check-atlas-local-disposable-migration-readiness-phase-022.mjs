import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const packageJson = json("package.json");
const evidence = json(
  "artifacts/runtime/phase-022/environment-readiness-evidence.json",
);
const script = read(
  "scripts/preflight-atlas-local-disposable-migration-rehearsal-phase-022.mjs",
);
const documentation = read(
  "docs/ATLAS_PHASE_022_EXECUTION_READINESS.md",
);
const checks = [];
const expect = (condition, label) =>
  checks.push({ label, passed: Boolean(condition) });

expect(
  evidence.schema_version ===
    "atlas.phase-022.environment-readiness.v1",
  "evidência de prontidão está versionada",
);
expect(evidence.phase === "22/24", "evidência pertence à Fase 22");
expect(
  evidence.tooling.supabase_cli_version === "2.109.1" &&
    evidence.tooling.supabase_cli_version_matches === true,
  "CLI Supabase instalada corresponde à versão fixada",
);
expect(
  evidence.tooling.container_daemon_checked === false,
  "preflight não consulta daemon de containers",
);
expect(
  evidence.safety.local_database_started === false &&
    evidence.safety.migration_applied === false,
  "preflight não inicia banco nem aplica migration",
);
expect(
  evidence.safety.remote_accessed === false &&
    evidence.safety.linked_project_accessed === false &&
    evidence.safety.production_touched === false,
  "preflight não acessa remoto, linked ou produção",
);
expect(
  evidence.safety.build_executed === false &&
    evidence.safety.release_package_created === false,
  "preflight não executa build nem cria pacote",
);
expect(
  evidence.readiness.ready === false &&
    evidence.status === "local_rehearsal_environment_blocked",
  "estado real permanece bloqueado sem alegar execução",
);
expect(
  evidence.readiness.blockers.includes(
    "container_runtime_cli_missing",
  ) &&
    evidence.inputs.source_config.exists === true &&
    !evidence.readiness.blockers.includes("source_config_missing"),
  "runtime ausente bloqueia, enquanto a configuração local permanece validada",
);
expect(
  evidence.readiness.blockers.includes(
    "phase_021_authoring_not_ready",
  ) &&
    evidence.readiness.blockers.includes("authoring_receipt_missing") &&
    evidence.readiness.blockers.includes(
      "rehearsal_authorization_missing",
    ),
  "cadeia humana e recibos pendentes aparecem como bloqueios",
);
expect(
  packageJson.scripts?.["atlas:migration-rehearsal-v2:preflight"]?.includes(
    "preflight-atlas-local-disposable-migration-rehearsal-phase-022.mjs",
  ),
  "package expõe o preflight seguro",
);
expect(
  packageJson.scripts?.[
    "atlas:migration-rehearsal-v2:preflight-check"
  ]?.includes(
    "check-atlas-local-disposable-migration-readiness-phase-022.mjs",
  ),
  "package expõe o check do preflight",
);
for (const marker of [
  "evaluateEnvironmentReadiness",
  "container_daemon_checked: false",
  "local_database_started: false",
  "--require-ready",
  "--write-evidence",
]) {
  expect(script.includes(marker), `preflight contém ${marker}`);
}
for (const marker of [
  "CLI 2.109.1",
  "runtime Docker",
  "supabase/config.toml",
  "F17",
  "autorização JIT",
  "nenhuma migration foi aplicada",
]) {
  expect(documentation.includes(marker), `documentação contém ${marker}`);
}

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/preflight-atlas-local-disposable-migration-rehearsal-phase-022.mjs",
    "--self-test",
  ],
  { cwd: root, encoding: "utf8" },
);
expect(
  selfTest.status === 0 &&
    JSON.parse(selfTest.stdout).tests_passed === 9,
  "autoteste fail-closed aprova 9/9",
);

const failures = checks.filter((check) => !check.passed);
if (failures.length > 0) {
  console.error(
    `ATLAS F22 readiness: REPROVADO (${checks.length - failures.length}/${checks.length})`,
  );
  for (const failure of failures) {
    console.error(`- ${failure.label}`);
  }
  process.exit(1);
}

console.log(
  `ATLAS F22 readiness: APROVADO (${checks.length}/${checks.length}) — preflight local mede ferramentas e gates sem iniciar Docker, banco, migration, remoto, build ou ZIP.`,
);

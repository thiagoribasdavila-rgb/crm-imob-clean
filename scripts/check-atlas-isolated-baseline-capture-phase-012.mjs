import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));
const config = readJson(
  "config/atlas-10x-phase-012-isolated-baseline-capture.json",
);
const approval = readJson(
  "artifacts/runtime/phase-012/manual-capture-approval-receipt.json",
);
const evidence = readJson(
  "artifacts/runtime/phase-012/isolated-baseline-capture-evidence.json",
);
const packageJson = readJson("package.json");
const assessor = read(
  "scripts/run-atlas-isolated-baseline-capture-phase-012.mjs",
);
const executor = read(
  "scripts/execute-atlas-isolated-baseline-capture-phase-012.mjs",
);
const runbook = read(
  "docs/ATLAS_10X_PHASE_012_ISOLATED_BASELINE_CAPTURE.md",
);
const resultDoc = read("docs/ATLAS_10X_PHASE_012_RESULT.md");

const checks = [];
const expect = (condition, label) =>
  checks.push([label, Boolean(condition)]);

expect(
  config.schema_version === "atlas.10x.phase-012.v1" &&
    config.phase === 12 &&
    config.total_phases === 24,
  "contrato da Fase 12 está versionado",
);
expect(
  config.source_policy.allowed_target_kind ===
    "isolated_loopback_pg17" &&
    config.source_policy.expected_postgres_major === 17 &&
    config.source_policy.live_homologation_allowed === false,
  "somente loopback PostgreSQL 17 é permitido",
);
expect(
  config.authorization_contract.explicit_approval_required ===
    true &&
    config.authorization_contract.target_fingerprint_required ===
      true &&
    config.authorization_contract.expires_at_required === true,
  "aprovação é explícita, vinculada e expira",
);
expect(
  approval.approved === false &&
    approval.target_fingerprint === null &&
    approval.expires_at === null,
  "recibo inicial é fail-closed",
);
expect(
  config.tooling_contract.command === "supabase db dump" &&
    config.tooling_contract.psql_required_for_server_version_check ===
      true &&
    config.tooling_contract.required_flags.includes("--db-url") &&
    config.tooling_contract.forbidden_flags.includes("--linked") &&
    config.tooling_contract.forbidden_flags.includes("--data-only"),
  "comando de captura é estrutural e explícito",
);
expect(
  config.execution_policy.allows_remote_schema_read === false &&
    config.execution_policy.allows_remote_ddl === false &&
    config.execution_policy.allows_remote_dml === false &&
    config.execution_policy.allows_data_dump === false,
  "leitura remota, DDL, DML e dados estão bloqueados",
);
expect(
  evidence.status === "capture_not_executed" &&
    evidence.capture.executed === false &&
    evidence.target.connection_verified === false &&
    evidence.safety.live_homologation_touched === false,
  "evidência real não alega captura",
);
expect(
  evidence.safety.database_url_persisted === false &&
    evidence.safety.raw_cli_output_persisted === false &&
    evidence.safety.business_data_copied === false &&
    evidence.safety.auth_user_data_copied === false,
  "evidência não contém URL, saída bruta ou dados",
);
expect(
  assessor.includes("targetFingerprint") &&
    assessor.includes("approved_target_is_loopback") &&
    assessor.includes("approval_not_expired") &&
    assessor.includes("schema_dump_has_no_data_statements"),
  "avaliador cobre alvo, expiração e privacidade",
);
expect(
  executor.includes('"db",') &&
    executor.includes('"dump",') &&
    executor.includes('"--db-url",') &&
    executor.includes('"--schema",') &&
    executor.includes('"--file",'),
  "executor usa db dump com alvo, schema e arquivo explícitos",
);
expect(
  executor.includes(
    "\"select current_setting('server_version_num');\"",
  ) &&
    executor.includes("Math.floor(serverVersion / 10000)") &&
    executor.includes("verifyPhase011Contract()"),
  "executor comprova PostgreSQL 17 e o contrato anterior",
);
expect(
  assessor.includes(
    "/Applications/Docker.app/Contents/Resources/bin/docker",
  ) &&
    assessor.includes("/opt/homebrew/opt/libpq/bin/psql") &&
    executor.includes(
      "/Applications/Docker.app/Contents/Resources/bin/docker",
    ) &&
    executor.includes("/opt/homebrew/opt/libpq/bin/psql"),
  "ferramentas fora do PATH são descobertas sem links globais",
);
expect(
  !executor.includes('"pull",') &&
    !executor.includes('"push",') &&
    !executor.includes('"repair",') &&
    !executor.includes('"--linked",') &&
    !executor.includes('"--data-only",'),
  "executor não possui caminho linked, pull, push, repair ou data-only",
);
expect(
  executor.includes("stripDollarQuotedBodies") &&
    executor.includes("containsDataStatements") &&
    executor.includes("containsCredentials") &&
    executor.includes("containsPersonalData"),
  "captura é inspecionada sem confundir corpo de função com dados",
);
expect(
  packageJson.scripts?.["atlas:baseline-capture:assess"]?.includes(
    "run-atlas-isolated-baseline-capture-phase-012.mjs",
  ) &&
    packageJson.scripts?.["atlas:baseline-capture:execute"]?.includes(
      "execute-atlas-isolated-baseline-capture-phase-012.mjs --execute",
    ) &&
    packageJson.scripts?.["atlas:baseline-capture:check"]?.includes(
      "check-atlas-isolated-baseline-capture-phase-012.mjs",
    ),
  "comandos da Fase 12 estão publicados",
);
expect(
  runbook.includes("loopback") &&
    runbook.includes("PostgreSQL 17") &&
    runbook.includes("db dump") &&
    runbook.includes("Não use"),
  "runbook explica alvo e operações proibidas",
);
expect(
  resultDoc.includes("Captura estrutural executada | Não") &&
    resultDoc.includes("Homologação alterada | Não") &&
    resultDoc.includes("Build executado | Não") &&
    resultDoc.includes("ZIP criado | Não"),
  "resultado não alega execução ou release",
);

const selfTest = spawnSync(
  process.execPath,
  [
    "scripts/run-atlas-isolated-baseline-capture-phase-012.mjs",
    "--self-test",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(
  selfTest.status === 0,
  "autoteste rejeita alvo remoto, autorização expirada e dados",
);

const sqlSafetySelfTest = spawnSync(
  process.execPath,
  [
    "scripts/execute-atlas-isolated-baseline-capture-phase-012.mjs",
    "--self-test",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
expect(
  sqlSafetySelfTest.status === 0,
  "autoteste distingue DML estrutural de dados no topo",
);

const assessment = spawnSync(
  process.execPath,
  ["scripts/run-atlas-isolated-baseline-capture-phase-012.mjs"],
  { cwd: process.cwd(), encoding: "utf8" },
);
const assessed =
  assessment.status === 0 ? JSON.parse(assessment.stdout) : null;
expect(
  assessed?.status ===
    "isolated_baseline_capture_preflight_ready_runtime_blocked" &&
    assessed?.conclusion?.captureExecuted === false,
  "captura real permanece bloqueada",
);
expect(
  assessed?.readiness?.gates?.project_config_present === true &&
    assessed?.readiness?.blockers?.includes(
      "container_runtime_available",
    ) &&
    assessed?.readiness?.blockers?.includes("psql_available") &&
    assessed?.readiness?.blockers?.includes(
      "approval_receipt_valid",
    ),
  "gate confirma o config e enumera os bloqueios reais restantes",
);
expect(
  assessed?.target?.urlPersisted === false &&
    assessed?.authorization?.remoteRead === false &&
    assessed?.authorization?.remoteWrite === false &&
    assessed?.authorization?.build === false &&
    assessed?.authorization?.releasePackage === false,
  "saída não expõe URL nem autoriza ações externas",
);

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  console.error(
    `ATLAS ISOLATED BASELINE CAPTURE CHECK: FAILED (${failures.length})`,
  );
  process.exit(1);
}

console.log(
  `ATLAS ISOLATED BASELINE CAPTURE CHECK: PASSED (${checks.length}/${checks.length})`,
);

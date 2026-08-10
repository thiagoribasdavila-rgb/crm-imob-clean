import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import {
  assessIsolatedCapture,
  targetFingerprint,
  verifyPhase011Contract,
} from "./run-atlas-isolated-baseline-capture-phase-012.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const config = readJson(
  "config/atlas-10x-phase-012-isolated-baseline-capture.json",
);
const approval = readJson(
  config.authorization_contract.receipt_path,
);
const currentEvidence = readJson(config.capture_contract.evidence_path);
const isolatedProbeHome = join(
  tmpdir(),
  "atlas-phase12-supabase-home",
);
mkdirSync(isolatedProbeHome, { recursive: true });

function fail(message) {
  console.error(`ATLAS PHASE 12 BLOCKED: ${message}`);
  process.exit(1);
}

function runQuiet(command, args, extraEnv = {}) {
  return spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      SUPABASE_TELEMETRY_DISABLED: "true",
    },
  });
}

function findExecutable(name, additionalCandidates = []) {
  const candidates = [
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((directory) => join(directory, name)),
    ...additionalCandidates,
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Descoberta somente leitura: nenhum runtime é iniciado.
    }
  }
  return "";
}

function stripDollarQuotedBodies(sql) {
  return sql.replace(
    /\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g,
    "$$REDACTED_FUNCTION_BODY$$",
  );
}

function privacyScan(sql) {
  const structuralSql = stripDollarQuotedBodies(sql);
  const dataPatterns = [
    /^\s*COPY\s+.+\s+FROM\s+stdin\s*;/gim,
    /^\s*INSERT\s+INTO\s+/gim,
  ];
  const credentialPatterns = [
    /postgres(?:ql)?:\/\/[^\s'"]+:[^\s'"]+@/i,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
  ];
  const personalDataPatterns = [
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
    /\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/,
  ];
  return {
    containsDataStatements: dataPatterns.some((pattern) =>
      pattern.test(structuralSql),
    ),
    containsCredentials: credentialPatterns.some((pattern) =>
      pattern.test(sql),
    ),
    containsPersonalData: personalDataPatterns.some((pattern) =>
      pattern.test(sql),
    ),
  };
}

function inventory(sql) {
  const count = (pattern) => sql.match(pattern)?.length ?? 0;
  return {
    schema_version: "atlas.phase012.schema_inventory.v1",
    schema: config.capture_contract.schema,
    counts: {
      tables: count(/\bCREATE\s+TABLE\b/gi),
      views: count(/\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b/gi),
      materialized_views: count(
        /\bCREATE\s+MATERIALIZED\s+VIEW\b/gi,
      ),
      functions: count(
        /\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b/gi,
      ),
      policies: count(/\bCREATE\s+POLICY\b/gi),
      indexes: count(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi),
      triggers: count(/\bCREATE\s+TRIGGER\b/gi),
      sequences: count(/\bCREATE\s+SEQUENCE\b/gi),
      rls_enablements: count(
        /\bENABLE\s+ROW\s+LEVEL\s+SECURITY\b/gi,
      ),
    },
    privacy: {
      contains_business_rows: false,
      contains_auth_user_rows: false,
      contains_database_url: false,
      contains_credentials: false,
      contains_personal_data: false
    }
  };
}

if (process.argv.includes("--self-test")) {
  const safeFunction = privacyScan(`
    CREATE TABLE public.audit_log (id bigint);
    CREATE FUNCTION public.write_audit() RETURNS void
    LANGUAGE plpgsql AS $body$
    BEGIN
      INSERT INTO public.audit_log (id) VALUES (1);
    END;
    $body$;
  `);
  const topLevelData = privacyScan(`
    CREATE TABLE public.audit_log (id bigint);
    INSERT INTO public.audit_log (id) VALUES (1);
  `);
  const credential = privacyScan(
    "COMMENT ON TABLE public.audit_log IS 'postgresql://user:secret@127.0.0.1/db';",
  );
  const personal = privacyScan(
    "COMMENT ON TABLE public.audit_log IS 'pessoa@example.com';",
  );
  if (
    safeFunction.containsDataStatements ||
    !topLevelData.containsDataStatements ||
    !credential.containsCredentials ||
    !personal.containsPersonalData
  ) {
    console.error(
      "ATLAS PHASE 12 SQL SAFETY SELF-TEST: FAILED",
    );
    process.exit(1);
  }
  console.log("ATLAS PHASE 12 SQL SAFETY SELF-TEST: PASSED");
  process.exit(0);
}

if (!process.argv.includes("--execute")) {
  fail("use o comando publicado, que exige o sinal explícito --execute");
}

const databaseUrl = process.env.ATLAS_BASELINE_CAPTURE_DATABASE_URL;
if (!databaseUrl) {
  fail("ATLAS_BASELINE_CAPTURE_DATABASE_URL não foi fornecida");
}

const cli = runQuiet(
  config.tooling_contract.supabase_cli_path,
  ["--version"],
  { HOME: isolatedProbeHome },
);
const dockerPath = findExecutable("docker", [
  "/Applications/Docker.app/Contents/Resources/bin/docker",
  "/Applications/OrbStack.app/Contents/MacOS/xbin/docker",
]);
const psqlPath = findExecutable("psql", [
  "/opt/homebrew/opt/libpq/bin/psql",
  "/usr/local/opt/libpq/bin/psql",
  "/Applications/Postgres.app/Contents/Versions/latest/bin/psql",
]);
const runtime = dockerPath
  ? runQuiet(dockerPath, ["--version"])
  : null;
const runtimeInfo =
  runtime?.status === 0
    ? runQuiet(dockerPath, ["info", "--format", "{{.ServerVersion}}"])
    : null;
const psqlVersion = psqlPath
  ? runQuiet(psqlPath, ["--version"])
  : null;
const tooling = {
  cliVersion:
    cli.status === 0 ? cli.stdout.trim().replace(/^v/, "") : null,
  projectConfigPresent: existsSync(
    config.tooling_contract.project_config_path,
  ),
  containerRuntimeAvailable: runtime?.status === 0,
  containerRuntimeResponding: runtimeInfo?.status === 0,
  psqlAvailable: psqlVersion?.status === 0,
};
const preflight = assessIsolatedCapture({
  candidateEvidence: currentEvidence,
  candidateApproval: approval,
  databaseUrl,
  tooling,
  phase011ContractPassed: verifyPhase011Contract(),
});
const preCaptureRequired = [
  "phase_011_contract_passed",
  "supabase_cli_version_verified",
  "db_dump_contract_verified",
  "project_config_present",
  "container_runtime_available",
  "container_runtime_responding",
  "psql_available",
  "approval_receipt_valid",
  "approval_not_expired",
  "approved_target_is_loopback",
  "target_fingerprint_matches",
  "postgres_17_confirmed",
  "isolated_target_disposable",
  "schema_only_or_synthetic_profile",
];
const preCaptureBlockers = preCaptureRequired.filter(
  (gate) => preflight.readiness.gates[gate] !== true,
);
if (preCaptureBlockers.length > 0) {
  fail(`preflight incompleto: ${preCaptureBlockers.join(", ")}`);
}

if (
  approval.target_fingerprint !== targetFingerprint(databaseUrl)
) {
  fail("a autorização não pertence ao alvo informado");
}

const versionCheck = runQuiet(psqlPath, [
  "--no-psqlrc",
  databaseUrl,
  "-Atqc",
  "select current_setting('server_version_num');",
]);
const serverVersion = Number(versionCheck.stdout.trim());
if (
  versionCheck.status !== 0 ||
  !Number.isInteger(serverVersion) ||
  Math.floor(serverVersion / 10000) !==
    config.source_policy.expected_postgres_major
) {
  fail("o alvo não comprovou PostgreSQL 17");
}

const paths = config.capture_contract;
if (
  existsSync(paths.partial_sql_path) ||
  existsSync(paths.final_sql_path) ||
  existsSync(paths.inventory_path) ||
  existsSync(paths.checksums_path)
) {
  fail("a captura existente não pode ser sobrescrita");
}

mkdirSync(paths.output_directory, { recursive: true });
const isolatedHome = process.env.ATLAS_BASELINE_CAPTURE_HOME;
if (!isolatedHome || !existsSync(isolatedHome)) {
  fail("ATLAS_BASELINE_CAPTURE_HOME deve apontar para um HOME isolado existente");
}

const dump = runQuiet(
  config.tooling_contract.supabase_cli_path,
  [
    "db",
    "dump",
    "--db-url",
    databaseUrl,
    "--schema",
    config.capture_contract.schema,
    "--file",
    paths.partial_sql_path,
  ],
  {
    HOME: isolatedHome,
    PATH: [
      dockerPath ? dirname(dockerPath) : "",
      process.env.PATH ?? "",
    ]
      .filter(Boolean)
      .join(delimiter),
  },
);
if (dump.status !== 0 || !existsSync(paths.partial_sql_path)) {
  fail("db dump não concluiu; a saída bruta não foi persistida");
}

const sql = readFileSync(paths.partial_sql_path, "utf8");
const scan = privacyScan(sql);
const containsPublic =
  /\b(?:CREATE|ALTER|COMMENT\s+ON)\s+.+\bpublic\./i.test(sql);
if (
  !containsPublic ||
  scan.containsDataStatements ||
  scan.containsCredentials ||
  scan.containsPersonalData
) {
  fail("a captura foi rejeitada pelo gate de estrutura e privacidade");
}

const schemaInventory = inventory(sql);
const checksum = createHash("sha256").update(sql).digest("hex");
writeFileSync(
  paths.inventory_path,
  `${JSON.stringify(schemaInventory, null, 2)}\n`,
  { flag: "wx" },
);
writeFileSync(
  paths.checksums_path,
  `${checksum}  canonical_baseline.public.sql\n`,
  { flag: "wx" },
);
renameSync(paths.partial_sql_path, paths.final_sql_path);

const acceptedEvidence = {
  schema_version: "atlas.isolated_baseline_capture_evidence.v1",
  phase: 12,
  status: "capture_complete",
  target: {
    kind: "isolated_loopback_pg17",
    loopback: true,
    postgres_major: 17,
    disposable: true,
    fingerprint_matched: true,
    connection_verified: true,
  },
  tooling: {
    supabase_cli_version:
      config.tooling_contract.supabase_cli_version,
    project_config_present: true,
    container_runtime_available: true,
    container_runtime_responding: true,
    psql_available: true,
  },
  capture: {
    executed: true,
    exit_zero: true,
    contains_public_schema: true,
    contains_data_statements: false,
    contains_credentials: false,
    contains_personal_data: false,
    inventory_created: true,
    checksum_created: true,
  },
  safety: {
    remote_read_executed: false,
    remote_write_executed: false,
    live_homologation_touched: false,
    linked_command_used: false,
    business_data_copied: false,
    auth_user_data_copied: false,
    raw_cli_output_persisted: false,
    database_url_persisted: false,
    build_executed: false,
    package_created: false,
  },
};
writeFileSync(
  paths.evidence_path,
  `${JSON.stringify(acceptedEvidence, null, 2)}\n`,
);

console.log(
  JSON.stringify(
    {
      status: "isolated_baseline_capture_complete",
      schema: config.capture_contract.schema,
      checksum,
      database_url_persisted: false,
      raw_cli_output_persisted: false,
      next_phase: config.next_phase,
    },
    null,
    2,
  ),
);

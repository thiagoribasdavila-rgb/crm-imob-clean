import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  inspectBootstrapReadiness,
  parseLocalConfig,
} from "./run-atlas-local-supabase-bootstrap-readiness.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contract = JSON.parse(
  readFileSync(
    resolve(root, "config/atlas-local-supabase-bootstrap-gate.json"),
    "utf8",
  ),
);

function fail(message) {
  console.error(`ATLAS LOCAL SUPABASE BOOTSTRAP BLOCKED: ${message}`);
  process.exitCode = 1;
}

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function commandContract(args) {
  const exactArgs =
    Array.isArray(args) &&
    args.length === contract.cli.allowed_args.length &&
    args.every(
      (value, index) => value === contract.cli.allowed_args[index],
    );
  return {
    executable: contract.cli.path,
    command: contract.cli.command,
    args,
    exact_args: exactArgs,
    force_used: args.includes("--force"),
    interactive_used: args.includes("--interactive"),
    linked_used: args.some((arg) =>
      ["--linked", "--project-ref"].includes(arg),
    ),
    accepted:
      exactArgs &&
      !args.some((arg) => contract.cli.forbidden_args.includes(arg)),
  };
}

export function sanitizedLocalEnvironment(source = process.env) {
  return {
    PATH: source.PATH ?? "",
    TMPDIR: source.TMPDIR ?? tmpdir(),
    LANG: source.LANG ?? "C.UTF-8",
    HOME: join(tmpdir(), "atlas-local-supabase-bootstrap-home"),
    SUPABASE_TELEMETRY_DISABLED: "true",
    NO_COLOR: "1",
  };
}

export function classifyBootstrapPostcondition({
  exitStatus,
  configExists,
  configValid,
  linkedMarkerExists,
}) {
  if (linkedMarkerExists) {
    return {
      accepted: false,
      status: "unexpected_link_marker",
      exit_zero: exitStatus === 0,
    };
  }
  if (!configExists) {
    return {
      accepted: false,
      status: "config_not_created",
      exit_zero: exitStatus === 0,
    };
  }
  if (!configValid) {
    return {
      accepted: false,
      status: "config_requires_human_review",
      exit_zero: exitStatus === 0,
    };
  }
  return {
    accepted: true,
    status:
      exitStatus === 0
        ? "verified_local_config"
        : "verified_local_config_after_cli_warning",
    exit_zero: exitStatus === 0,
  };
}

function acceptedEvidence(readiness, localConfig, execution) {
  return {
    schema_version: contract.schema_version,
    scope: contract.scope,
    status: "local_supabase_bootstrap_complete",
    checked_at: new Date().toISOString(),
    project_fingerprint: readiness.project_fingerprint,
    tooling: {
      cli_version: readiness.tooling.cli_version,
      isolated_home: true,
      telemetry_disabled: true,
    },
    authorization: readiness.authorization,
    local_config: localConfig,
    execution: {
      command: "supabase init",
      exact_args: true,
      raw_cli_output_persisted: false,
      environment_values_persisted: false,
      postcondition_verified: true,
      ...execution,
    },
    safety: {
      init_executed: true,
      force_used: false,
      linked_project_accessed: false,
      remote_accessed: false,
      database_started: false,
      migration_applied: false,
      data_accessed: false,
      credentials_read: false,
      build_executed: false,
      release_package_created: false,
    },
    next_action: contract.next_action_after_success,
  };
}

function persistEvidence(evidence) {
  const evidencePath = resolve(root, contract.evidence.path);
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(
    evidencePath,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

export function selfTest() {
  const accepted = commandContract([]);
  const force = commandContract(["--force"]);
  const linked = commandContract(["--linked"]);
  const env = sanitizedLocalEnvironment({
    PATH: "/usr/bin",
    SUPABASE_ACCESS_TOKEN: "must-not-pass",
    SUPABASE_DB_PASSWORD: "must-not-pass",
    DATABASE_URL: "must-not-pass",
  });
  const directSuccess = classifyBootstrapPostcondition({
    exitStatus: 0,
    configExists: true,
    configValid: true,
    linkedMarkerExists: false,
  });
  const warningSuccess = classifyBootstrapPostcondition({
    exitStatus: 1,
    configExists: true,
    configValid: true,
    linkedMarkerExists: false,
  });
  const tests = [
    {
      id: "exact_init_without_args_is_accepted",
      passed: accepted.accepted,
    },
    {
      id: "force_is_rejected",
      passed: !force.accepted && force.force_used,
    },
    {
      id: "linked_is_rejected",
      passed: !linked.accepted && linked.linked_used,
    },
    {
      id: "remote_token_not_forwarded",
      passed: !("SUPABASE_ACCESS_TOKEN" in env),
    },
    {
      id: "database_password_not_forwarded",
      passed: !("SUPABASE_DB_PASSWORD" in env),
    },
    {
      id: "database_url_not_forwarded",
      passed: !("DATABASE_URL" in env),
    },
    {
      id: "telemetry_is_disabled",
      passed: env.SUPABASE_TELEMETRY_DISABLED === "true",
    },
    {
      id: "valid_config_with_zero_exit_is_accepted",
      passed:
        directSuccess.accepted &&
        directSuccess.status === "verified_local_config",
    },
    {
      id: "valid_config_after_cli_warning_is_accepted",
      passed:
        warningSuccess.accepted &&
        warningSuccess.status ===
          "verified_local_config_after_cli_warning" &&
        warningSuccess.exit_zero === false,
    },
    {
      id: "missing_config_fails_closed",
      passed:
        !classifyBootstrapPostcondition({
          exitStatus: 0,
          configExists: false,
          configValid: false,
          linkedMarkerExists: false,
        }).accepted,
    },
    {
      id: "invalid_config_fails_closed",
      passed:
        !classifyBootstrapPostcondition({
          exitStatus: 1,
          configExists: true,
          configValid: false,
          linkedMarkerExists: false,
        }).accepted,
    },
    {
      id: "linked_marker_fails_closed",
      passed:
        !classifyBootstrapPostcondition({
          exitStatus: 0,
          configExists: true,
          configValid: true,
          linkedMarkerExists: true,
        }).accepted,
    },
  ];
  return {
    passed: tests.every((test) => test.passed),
    tests_passed: tests.filter((test) => test.passed).length,
    tests_total: tests.length,
    tests,
  };
}

function execute() {
  if (!process.argv.includes("--execute")) {
    fail("use o comando publicado com o sinal explícito --execute");
    return;
  }
  const readiness = inspectBootstrapReadiness();
  if (readiness.status === "local_supabase_bootstrap_complete") {
    const evidencePath = resolve(root, contract.evidence.path);
    const existingEvidence = readJsonIfPresent(evidencePath);
    if (
      existingEvidence?.status !==
        "local_supabase_bootstrap_complete" ||
      existingEvidence?.authorization?.receipt_present !== true ||
      existingEvidence?.execution?.postcondition_verified !== true
    ) {
      const authorization = readiness.authorization;
      if (
        authorization.receipt_valid !== true ||
        authorization.not_expired !== true ||
        authorization.fingerprint_matches !== true ||
        authorization.forbids_remote !== true
      ) {
        fail(
          "config válido encontrado, mas a reconciliação exige a autorização original ainda válida",
        );
        return;
      }
      const reconciledEvidence = acceptedEvidence(
        readiness,
        readiness.local_config,
        {
          mode: "verified_existing_postcondition",
          command_replayed: false,
          exit_zero: null,
          cli_exit_status_available: false,
        },
      );
      persistEvidence(reconciledEvidence);
      console.log(JSON.stringify(reconciledEvidence, null, 2));
      return;
    }
    console.log(
      JSON.stringify(
        {
          status: "local_supabase_bootstrap_already_complete",
          config_sha256: readiness.local_config.sha256,
          remote_accessed: false,
          database_started: false,
          migration_applied: false,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!readiness.readiness.ready_to_execute) {
    fail(
      `preflight incompleto: ${readiness.readiness.blockers.join(", ")}`,
    );
    return;
  }
  const configPath = resolve(root, contract.project.config_path);
  const linkMarker = resolve(
    root,
    contract.project.linked_project_marker,
  );
  if (existsSync(configPath)) {
    fail("config existente não pode ser sobrescrito");
    return;
  }
  if (existsSync(linkMarker)) {
    fail("marcador de projeto linked detectado");
    return;
  }
  const command = commandContract([]);
  if (!command.accepted) {
    fail("contrato do comando local foi rejeitado");
    return;
  }
  const env = sanitizedLocalEnvironment();
  mkdirSync(env.HOME, { recursive: true });
  const cliPath = resolve(root, command.executable);
  const result = spawnSync(cliPath, [command.command, ...command.args], {
    cwd: root,
    encoding: "utf8",
    env,
    timeout: 30_000,
  });
  const localConfig = parseLocalConfig(configPath);
  const postcondition = classifyBootstrapPostcondition({
    exitStatus: result.status,
    configExists: localConfig.exists,
    configValid: localConfig.valid,
    linkedMarkerExists: existsSync(linkMarker),
  });
  if (!postcondition.accepted) {
    fail(
      `supabase init local não foi aceito: ${postcondition.status}; saída bruta não foi persistida`,
    );
    return;
  }
  const evidence = acceptedEvidence(readiness, localConfig, {
    mode: postcondition.status,
    command_replayed: true,
    exit_zero: postcondition.exit_zero,
    cli_exit_status_available: Number.isInteger(result.status),
  });
  persistEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
}

function main() {
  if (process.argv.includes("--self-test")) {
    const result = selfTest();
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }
  execute();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

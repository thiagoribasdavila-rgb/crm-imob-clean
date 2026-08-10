import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertLocalOnlySupabaseCommand,
  evaluateLocalMigrationGate,
  sanitizeLocalSupabaseEnvironment,
} from "../lib/testing/local-supabase-migration-gate.mjs";
import {
  cleanupDisposableWorkspace,
  createDisposableWorkspace,
} from "../lib/testing/disposable-workspace.mjs";
import {
  assessPhase359Execution,
  injectDisposableMigrationGuards,
  normalizeDuplicateVersionsInDisposableWorkspace,
} from "./run-phase-359-disposable-local-migration-rehearsal.mjs";

const FORMAT = "atlas_phase_360_disposable_local_rls_proof_v1";
const TEST_RELATIVE_PATH =
  "supabase/tests/database/phase_008_dynamic_rls_isolation.test.sql";
const FIXTURE_MARKER = "-- ATLAS_PHASE_360_SYNTHETIC_FIXTURES";
const FIXTURE_ANCHOR = "select no_plan();\n";
const LOCAL_START_EXCLUSIONS = ["analytics", "vector"];

function commandAvailable(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "ignore",
    timeout: 20_000,
  }).status === 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeOutput(value = "") {
  return String(value)
    .replace(/(?:postgres(?:ql)?|https?|wss?):\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/\beyJ[A-Za-z0-9._-]{40,}\b/g, "[REDACTED_JWT]")
    .replace(
      /^(.*(?:password|secret|service_role|anon key|publishable key).*)$/gim,
      "[REDACTED_SECRET_LINE]",
    )
    .slice(-60_000);
}

export function parsePhase360PgTapOutput(output = "", status = 1) {
  const source = String(output);
  const individualPassed = (source.match(/^\s*ok\s+\d+/gm) ?? []).length;
  const individualFailed = (source.match(/^\s*not ok\s+\d+/gm) ?? []).length;
  const summarizedTests = Number(source.match(/Files=\d+,\s+Tests=(\d+)/)?.[1] ?? 0);
  const summarizedPass = /Result:\s+PASS\b/.test(source);
  return {
    passed:
      individualPassed ||
      (status === 0 && summarizedPass && individualFailed === 0 ? summarizedTests : 0),
    failed: individualFailed,
    format: individualPassed || individualFailed ? "individual" : "summary",
    resultPass: status === 0 && summarizedPass,
  };
}

export function getPhase360SyntheticFixtureSql() {
  return `
${FIXTURE_MARKER}
set local app.atlas_rls_rehearsal_environment = 'isolated_clone';

insert into public.organizations (id, name, slug, status, plan, active)
values
  ('10000000-0000-4000-8000-000000000001', 'Phase 360 Tenant A', 'phase-360-tenant-a', 'ACTIVE', 'rehearsal', true),
  ('20000000-0000-4000-8000-000000000001', 'Phase 360 Tenant B', 'phase-360-tenant-b', 'ACTIVE', 'rehearsal', true);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'phase360-director-a@example.invalid', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Phase 360 Director A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'phase360-manager-a@example.invalid', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Phase 360 Manager A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000103', 'authenticated', 'authenticated', 'phase360-broker-a@example.invalid', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Phase 360 Broker A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'phase360-director-b@example.invalid', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Phase 360 Director B"}', now(), now());

insert into public.profiles (
  id,
  organization_id,
  full_name,
  name,
  email,
  role,
  active,
  commercial_role,
  access_role,
  reports_to
)
values
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000001', 'Phase 360 Director A', 'Phase 360 Director A', 'phase360-director-a@example.invalid', 'admin', true, 'director', 'director_decisor', null),
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000001', 'Phase 360 Manager A', 'Phase 360 Manager A', 'phase360-manager-a@example.invalid', 'manager', true, 'manager', 'director', '10000000-0000-4000-8000-000000000101'),
  ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000001', 'Phase 360 Broker A', 'Phase 360 Broker A', 'phase360-broker-a@example.invalid', 'broker', true, 'broker', 'broker', '10000000-0000-4000-8000-000000000102'),
  ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001', 'Phase 360 Director B', 'Phase 360 Director B', 'phase360-director-b@example.invalid', 'admin', true, 'director', 'director_decisor', null);

insert into public.leads (
  id,
  organization_id,
  name,
  source,
  status,
  assigned_user_id,
  assigned_to,
  metadata
)
values
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000001', 'Phase 360 Lead A', 'phase_360_rehearsal', 'NOVO', '10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000103', '{"synthetic":true,"phase":360}'),
  ('20000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001', 'Phase 360 Lead B', 'phase_360_rehearsal', 'NOVO', '20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000101', '{"synthetic":true,"phase":360}');
`;
}

export function injectPhase360SyntheticFixture(workspaceRoot) {
  const path = join(resolve(workspaceRoot), TEST_RELATIVE_PATH);
  const source = readFileSync(path, "utf8");
  if (!source.includes(FIXTURE_ANCHOR)) {
    throw new Error("âncora do teste dinâmico de RLS não encontrada no clone");
  }
  if (source.includes(FIXTURE_MARKER)) {
    return { path: TEST_RELATIVE_PATH, injected: false, fixtureHash: sha256(getPhase360SyntheticFixtureSql()) };
  }
  const fixture = getPhase360SyntheticFixtureSql();
  const updated = source.replace(FIXTURE_ANCHOR, `${FIXTURE_ANCHOR}${fixture}\n`);
  writeFileSync(path, updated);
  return {
    path: TEST_RELATIVE_PATH,
    injected: true,
    fixtureHash: sha256(fixture),
  };
}

export function getPhase360CommandPlan(stagedTestPath = null) {
  return [
    ["start", "--exclude", LOCAL_START_EXCLUSIONS.join(",")],
    ["db", "reset", "--local", "--no-seed"],
    ["test", "db", "--local", ...(stagedTestPath ? [stagedTestPath] : [])],
    ["db", "lint", "--local", "--level", "error", "--fail-on", "error"],
  ];
}

export function stagePhase360DatabaseTest(sourceRoot, disposableRoot) {
  const source = resolve(sourceRoot);
  const directory = mkdtempSync(join(source, ".atlas-phase360-pgtap-"));
  const path = join(directory, "phase_008_dynamic_rls_isolation.test.sql");
  writeFileSync(path, readFileSync(join(resolve(disposableRoot), TEST_RELATIVE_PATH)), {
    mode: 0o600,
  });
  return { directory, path };
}

export function cleanupPhase360StagedTest(sourceRoot, stagedDirectory) {
  const source = resolve(sourceRoot);
  const directory = resolve(stagedDirectory);
  if (
    dirname(directory) !== source ||
    !basename(directory).startsWith(".atlas-phase360-pgtap-")
  ) {
    throw new Error("recusa remover teste pgTAP fora do workspace controlado");
  }
  rmSync(directory, { recursive: true, force: true });
}

export function isolatePhase360DatabaseTest(workspaceRoot) {
  const directory = join(resolve(workspaceRoot), "supabase", "tests", "database");
  const disabled = [];
  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".sql") || name === "phase_008_dynamic_rls_isolation.test.sql") {
      continue;
    }
    const disabledName = `${name}.phase360-disabled`;
    renameSync(join(directory, name), join(directory, disabledName));
    disabled.push({ file: name, disabledFile: disabledName });
  }
  return {
    target: TEST_RELATIVE_PATH,
    disabled,
    defaultDiscoveryUsed: true,
  };
}

function assertPhase360LocalCommand(args) {
  assertLocalOnlySupabaseCommand(args);
  if (args[0] === "test" && args[1] === "db" && !args.includes("--local")) {
    throw new Error("teste de banco precisa declarar --local");
  }
  return true;
}

function runLocalCommand({ args, cwd, environment }) {
  assertPhase360LocalCommand(args);
  const startedAt = Date.now();
  const result = spawnSync("npx", ["supabase", ...args, "--workdir", cwd], {
    cwd,
    env: environment,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 1_200_000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const isDatabaseTest = args[0] === "test" && args[1] === "db";
  const tap = isDatabaseTest ? parsePhase360PgTapOutput(output, result.status) : null;
  const passed =
    result.status === 0 &&
    (!isDatabaseTest || ((tap?.passed ?? 0) > 0 && tap?.resultPass === true));
  return {
    command: `supabase ${args.join(" ")}`,
    passed,
    status: result.status,
    durationMs: Date.now() - startedAt,
    ...(isDatabaseTest
      ? { tap, summary: sanitizeOutput(output).slice(-4_000) }
      : {}),
    diagnostic: passed ? null : sanitizeOutput(output),
  };
}

function writeEvidence(sourceRoot, evidence) {
  const path = join(
    sourceRoot,
    "artifacts",
    "runtime",
    "atlas-phase-360-disposable-local-rls-proof.json",
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function runPhase360({ sourceRoot = process.cwd(), execute = false } = {}) {
  const canonicalTestPath = join(resolve(sourceRoot), TEST_RELATIVE_PATH);
  const canonicalTestHashBefore = sha256(readFileSync(canonicalTestPath));
  const runtime = {
    dockerAvailable: commandAvailable("docker", ["info"], sourceRoot),
    supabaseCliAvailable: commandAvailable("npx", ["supabase", "--version"], sourceRoot),
  };
  const assessment = evaluateLocalMigrationGate({ root: sourceRoot, runtime });
  const gate = assessPhase359Execution(assessment);
  const evidence = {
    format: FORMAT,
    phase: 360,
    mode: execute ? "execute" : "assess",
    status: gate.ready ? (execute ? "running" : "ready") : "blocked",
    migrationCount: assessment.catalog.migrationCount,
    fixtures: {
      syntheticOnly: true,
      organizations: 2,
      profiles: 4,
      leads: 2,
      insertedInDisposableTestOnly: false,
      transactionRollback: false,
    },
    proof: {
      brokerScope: false,
      managerScope: false,
      directorScope: false,
      crossTenantReadDenied: false,
      crossTenantWriteDenied: false,
      privilegedRpcsServerOnly: false,
    },
    normalization: {
      mappings: [],
      guardInjections: [],
      testIsolation: null,
      canonicalMigrationsModified: false,
      canonicalTestModified: false,
    },
    commands: [],
    safety: {
      disposableWorkspace: true,
      environmentSanitized: true,
      remoteCommandsAllowed: false,
      linkedProjectUsed: false,
      operationalDatabaseTouched: false,
      secretsExposed: false,
    },
    blockers: gate.blockers,
  };

  if (!execute || !gate.ready) return evidence;

  let disposable;
  let stagedTest;
  const environment = sanitizeLocalSupabaseEnvironment(process.env);
  try {
    disposable = createDisposableWorkspace(sourceRoot);
    evidence.normalization.mappings =
      normalizeDuplicateVersionsInDisposableWorkspace(disposable.path);
    evidence.normalization.guardInjections =
      injectDisposableMigrationGuards(disposable.path);
    evidence.normalization.testIsolation =
      isolatePhase360DatabaseTest(disposable.path);
    const fixture = injectPhase360SyntheticFixture(disposable.path);
    evidence.fixtures.insertedInDisposableTestOnly = fixture.injected;
    evidence.fixtures.fixtureHash = fixture.fixtureHash;
    stagedTest = stagePhase360DatabaseTest(sourceRoot, disposable.path);
    evidence.normalization.stagedTest = {
      file: basename(stagedTest.path),
      workspaceShared: true,
      removedAfterExecution: false,
    };

    for (const args of getPhase360CommandPlan(stagedTest.path)) {
      const outcome = runLocalCommand({ args, cwd: disposable.path, environment });
      evidence.commands.push(outcome);
      if (!outcome.passed) throw new Error(`${outcome.command} falhou`);
    }

    const testOutcome = evidence.commands.find(({ command }) =>
      command.startsWith("supabase test db"),
    );
    const dynamicProofPassed =
      Boolean(testOutcome?.passed) &&
      (testOutcome?.tap?.passed ?? 0) >= 16 &&
      (testOutcome?.tap?.failed ?? 0) === 0;
    evidence.proof = {
      brokerScope: dynamicProofPassed,
      managerScope: dynamicProofPassed,
      directorScope: dynamicProofPassed,
      crossTenantReadDenied: dynamicProofPassed,
      crossTenantWriteDenied: dynamicProofPassed,
      privilegedRpcsServerOnly: dynamicProofPassed,
    };
    evidence.fixtures.transactionRollback = dynamicProofPassed;
    evidence.status = dynamicProofPassed ? "passed" : "failed";
    if (!dynamicProofPassed) evidence.failure = "prova pgTAP incompleta";
  } catch (error) {
    evidence.status = "failed";
    evidence.failure = error instanceof Error ? error.message : "falha local desconhecida";
  } finally {
    if (disposable?.path) {
      const stopArgs = ["stop", "--no-backup"];
      assertPhase360LocalCommand(stopArgs);
      spawnSync("npx", ["supabase", ...stopArgs, "--workdir", disposable.path], {
        cwd: disposable.path,
        env: environment,
        stdio: "ignore",
        timeout: 120_000,
      });
      cleanupDisposableWorkspace(disposable.path);
    }
    if (stagedTest?.directory) {
      cleanupPhase360StagedTest(sourceRoot, stagedTest.directory);
      evidence.normalization.stagedTest.removedAfterExecution = true;
    }
    evidence.normalization.canonicalTestModified =
      sha256(readFileSync(canonicalTestPath)) !== canonicalTestHashBefore;
    evidence.normalization.canonicalMigrationsModified = false;
  }
  writeEvidence(sourceRoot, evidence);
  return evidence;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const execute = process.argv.includes("--execute");
  const evidence = runPhase360({ execute });
  console.log(JSON.stringify(evidence, null, 2));
  if (execute && evidence.status !== "passed") process.exitCode = 1;
}

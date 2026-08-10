import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
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

const FORMAT = "atlas_phase_359_disposable_local_migration_rehearsal_v1";
const VERSION_PATTERN = /^(\d{14})_(.+\.sql)$/;
const LOCAL_MIGRATION_GUARDS = ["app.atlas_meta_ledger_environment"];
const LOCAL_START_EXCLUSIONS = ["analytics", "vector"];
const GUARDED_MIGRATION_PATCHES = [
  {
    file: "../migration-rehearsals/20260719092358_phase_029_meta_permit_atomic_ledger.sql",
    anchor: "begin;\n",
    statement: "set local app.atlas_meta_ledger_environment = 'staging_clone';",
  },
];

function commandAvailable(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: "ignore",
    timeout: 20_000,
  }).status === 0;
}

export function assessPhase359Execution(assessment) {
  const blockers = assessment.blockers.filter(
    (blocker) => blocker !== "duplicate-migration-versions",
  );
  return {
    ready: blockers.length === 0,
    blockers,
    duplicateVersions:
      assessment.catalog?.duplicates?.map(({ version, files }) => ({
        version,
        fileCount: files.length,
      })) ?? [],
    strategy: "normalize_duplicates_in_disposable_workspace_only",
    canonicalMigrationsModified: false,
    remoteCommandsAllowed: false,
  };
}

export function normalizeDuplicateVersionsInDisposableWorkspace(workspaceRoot) {
  const directory = join(resolve(workspaceRoot), "supabase", "migrations");
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const parsed = files.map((name) => {
    const match = name.match(VERSION_PATTERN);
    if (!match) throw new Error(`migration inválida no clone: ${name}`);
    return { name, version: match[1], suffix: match[2] };
  });
  const groups = new Map();
  for (const migration of parsed) {
    const group = groups.get(migration.version) ?? [];
    group.push(migration);
    groups.set(migration.version, group);
  }
  const occupied = new Set(parsed.map(({ version }) => version));
  const distinctVersions = [...occupied].sort();
  const mappings = [];

  for (const [version, group] of [...groups.entries()].sort()) {
    if (group.length < 2) continue;
    const nextVersion = distinctVersions.find((candidate) => candidate > version);
    let candidate = BigInt(version);
    for (const migration of group.slice(1)) {
      do candidate += 1n;
      while (occupied.has(candidate.toString().padStart(14, "0")));
      const normalizedVersion = candidate.toString().padStart(14, "0");
      if (nextVersion && normalizedVersion >= nextVersion) {
        throw new Error(`sem espaço seguro para normalizar a versão ${version}`);
      }
      const normalizedName = `${normalizedVersion}_${migration.suffix}`;
      renameSync(join(directory, migration.name), join(directory, normalizedName));
      occupied.add(normalizedVersion);
      mappings.push({
        originalVersion: version,
        normalizedVersion,
        file: migration.name,
        normalizedFile: normalizedName,
      });
    }
  }
  return mappings;
}

export function injectDisposableMigrationGuards(workspaceRoot) {
  const directory = join(resolve(workspaceRoot), "supabase", "migrations");
  return GUARDED_MIGRATION_PATCHES.map(({ file, anchor, statement }) => {
    const path = join(directory, file);
    const source = readFileSync(path, "utf8");
    if (!source.includes(anchor)) {
      throw new Error(`âncora do guard ausente no clone: ${file}`);
    }
    const updated = source.includes(statement)
      ? source
      : source.replace(anchor, `${anchor}\n${statement}\n`);
    writeFileSync(path, updated);
    return {
      file,
      setting: statement.match(/app\.[a-z0-9_]+/)?.[0] ?? "unknown",
      injected: updated !== source,
    };
  });
}

export function getPhase359CommandPlan() {
  return [
    ["start", "--exclude", LOCAL_START_EXCLUSIONS.join(",")],
    ["db", "reset", "--local", "--no-seed"],
    ["migration", "list", "--local"],
    ["db", "lint", "--local", "--level", "error", "--fail-on", "error"],
  ];
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

function summarizeDbLintOutput(value = "") {
  const source = String(value);
  const start = source.indexOf('{"results"');
  if (start < 0) return [];
  const end = source.indexOf('\n', start);
  const json = source.slice(start, end < 0 ? undefined : end);
  try {
    const parsed = JSON.parse(json);
    return (parsed.results ?? []).flatMap((item) =>
      (item.issues ?? []).map((issue) => ({
        function: item.function ?? "unknown",
        level: issue.level ?? "unknown",
        sqlState: issue.sqlState ?? null,
        message: issue.message ?? "unknown lint issue",
      })),
    );
  } catch {
    return [];
  }
}

function writeEvidence(sourceRoot, evidence) {
  const path = join(
    sourceRoot,
    "artifacts",
    "runtime",
    "atlas-phase-359-local-migration-rehearsal.json",
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  return path;
}

function runLocalCommand({ args, cwd, environment }) {
  assertLocalOnlySupabaseCommand(args);
  const startedAt = Date.now();
  const result = spawnSync("npx", ["supabase", ...args, "--workdir", cwd], {
    cwd,
    env: environment,
    encoding: "utf8",
    stdio: "pipe",
    timeout: 1_200_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    command: `supabase ${args.join(" ")}`,
    passed: result.status === 0,
    status: result.status,
    durationMs: Date.now() - startedAt,
    diagnostic: result.status === 0 ? null : sanitizeOutput(output),
    ...(args[0] === "db" && args[1] === "lint"
      ? { lintIssues: summarizeDbLintOutput(output) }
      : {}),
  };
}

export function runPhase359({ sourceRoot = process.cwd(), execute = false } = {}) {
  const runtime = {
    dockerAvailable: commandAvailable("docker", ["info"], sourceRoot),
    supabaseCliAvailable: commandAvailable("npx", ["supabase", "--version"], sourceRoot),
  };
  const assessment = evaluateLocalMigrationGate({ root: sourceRoot, runtime });
  const gate = assessPhase359Execution(assessment);
  const evidence = {
    format: FORMAT,
    phase: 359,
    mode: execute ? "execute" : "assess",
    status: gate.ready ? (execute ? "running" : "ready") : "blocked",
    migrationCount: assessment.catalog.migrationCount,
    duplicateVersions: gate.duplicateVersions,
    normalization: {
      strategy: gate.strategy,
      mappings: [],
      guardInjections: [],
      canonicalMigrationsModified: false,
    },
    commands: [],
    safety: {
      disposableWorkspace: true,
      environmentSanitized: true,
      localMigrationGuards: LOCAL_MIGRATION_GUARDS.map((guard) => guard.split("=")[0]),
      remoteCommandsAllowed: false,
      linkedProjectUsed: false,
      operationalDatabaseTouched: false,
      secretsExposed: false,
    },
    blockers: gate.blockers,
  };

  if (!execute || !gate.ready) return evidence;

  let disposable;
  const environment = sanitizeLocalSupabaseEnvironment(process.env);
  try {
    disposable = createDisposableWorkspace(sourceRoot);
    evidence.normalization.mappings =
      normalizeDuplicateVersionsInDisposableWorkspace(disposable.path);
    evidence.normalization.guardInjections =
      injectDisposableMigrationGuards(disposable.path);
    const commands = getPhase359CommandPlan();
    for (const args of commands) {
      const outcome = runLocalCommand({ args, cwd: disposable.path, environment });
      evidence.commands.push(outcome);
      if (!outcome.passed) throw new Error(`${outcome.command} falhou`);
    }
    evidence.status = "passed";
  } catch (error) {
    evidence.status = "failed";
    evidence.failure = error instanceof Error ? error.message : "falha local desconhecida";
  } finally {
    if (disposable?.path) {
      const stopArgs = ["stop", "--no-backup"];
      assertLocalOnlySupabaseCommand(stopArgs);
      spawnSync("npx", ["supabase", ...stopArgs, "--workdir", disposable.path], {
        cwd: disposable.path,
        env: environment,
        stdio: "ignore",
        timeout: 120_000,
      });
      cleanupDisposableWorkspace(disposable.path);
    }
  }
  writeEvidence(sourceRoot, evidence);
  return evidence;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const execute = process.argv.includes("--execute");
  const evidence = runPhase359({ execute });
  console.log(JSON.stringify(evidence, null, 2));
  if (execute && evidence.status !== "passed") process.exitCode = 1;
}

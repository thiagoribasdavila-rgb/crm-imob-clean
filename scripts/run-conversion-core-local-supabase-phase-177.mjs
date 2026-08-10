import { spawnSync } from "node:child_process";
import {
  assertLocalOnlySupabaseCommand,
  evaluateLocalMigrationGate,
  sanitizeLocalSupabaseEnvironment,
} from "../lib/testing/local-supabase-migration-gate.mjs";
import {
  cleanupDisposableWorkspace,
  createDisposableWorkspace,
} from "../lib/testing/disposable-workspace.mjs";

const execute = process.argv.includes("--execute");
const sourceRoot = process.cwd();

function available(command, args) {
  return spawnSync(command, args, {
    cwd: sourceRoot,
    encoding: "utf8",
    stdio: "ignore",
    timeout: 20_000,
  }).status === 0;
}

const runtime = {
  dockerAvailable: available("docker", ["info"]),
  supabaseCliAvailable: available("npx", ["supabase", "--version"]),
};
const assessment = evaluateLocalMigrationGate({ root: sourceRoot, runtime });
console.log(JSON.stringify({ phase: 177, mode: execute ? "execute" : "assess", ...assessment }, null, 2));

if (!execute) process.exit(0);
if (!assessment.ready) {
  console.error(`[phase-177] Execução recusada: ${assessment.blockers.join(", ")}`);
  process.exit(1);
}

let disposable;
const childEnvironment = sanitizeLocalSupabaseEnvironment(process.env);
const run = (args) => {
  assertLocalOnlySupabaseCommand(args);
  const result = spawnSync("npx", ["supabase", ...args, "--workdir", disposable.path], {
    cwd: disposable.path,
    env: childEnvironment,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`supabase ${args.join(" ")} falhou`);
};

try {
  disposable = createDisposableWorkspace(sourceRoot);
  run(["start"]);
  run(["db", "reset", "--local", "--no-seed"]);
  run(["migration", "list", "--local"]);
  run(["db", "lint", "--local", "--level", "error", "--fail-on", "error"]);
  console.log("[phase-177] PASS — migrations aplicadas e auditadas somente na pilha local descartável.");
} catch (error) {
  console.error(`[phase-177] Falha local isolada: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  process.exitCode = 1;
} finally {
  if (disposable?.path) {
    const stopArgs = ["stop", "--no-backup"];
    assertLocalOnlySupabaseCommand(stopArgs);
    spawnSync("npx", ["supabase", ...stopArgs, "--workdir", disposable.path], {
      cwd: disposable.path,
      env: childEnvironment,
      stdio: "ignore",
    });
    cleanupDisposableWorkspace(disposable.path);
  }
}

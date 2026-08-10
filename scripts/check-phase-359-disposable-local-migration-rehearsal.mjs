import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assessPhase359Execution,
  getPhase359CommandPlan,
  injectDisposableMigrationGuards,
  normalizeDuplicateVersionsInDisposableWorkspace,
} from "./run-phase-359-disposable-local-migration-rehearsal.mjs";

const checks = [];
const expect = (passed, label) => checks.push([label, passed]);

const duplicateOnly = assessPhase359Execution({
  blockers: ["duplicate-migration-versions"],
  catalog: { duplicates: [{ version: "20260716235900", files: ["a.sql", "b.sql"] }] },
});
expect(
  duplicateOnly.ready && duplicateOnly.canonicalMigrationsModified === false,
  "duplicidade isolável não autoriza alteração canônica",
);

const remoteRuntimeMissing = assessPhase359Execution({
  blockers: ["duplicate-migration-versions", "docker-runtime-unavailable"],
  catalog: { duplicates: [] },
});
expect(
  !remoteRuntimeMissing.ready && remoteRuntimeMissing.blockers.includes("docker-runtime-unavailable"),
  "runtime ausente continua bloqueando a execução",
);

const commandPlan = getPhase359CommandPlan();
expect(
  commandPlan[0]?.join(" ") === "start --exclude analytics,vector" &&
    commandPlan.slice(1).every((command) => command.includes("--local")),
  "ensaio exclui somente telemetria local incompatível e mantém comandos locais",
);

const fixture = mkdtempSync(join(tmpdir(), "atlas-phase359-check-"));
try {
  const migrations = join(fixture, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true });
  for (const file of [
    "20260716235900_a.sql",
    "20260716235900_b.sql",
    "20260717000000_c.sql",
  ]) {
    writeFileSync(join(migrations, file), "select 1;\n");
  }
  const mappings = normalizeDuplicateVersionsInDisposableWorkspace(fixture);
  const normalized = readdirSync(migrations).sort();
  expect(
    mappings.length === 1 && normalized.includes("20260716235901_b.sql"),
    "normalização temporária gera versão única e determinística",
  );
  expect(
    existsSync(join(migrations, "20260716235900_a.sql")) &&
      existsSync(join(migrations, "20260717000000_c.sql")),
    "migrations sem conflito permanecem intactas",
  );
  const guardedMigration = join(
    migrations,
    "20260719092358_phase_029_meta_permit_atomic_ledger.sql",
  );
  writeFileSync(guardedMigration, "begin;\nselect 1;\n");
  const injections = injectDisposableMigrationGuards(fixture);
  const guardedSource = readFileSync(guardedMigration, "utf8");
  expect(
    injections.length === 1 &&
      guardedSource.includes("set local app.atlas_meta_ledger_environment = 'staging_clone';"),
    "guard de staging é satisfeito apenas na migration do clone descartável",
  );
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (failures.length) {
  console.error(`PHASE 359 CHECK: FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`PHASE 359 CHECK: PASSED (${checks.length}/${checks.length})`);

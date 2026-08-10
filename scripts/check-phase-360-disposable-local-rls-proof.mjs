import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getPhase360CommandPlan,
  getPhase360SyntheticFixtureSql,
  injectPhase360SyntheticFixture,
  isolatePhase360DatabaseTest,
  parsePhase360PgTapOutput,
  cleanupPhase360StagedTest,
  stagePhase360DatabaseTest,
} from "./run-phase-360-disposable-local-rls-proof.mjs";

const checks = [];
const expect = (passed, label) => checks.push([label, Boolean(passed)]);

const fixtureSql = getPhase360SyntheticFixtureSql();
expect(
  fixtureSql.includes("app.atlas_rls_rehearsal_environment = 'isolated_clone'") &&
    fixtureSql.includes("phase360-director-a@example.invalid") &&
    fixtureSql.includes("phase360-director-b@example.invalid"),
  "fixtures sintéticas declaram clone isolado e dois tenants",
);
expect(
  (fixtureSql.match(/insert into public\.organizations/g) ?? []).length === 1 &&
    (fixtureSql.match(/insert into public\.profiles/g) ?? []).length === 1 &&
    (fixtureSql.match(/insert into public\.leads/g) ?? []).length === 1,
  "fixture popula organizações, hierarquia e leads sem seed operacional",
);
expect(
  fixtureSql.includes("'director', 'director_decisor', null") &&
    fixtureSql.includes("'manager', 'director'") &&
    fixtureSql.includes("'broker', 'broker'"),
  "hierarquia cobre diretor decisor, gerente e corretor",
);

const stagedCommandPath = "/workspace/.atlas-phase360-pgtap-test/proof.test.sql";
const commands = getPhase360CommandPlan(stagedCommandPath);
expect(
  commands[0]?.join(" ") === "start --exclude analytics,vector" &&
    commands.slice(1).every((command) => command.includes("--local")),
  "todo comando de banco e teste permanece explicitamente local",
);
expect(
  commands.some(
    (command) =>
      command[0] === "test" &&
      command[1] === "db" &&
      command.includes("--local") &&
      command.includes(stagedCommandPath),
  ),
  "plano aponta o pgTAP local para arquivo compartilhável com Docker",
);
expect(
  parsePhase360PgTapOutput(
    "Files=1, Tests=18,  1 wallclock secs\nResult: PASS\n",
    0,
  ).passed === 18 &&
    parsePhase360PgTapOutput("not ok 4 - tenant vazou\nResult: FAIL\n", 1).failed === 1,
  "coletor entende saídas resumida e individual do pgTAP",
);

const root = mkdtempSync(join(tmpdir(), "atlas-phase360-check-"));
try {
  const directory = join(root, "supabase", "tests", "database");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "phase_008_dynamic_rls_isolation.test.sql");
  writeFileSync(path, "begin;\nselect no_plan();\nselect * from finish();\nrollback;\n");
  writeFileSync(join(directory, "another.test.sql"), "select 1;\n");
  const isolation = isolatePhase360DatabaseTest(root);
  const first = injectPhase360SyntheticFixture(root);
  const once = readFileSync(path, "utf8");
  const second = injectPhase360SyntheticFixture(root);
  const twice = readFileSync(path, "utf8");
  expect(first.injected && !second.injected, "injeção no clone é idempotente");
  expect(once === twice, "segunda injeção não duplica fixtures");
  expect(
    once.indexOf("ATLAS_PHASE_360_SYNTHETIC_FIXTURES") <
      once.indexOf("select * from finish()"),
    "fixtures entram antes do contrato e do rollback do teste",
  );
  expect(
    isolation.defaultDiscoveryUsed &&
      isolation.target.endsWith("phase_008_dynamic_rls_isolation.test.sql") &&
      isolation.disabled.length === 1 &&
      isolation.disabled[0].file === "another.test.sql",
    "clone deixa somente a prova dinâmica visível ao pgTAP",
  );
  const staged = stagePhase360DatabaseTest(root, root);
  expect(
    readFileSync(staged.path, "utf8") === readFileSync(path, "utf8"),
    "staging copia exatamente a prova preparada no clone",
  );
  cleanupPhase360StagedTest(root, staged.directory);
  expect(
    !readFileSync(path, "utf8").includes("phase360-staging-mutated"),
    "limpeza do staging preserva o teste de origem",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (failures.length) {
  console.error(`PHASE 360 CHECK: FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`PHASE 360 CHECK: PASSED (${checks.length}/${checks.length})`);

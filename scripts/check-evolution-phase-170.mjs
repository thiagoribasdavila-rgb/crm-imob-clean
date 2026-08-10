import { readFileSync } from "node:fs";

const root = process.cwd();
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  }
};
const includes = (path, pattern, label = pattern) => assert(read(path).includes(pattern), `${path} precisa conter ${label}`);
const excludes = (path, pattern, label = pattern) => assert(!read(path).includes(pattern), `${path} não deve conter ${label}`);

const helperPath = "lib/release/meta-track-release-gate.ts";
const configPath = "config/evolution-phase-170-meta-release-gate.json";
const docsPath = "docs/EVOLUTION_PHASE_170_META_RELEASE_GATE.md";
const testPath = "tests/contracts/meta-track-release-gate.test.mjs";

assert(JSON.parse(read("config/evolution-program-3000.json")).currentPhase >= 170, "programa deve ter alcançado currentPhase 170");
includes(helperPath, 'META_TRACK_RELEASE_GATE_SCHEMA = "atlas.meta.release-gate.v1"');
for (const status of ["blocked", "pending_director_approval", "approved_for_single_build"]) includes(helperPath, `"${status}"`);
for (const phase of [166, 167, 168, 169]) includes(helperPath, `"phase-${phase}"`);
for (const check of ["contracts", "typecheck", "lint", "secret-scan"]) includes(helperPath, `"${check}"`);
includes(helperPath, 'approval.scope !== "single_release_build"');
includes(helperPath, 'approval.approverRole === "director"');
includes(helperPath, "zipAllowed: false");
includes(helperPath, "productionAllowed: false");
for (const forbidden of ["fetch(", "createClient(", "child_process", "execSync", "spawn(", "npm run build", "zip ", "META_ACCESS_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"]) {
  excludes(helperPath, forbidden);
}
includes(configPath, '"phase": 170');
includes(configPath, '"currentDecision": "pending_director_approval"');
includes(configPath, '"buildAllowed": false');
includes(configPath, '"zipGenerated": false');
includes(docsPath, "Nenhum build, ZIP, deploy ou acesso à produção");
includes(testPath, "somente diretor com escopo explícito autoriza um único build");
includes("package.json", '"evolution:phase-170:check"');

if (!process.exitCode) console.log("✅ Fase 170 validada: regressão consolidada e release bloqueada até decisão explícita da diretoria.");

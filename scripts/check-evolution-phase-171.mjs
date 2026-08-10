import { readFileSync } from "node:fs";

const root = process.cwd();
const read = (path) => readFileSync(`${root}/${path}`, "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  }
};
const includes = (path, pattern, label = pattern) =>
  assert(read(path).includes(pattern), `${path} precisa conter ${label}`);
const excludes = (path, pattern, label = pattern) =>
  assert(!read(path).includes(pattern), `${path} não deve conter ${label}`);

const helperPath = "lib/release/operational-delivery-program.ts";
const configPath = "config/evolution-phase-171-operational-memory-delivery-program.json";
const docsPath = "docs/EVOLUTION_PHASE_171_OPERATIONAL_MEMORY_DELIVERY_PROGRAM.md";
const testPath = "tests/contracts/operational-delivery-program.test.mjs";

assert(
  JSON.parse(read("config/evolution-program-3000.json")).currentPhase >= 171,
  "programa deve avançar para currentPhase 171",
);
includes(helperPath, '"atlas.operational-delivery-program.v1"');
for (const status of ["blocked", "in_progress", "ready_for_homologation", "homologated"]) {
  includes(helperPath, `"${status}"`);
}
includes(helperPath, "duplicate-capability-owner");
includes(helperPath, "missing-verified-evidence");
includes(helperPath, 'approval.scope === "large_module_package"');
includes(helperPath, "productionMutationAllowed: false");
for (const forbidden of [
  "fetch(",
  "createClient(",
  "child_process",
  "execSync",
  "spawn(",
  "npm run build",
  "zip ",
  "META_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  excludes(helperPath, forbidden);
}
for (const moduleId of [
  "conversion-core",
  "commercial-memory",
  "marketing-feedback",
  "communication-continuity",
  "release-hardening",
]) {
  includes(configPath, `"id": "${moduleId}"`);
}
includes(configPath, '"buildAllowed": false');
includes(configPath, '"zipGenerated": false');
includes(docsPath, "Um único build limpo e um único ZIP Hostinger");
includes(testPath, "ZIP só é liberado para módulo grande homologado pela diretoria");
includes("package.json", '"evolution:phase-171:check"');

if (!process.exitCode) {
  console.log("✅ Fase 171 validada: memória factual, antirredundância e entregas grandes governadas.");
}


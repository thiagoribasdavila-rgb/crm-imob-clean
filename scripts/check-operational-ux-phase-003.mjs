import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  config: "config/operational-ux-phase-003-data-boundaries.json",
  analytics: "lib/analytics/lead-intake.ts",
  endpoint: "app/api/v1/analytics/lead-intake/route.ts",
  dashboard: "app/(crm)/dashboard/page.tsx",
  tests: "tests/contracts/lead-intake-analytics.test.mjs",
  docs: "docs/ATLAS_ONE_UX_PHASE_003_DATA_BOUNDARIES.md"
};
let failures = 0;
const assert = (condition, message) => {
  if (condition) console.log(`PASS: ${message}`);
  else { failures += 1; console.error(`FAIL: ${message}`); }
};
for (const [name, relative] of Object.entries(files)) assert(fs.existsSync(path.join(root, relative)), `${name}: ${relative}`);
if (failures) process.exit(1);
const config = JSON.parse(fs.readFileSync(path.join(root, files.config), "utf8"));
const analytics = fs.readFileSync(path.join(root, files.analytics), "utf8");
const endpoint = fs.readFileSync(path.join(root, files.endpoint), "utf8");
const dashboard = fs.readFileSync(path.join(root, files.dashboard), "utf8");
const tests = fs.readFileSync(path.join(root, files.tests), "utf8");
assert(config.phase === "operational-ux-003", "identificador da Fase 3 é estável");
assert(config.status === "implemented-awaiting-real-sample", "implementação não é confundida com prova real");
assert(config.classifications.length === 3, "operação, histórico e ambiguidade estão separados");
assert(config.decisionGate.unknownValuesMustNeverBecomeZero === true, "dado desconhecido não vira zero fictício");
assert(config.databaseChanges === false && config.recordsMutated === false, "fase não altera schema nem registros");
for (const token of ["classifyLeadProvenance", "historical_import", "ambiguous", "executiveSnapshot", "decisionReady"]) assert(analytics.includes(token), `contrato analítico contém ${token}`);
for (const field of ["source_normalized", "import_batch_id", "metadata"]) assert(endpoint.includes(field), `endpoint lê ${field}`);
assert(dashboard.includes("AMOSTRA INSUFICIENTE"), "Sala de Comando explicita amostra insuficiente");
assert(dashboard.includes("importações históricas separadas da operação"), "Sala de Comando explica a fronteira histórica");
assert(tests.includes("separa importação histórica e origem ambígua"), "regressão da fronteira de dados está coberta");
if (failures) { console.error(`\nFase 3 reprovada: ${failures} contrato(s) divergente(s).`); process.exit(1); }
console.log("\nFase 3 aprovada: operação diária, memória histórica e amostra insuficiente permanecem separadas.");

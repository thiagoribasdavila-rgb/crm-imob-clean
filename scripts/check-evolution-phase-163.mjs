import { readFileSync } from "node:fs";

const root = process.cwd();

function read(path) {
  return readFileSync(`${root}/${path}`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  }
}

function includes(path, pattern, label = pattern) {
  const source = read(path);
  assert(source.includes(pattern), `${path} precisa conter ${label}`);
}

const pagePath = "app/(crm)/marketing/campaigns/page.tsx";
const configPath = "config/evolution-phase-163-meta-official-test-handoff-console.json";
const programPath = "config/evolution-program-3000.json";
const docsPath = "docs/EVOLUTION_PHASE_163_META_OFFICIAL_TEST_HANDOFF_CONSOLE.md";
const packagePath = "package.json";

const program = JSON.parse(read(programPath));
assert(program.currentPhase === 163, "programa deve avançar para currentPhase 163");

includes(pagePath, "OfficialMetaTestStep");
includes(pagePath, "officialMetaTestGuardrails");
includes(pagePath, "officialMetaTestSteps");
includes(pagePath, "officialMetaTestReadySteps");
includes(pagePath, "copyOfficialMetaTestRunbook");
includes(pagePath, 'data-v30-phase="163-meta-official-test-handoff-console"');
includes(pagePath, "Ensaio oficial controlado");
includes(pagePath, "Pronto para apertar o botão certo.");
includes(pagePath, "sem disparar CAPI real");
includes(pagePath, "Copiar roteiro do ensaio");
includes(pagePath, "Ir para ensaio Meta");
includes(pagePath, "OfficialMetaTestStepCard");
includes(pagePath, "official_test_handoff_no_delivery_from_campaigns_page");

includes(configPath, '"phase": 163');
includes(configPath, "Meta Official Test Handoff Console");
includes(configPath, "não dispara CAPI real");

includes(docsPath, "Fase 163");
includes(docsPath, "Meta Official Test Handoff Console");
includes(docsPath, "não dispara CAPI real nesta página");
includes(docsPath, "Events Manager");

includes(packagePath, '"evolution:phase-163:check"');

if (!process.exitCode) {
  console.log("✅ Fase 163 validada: handoff oficial de teste Meta implementado sem disparo real.");
}

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
const routePath = "app/api/v1/integrations/meta/test-readiness/route.ts";
const configPath = "config/evolution-phase-162-meta-test-connector-readiness-gate.json";
const programPath = "config/evolution-program-3000.json";
const docsPath = "docs/EVOLUTION_PHASE_162_META_TEST_CONNECTOR_READINESS_GATE.md";
const packagePath = "package.json";

const program = JSON.parse(read(programPath));
assert(program.currentPhase === 162, "programa deve avançar para currentPhase 162");

includes(routePath, 'export const dynamic = "force-dynamic"');
includes(routePath, 'export const runtime = "nodejs"');
includes(routePath, "META_CONVERSIONS_ACCESS_TOKEN");
includes(routePath, "META_TEST_EVENT_CODE");
includes(routePath, "readiness_only_no_delivery");
includes(routePath, "não aciona Meta API");
includes(routePath, "Não expõe tokens");

includes(pagePath, 'data-v30-phase="162-meta-test-connector-readiness-gate"');
includes(pagePath, "MetaConnectorReadinessPayload");
includes(pagePath, "MetaConnectorReadinessCheck");
includes(pagePath, "connectorReadiness");
includes(pagePath, "loadConnectorReadiness");
includes(pagePath, "MetaConnectorReadinessCheckCard");
includes(pagePath, "Gate de conector Meta");
includes(pagePath, "Ambiente pronto sem expor chaves.");
includes(pagePath, "Revalidar ambiente");
includes(pagePath, "Abrir integrações Meta");

includes(configPath, '"phase": 162');
includes(configPath, "Meta Test Connector Readiness Gate");
includes(configPath, "readiness_only_no_delivery");

includes(docsPath, "Fase 162");
includes(docsPath, "readiness_only_no_delivery");
includes(docsPath, "Não aciona Meta API");
includes(docsPath, "Não expõe tokens");
includes(docsPath, "META_TEST_EVENT_CODE");

includes(packagePath, '"evolution:phase-162:check"');

if (!process.exitCode) {
  console.log("✅ Fase 162 validada: gate seguro de prontidão do conector Meta implementado.");
}

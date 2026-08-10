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
  assert(read(path).includes(pattern), `${path} precisa conter ${label}`);
}

function excludes(path, pattern, label = pattern) {
  assert(!read(path).includes(pattern), `${path} não deve conter ${label}`);
}

const pagePath = "app/(crm)/marketing/campaigns/page.tsx";
const routePath = "app/api/v1/integrations/meta/test-execution-gates/route.ts";
const helperPath = "lib/meta/test-execution-gate.ts";
const configPath = "config/evolution-phase-167-meta-execution-gate.json";
const programPath = "config/evolution-program-3000.json";
const docsPath = "docs/EVOLUTION_PHASE_167_META_EXECUTION_GATE.md";
const packagePath = "package.json";

const program = JSON.parse(read(programPath));
assert(program.currentPhase === 167, "programa deve avançar para currentPhase 167");

includes(helperPath, 'META_TEST_EXECUTION_GATE_SCHEMA = "atlas.meta.execution-gate.v1"');
includes(helperPath, 'META_TEST_EXECUTION_CONFIRMATION = "AUTORIZAR_TESTE_META_UNICO"');
includes(helperPath, "META_TEST_EXECUTION_GATE_TTL_MS = 10 * 60 * 1000");
includes(helperPath, '"delivery_count_zero"');
includes(helperPath, "deliveryAuthorized: true");
includes(helperPath, "dryRunApproved: true");
includes(helperPath, "externalEventSent: false");
includes(helperPath, "maxDeliveries: 1");
includes(helperPath, 'createHash("sha256")');
for (const pii of ["phone", "email", "cpf", "income", "document"]) {
  excludes(helperPath, `${pii}:`, `campo pessoal ${pii} no gate`);
}

includes(routePath, 'accessRoles: ["admin", "director_decisor", "director"]');
includes(routePath, "enforceRateLimit");
includes(routePath, 'const gateEventType = "meta.test_lead.execution_authorized"');
includes(routePath, "META_TEST_EXECUTION_CONFIRMATION");
includes(routePath, "Number.isFinite(approvalExpiresAtMs)");
includes(routePath, "fingerprintFrozenMetaTestPayload(payload) !== payloadFingerprint");
includes(routePath, '.eq("organization_id", organizationId)');
includes(routePath, '.from("atlas_events")');
includes(routePath, "reused: true");
includes(routePath, 'source: "meta.execution-gate"');
for (const forbidden of [
  "queueMetaConversion",
  "integration_outbox",
  "meta_conversion_events",
  "META_CONVERSIONS_ACCESS_TOKEN",
  "graph.facebook.com",
  "fetch(",
]) {
  excludes(routePath, forbidden, `capacidade externa proibida: ${forbidden}`);
}

includes(pagePath, 'data-phase="167-meta-execution-gate"');
includes(pagePath, "/api/v1/integrations/meta/test-execution-gates");
includes(pagePath, 'confirmation: "AUTORIZAR_TESTE_META_UNICO"');
includes(pagePath, "Autorizar teste único por 10 min");
includes(pagePath, "Dry-run estrutural: aprovado");
includes(pagePath, "Evento externo enviado: não");

includes(configPath, '"phase": 167');
includes(configPath, "Meta Controlled Execution Gate");
includes(configPath, '"externalDelivery": false');
includes(docsPath, "Fase 167");
includes(docsPath, "não chama CAPI");
includes(packagePath, '"evolution:phase-167:check"');

if (!process.exitCode) {
  console.log("✅ Fase 167 validada: gate explícito, temporário, idempotente, de uso único e sem entrega externa.");
}

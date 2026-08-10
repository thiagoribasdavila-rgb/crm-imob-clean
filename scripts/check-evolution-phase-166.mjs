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
const approvalRoutePath = "app/api/v1/integrations/meta/test-approvals/route.ts";
const payloadRoutePath = "app/api/v1/integrations/meta/test-payloads/route.ts";
const helperPath = "lib/meta/test-event-payload.ts";
const configPath = "config/evolution-phase-166-meta-payload-freeze.json";
const programPath = "config/evolution-program-3000.json";
const docsPath = "docs/EVOLUTION_PHASE_166_META_PAYLOAD_FREEZE.md";
const packagePath = "package.json";

const program = JSON.parse(read(programPath));
assert(program.currentPhase === 166, "programa deve avançar para currentPhase 166");

includes(helperPath, 'META_TEST_PAYLOAD_SCHEMA = "atlas.meta.test-event.v1"');
includes(helperPath, "metaCandidateContext");
includes(helperPath, "fingerprintMetaCandidate");
includes(helperPath, "fingerprintFrozenMetaTestPayload");
includes(helperPath, "deliveryAuthorized: false");
includes(helperPath, "externalEventSent: false");
for (const pii of ["phone", "email", "cpf", "income", "document"]) {
  excludes(helperPath, `${pii}:`, `campo pessoal ${pii} no payload congelado`);
}

includes(approvalRoutePath, "fingerprintMetaCandidate");
excludes(approvalRoutePath, 'createHash("sha256")', "segunda implementação de fingerprint");

includes(payloadRoutePath, 'accessRoles: ["admin", "director_decisor", "director"]');
includes(payloadRoutePath, "enforceRateLimit");
includes(payloadRoutePath, 'const approvalEventType = "meta.test_lead.approved"');
includes(payloadRoutePath, 'const frozenEventType = "meta.test_lead.payload_frozen"');
includes(payloadRoutePath, "Number.isFinite(expiresAtMs)");
includes(payloadRoutePath, "APPROVED_CONTEXT_CHANGED");
includes(payloadRoutePath, "fingerprintMetaCandidate(candidate) !== approvedContextFingerprint");
includes(payloadRoutePath, "fingerprintFrozenMetaTestPayload");
includes(payloadRoutePath, "deliveryAuthorized: false");
includes(payloadRoutePath, "externalEventSent: false");
includes(payloadRoutePath, '.from("atlas_events")');
includes(payloadRoutePath, "reused: true");
for (const forbidden of [
  "queueMetaConversion",
  "integration_outbox",
  "meta_conversion_events",
  "META_CONVERSIONS_ACCESS_TOKEN",
  "graph.facebook.com",
  "fetch(",
]) {
  excludes(payloadRoutePath, forbidden, `capacidade externa proibida: ${forbidden}`);
}

includes(pagePath, 'data-phase="166-meta-payload-freeze"');
includes(pagePath, "/api/v1/integrations/meta/test-payloads");
includes(pagePath, "Congelar payload mínimo");
includes(pagePath, "Payload governado congelado");
includes(pagePath, "Entrega autorizada: não");
includes(pagePath, "Evento externo enviado: não");

includes(configPath, '"phase": 166');
includes(configPath, "Meta Approved Payload Freeze");
includes(docsPath, "Fase 166");
includes(docsPath, "não chama CAPI");
includes(packagePath, '"evolution:phase-166:check"');

if (!process.exitCode) {
  console.log("✅ Fase 166 validada: payload Meta mínimo congelado, auditável, idempotente e sem entrega externa.");
}

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

const routePath = "app/api/v1/integrations/meta/test-deliveries/route.ts";
const retiredPath = "app/api/v1/integrations/meta/conversion-test/route.ts";
const helperPath = "lib/meta/test-delivery.ts";
const pagePath = "app/(crm)/marketing/campaigns/page.tsx";
const configPath = "config/evolution-phase-168-meta-controlled-test-delivery.json";
const docsPath = "docs/EVOLUTION_PHASE_168_META_CONTROLLED_TEST_DELIVERY.md";
const programPath = "config/evolution-program-3000.json";

assert(JSON.parse(read(programPath)).currentPhase >= 168, "programa deve ter alcançado ao menos currentPhase 168");
includes(helperPath, 'META_TEST_DELIVERY_SCHEMA = "atlas.meta.delivery-receipt.v1"');
includes(helperPath, 'META_TEST_DELIVERY_CONFIRMATION = "ENVIAR_TESTE_META_AGORA"');
includes(helperPath, 'META_TEST_DELIVERY_SCOPE = "meta.test-lead.delivery"');
includes(helperPath, "productionEnabled: false");
includes(helperPath, 'return `atlas-test-${idempotencyKey}`');
for (const pii of ["phone:", "email:", "cpf:", "accessToken:", "cronSecret:"]) excludes(helperPath, pii, `campo sensível ${pii}`);

includes(routePath, 'accessRoles: ["admin", "director_decisor", "director"]');
includes(routePath, "META_TEST_DELIVERY_CONFIRMATION");
includes(routePath, "fingerprintMetaTestExecutionGate");
includes(routePath, "fingerprintFrozenMetaTestPayload");
includes(routePath, "fingerprintMetaCandidate(candidate) !== frozenPayload.approvedContextFingerprint");
includes(routePath, "claimIdempotency");
includes(routePath, "buildMetaTestEventId(gatePayload.idempotencyKey)");
includes(routePath, "queueMetaConversion");
includes(routePath, "/api/v2/outbox/process");
includes(routePath, 'config.mode !== "test"');
includes(routePath, "Number(response.events_received) !== 1");
includes(routePath, 'event_type: deliveryEventType');
includes(routePath, 'source: "meta.controlled-test-delivery"');
includes(routePath, "completeIdempotency");
excludes(routePath, "graph.facebook.com", "chamada Meta direta fora do worker");
excludes(routePath, "Math.random", "identidade aleatória");

includes(retiredPath, "status: 410");
excludes(retiredPath, "queueMetaConversion", "capacidade de envio legada");
includes(pagePath, 'data-phase="168-meta-controlled-test-delivery"');
includes(pagePath, "/api/v1/integrations/meta/test-deliveries");
includes(pagePath, 'confirmation: "ENVIAR_TESTE_META_AGORA"');
includes(pagePath, "Enviar 1 evento ao dataset de teste");
includes(pagePath, "eventsReceived");

includes(configPath, '"phase": 168');
includes(configPath, "Meta Controlled Test Delivery");
includes(docsPath, "Fase 168");
includes(docsPath, "Nenhum teste local dispara evento externo");
includes("package.json", '"evolution:phase-168:check"');

if (!process.exitCode) console.log("✅ Fase 168 validada: entrega Meta única, explícita, idempotente, em modo teste e com recibo sanitizado.");

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

const helperPath = "lib/meta/test-delivery-observability.ts";
const routePath = "app/api/v1/integrations/meta/test-delivery-observability/route.ts";
const pagePath = "app/(crm)/marketing/campaigns/page.tsx";
const configPath = "config/evolution-phase-169-meta-test-delivery-observability.json";
const docsPath = "docs/EVOLUTION_PHASE_169_META_TEST_DELIVERY_OBSERVABILITY.md";

assert(JSON.parse(read("config/evolution-program-3000.json")).currentPhase >= 169, "programa deve estar na currentPhase 169 ou posterior");
includes(helperPath, 'META_TEST_DELIVERY_OBSERVATION_SCHEMA = "atlas.meta.delivery-observation.v1"');
for (const status of ["confirmed", "waiting_local_worker", "failed_before_external_attempt", "external_result_inconclusive", "dead_letter"]) {
  includes(helperPath, `"${status}"`);
}
includes(helperPath, "externalAttempted || input.status === \"delivered\"");
includes(helperPath, "Não reenviar");
includes(routePath, "export async function GET");
includes(routePath, 'accessRoles: ["admin", "director_decisor", "director"]');
includes(routePath, '.from("meta_conversion_events")');
includes(routePath, '.from("atlas_events")');
includes(routePath, '.eq("organization_id", organizationId)');
includes(routePath, "automaticResend: false");
includes(routePath, "productionEnabled: false");
excludes(routePath, "export async function POST", "endpoint de reenvio");
excludes(routePath, "fetch(", "chamada externa");
excludes(routePath, "queueMetaConversion", "novo enfileiramento");
includes(routePath, "hasFailure: Boolean(conversion.last_error)", "conversão segura da falha para indicador booleano");
excludes(routePath, "lastError: conversion.last_error", "exposição de erro bruto na resposta");
includes(pagePath, 'data-phase="169-meta-test-delivery-observability"');
includes(pagePath, "/api/v1/integrations/meta/test-delivery-observability");
includes(pagePath, "Atualizar diagnóstico");
includes(pagePath, "Reenvio:");
includes(configPath, '"phase": 169');
includes(docsPath, "Fase 169");
includes(docsPath, "Nenhum teste local dispara evento externo");
includes("package.json", '"evolution:phase-169:check"');

if (!process.exitCode) console.log("✅ Fase 169 validada: observabilidade sanitizada, isolamento tenant e nenhum reenvio automático.");

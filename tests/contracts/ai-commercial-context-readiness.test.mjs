import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildAiCommercialContextReadiness } from "../../lib/analytics/ai-commercial-context-readiness.ts";

const memory = (overrides = {}) => ({
  development_id: "development-1",
  stage_key: "qualificacao",
  broker_id: "broker-1",
  recommended_action_key: "schedule_visit",
  interaction_count: 3,
  last_interaction_at: "2026-08-10T12:00:00.000Z",
  expires_at: "2026-12-10T12:00:00.000Z",
  ...overrides,
});

test("mede contexto completo sem devolver identificadores", () => {
  const result = buildAiCommercialContextReadiness({
    memories: [memory()],
    now: "2026-08-10T13:00:00.000Z",
  });

  assert.equal(result.context.completenessPercent, 100);
  assert.equal(result.readiness.decisionSupportReady, true);
  assert.equal(result.containsPii, false);
  assert.equal(result.readsMessageContent, false);
  assert.equal(result.automaticDecision, false);
  assert.equal(JSON.stringify(result).includes("development-1"), false);
  assert.equal(JSON.stringify(result).includes("broker-1"), false);
});

test("separa as quatro lacunas essenciais", () => {
  const result = buildAiCommercialContextReadiness({
    memories: [
      memory({ development_id: null }),
      memory({ stage_key: "inventada" }),
      memory({ broker_id: null }),
      memory({ recommended_action_key: "inventada" }),
    ],
    now: "2026-08-10T13:00:00.000Z",
  });

  assert.equal(result.gaps.missingProject, 1);
  assert.equal(result.gaps.invalidStage, 1);
  assert.equal(result.gaps.missingResponsible, 1);
  assert.equal(result.gaps.invalidNextAction, 1);
  assert.equal(result.context.complete, 0);
});

test("não promove leitura truncada como pronta", () => {
  const result = buildAiCommercialContextReadiness({
    memories: [memory()],
    sourceTotal: 10,
    observedLimit: 1,
  });

  assert.equal(result.source.truncated, true);
  assert.equal(result.readiness.decisionSupportReady, false);
  assert.equal(result.readiness.requiresHumanReview, true);
});

test("API e interface preservam diretoria, tenant e privacidade", () => {
  const api = readFileSync(
    "app/api/v1/integrations/whatsapp/commercial-context-readiness/route.ts",
    "utf8",
  );
  const page = readFileSync(
    "app/(crm)/integrations/whatsapp/page.tsx",
    "utf8",
  );

  assert.ok((api.match(/\.eq\("organization_id", organizationId\)/g) ?? []).length >= 2);
  assert.match(api, /commercialRole === "director"/);
  assert.match(api, /lead_commercial_memory_states/);
  assert.match(api, /development_id,stage_key,broker_id,recommended_action_key/);
  assert.doesNotMatch(api, /\.from\("messages"\)/);
  assert.doesNotMatch(api, /\.select\([^)]*(content|phone|email|name)/s);
  assert.match(page, /data-phase="368-commercial-context-readiness"/);
  assert.match(page, /CONTEXTO ESTRUTURADO/);
  assert.match(page, /evidence_only/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("verificador só altera a lead explicitamente designada e confirmada", async () => {
  const script = await source("scripts/verify-phase-353-first-action-runtime.mjs");
  assert.match(script, /ATLAS_RUNTIME_TEST_LEAD_ID/);
  assert.match(script, /ATLAS_RUNTIME_MUTATION_CONFIRM/);
  assert.match(script, /phase-353-first-action/);
  assert.match(script, /blocked_without_mutation/);
  assert.doesNotMatch(script, /\.from\("leads"\)[\s\S]+\.limit\(1\)[\s\S]+first-action/);
});

test("verificador exige corretor, sessão real, organização e RLS", async () => {
  const script = await source("scripts/verify-phase-353-first-action-runtime.mjs");
  assert.match(script, /signInWithPassword/);
  assert.match(script, /\/api\/v1\/auth\/me/);
  assert.match(script, /BROKER\|CORRETOR/);
  assert.match(script, /lead designada não está visível para o corretor pelo RLS/);
  assert.match(script, /visibleLead\.organization_id !== organizationId/);
});

test("verificador prova as quatro persistências e replay sem duplicidade", async () => {
  const script = await source("scripts/verify-phase-353-first-action-runtime.mjs");
  assert.match(script, /\.from\("activities"\)/);
  assert.match(script, /\.from\("tasks"\)/);
  assert.match(script, /\.from\("leads"\)/);
  assert.match(script, /\.from\("lead_events"\)/);
  assert.match(script, /"Idempotency-Key": idempotencyKey/g);
  assert.match(script, /replay\.activityId !== first\.activityId/);
  assert.match(script, /replayedWithoutDuplication: true/);
});

test("verificador não requer nem imprime credencial privilegiada", async () => {
  const script = await source("scripts/verify-phase-353-first-action-runtime.mjs");
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*(?:password|publicKey|access_token)/i);
  assert.match(script, /secretsPrinted: false/);
});

test("verificador grava evidência sanitizada apenas depois da prova completa", async () => {
  const script = await source("scripts/verify-phase-353-first-action-runtime.mjs");
  assert.match(script, /ATLAS_PHASE_353_EVIDENCE_FILE/);
  assert.match(script, /writeJsonAtomically\(evidenceFile, evidence\)/);
  assert.match(script, /writeFile\(temporaryPath/);
  assert.match(script, /rename\(temporaryPath, absolutePath\)/);
  assert.ok(script.indexOf("replayedWithoutDuplication: true") < script.indexOf("writeJsonAtomically(evidenceFile, evidence)"));
});

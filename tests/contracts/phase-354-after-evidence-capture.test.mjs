import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(".");
const script = path.join(root, "scripts/capture-phase-354-lead-intake-after.mjs");

test("captura posterior é autenticada, agregada, tenant-safe e somente leitura", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /signInWithPassword/);
  assert.match(source, /\/api\/v1\/auth\/me/);
  assert.match(source, /\/api\/v1\/analytics\/lead-intake\?days=/);
  assert.match(source, /hierarchyApplied !== true/);
  assert.match(source, /personalDataReturned !== false/);
  assert.match(source, /responseOrganizationId !== organizationId/);
  assert.match(source, /\(admin\|director\|diretor\)/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /\.from\(|insert\(|update\(|upsert\(|delete\(/);
});

test("pré-flight sem credenciais não consulta remoto nem cria artefato", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-phase-354-after-"));
  const artifact = path.join(directory, "after.json");
  const env = { ...process.env, ATLAS_PHASE_354_AFTER_EVIDENCE_FILE: artifact };
  for (const name of [
    "ATLAS_BASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "ATLAS_TEST_EMAIL",
    "ATLAS_TEST_PASSWORD",
  ]) delete env[name];

  const execution = spawnSync(process.execPath, [script], { cwd: root, env, encoding: "utf8" });
  assert.equal(execution.status, 2);
  const output = JSON.parse(execution.stdout);
  assert.equal(output.status, "blocked_without_remote_read");
  assert.equal(output.artifactWritten, false);
  assert.equal(output.safety.remoteMutation, false);
  await assert.rejects(access(artifact));
});

test("contrato só grava métrica conhecida e amostra positiva em arquivo atômico", async () => {
  const source = await readFile(script, "utf8");
  assert.match(source, /finiteMetric\(data\.baseline\?\.medianFirstActionMinutes\)/);
  assert.match(source, /positiveInteger\(data\.baseline\?\.firstActionMeasured\)/);
  assert.match(source, /metric === null \|\| measuredFirstActions === null/);
  assert.match(source, /atlas\.phase-354-lead-intake-after\.v1/);
  assert.match(source, /authenticated_after_snapshot_captured/);
  assert.match(source, /writeFile\(temporaryPath/);
  assert.match(source, /rename\(temporaryPath, absolutePath\)/);
});

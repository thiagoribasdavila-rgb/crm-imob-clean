import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildMigrationCollisionDossier,
  extractMigrationObjectEvidence,
} from "../../lib/testing/supabase-migration-collision-dossier.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "atlas-collision-dossier-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, "supabase", "migrations", name), source);
  }
  return root;
}

test("extracts referenced objects without retaining SQL bodies", () => {
  const objects = extractMigrationObjectEvidence(
    "create table public.events(id uuid); alter table public.events enable row level security;",
  );
  assert.deepEqual(objects, [{ type: "table", name: "public.events" }]);
});

test("classifies overlapping and disjoint duplicate migrations deterministically", () => {
  const root = fixture({
    "20260808000000_first.sql": "alter table public.leads add column if not exists score int;",
    "20260808000000_second.sql": "create index if not exists lead_idx on public.leads(id);",
    "20260808000100_third.sql": "select 1;",
    "20260808000100_fourth.sql": "create table public.events(id uuid);",
  });
  try {
    const dossier = buildMigrationCollisionDossier(root);
    assert.equal(dossier.collisionCount, 2);
    assert.equal(dossier.collisions[0].comparisons[0].classification, "object_overlap");
    assert.equal(dossier.collisions[1].comparisons[0].classification, "disjoint_but_order_ambiguous");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("never authorizes rename, apply, reset, or migration history repair", () => {
  const root = fixture({
    "20260808000000_first.sql": "select 1;",
    "20260808000000_second.sql": "select 2;",
  });
  try {
    const dossier = buildMigrationCollisionDossier(root);
    const collision = dossier.collisions[0];
    assert.equal(collision.status, "requires_remote_history_evidence");
    assert.equal(collision.safeToRename, false);
    assert.equal(collision.safeToApply, false);
    assert.equal(collision.safeToRepairHistory, false);
    assert.ok(dossier.forbiddenActions.includes("reset_operational_database"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sanitized workspace has unique migration versions and no SQL payload", () => {
  const dossier = buildMigrationCollisionDossier(process.cwd());
  assert.equal(dossier.collisionCount, 0);
  assert.equal(dossier.uniqueVersionCount, dossier.migrationCount);
  assert.equal(dossier.resolved, true);
  assert.equal(dossier.operationalEnvironmentTouched, false);
  assert.equal(dossier.sqlBodiesIncluded, false);
  assert.deepEqual(dossier.collisions, []);
});

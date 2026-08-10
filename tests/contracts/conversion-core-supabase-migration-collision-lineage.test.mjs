import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildMigrationCollisionLineage,
  loadHistoricalCollisionSnapshot,
  validateHistoricalCollisionSnapshot,
} from "../../lib/testing/supabase-migration-collision-lineage.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "atlas-collision-lineage-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, "supabase", "migrations", name), source);
  }
  return root;
}

function historicalSnapshot(mappings) {
  return {
    schema_version: "atlas.remote_migration_ledger_summary.v1",
    captured_at: "2026-07-23",
    capture_mode: "remote_metadata_read_only",
    execution: {
      remote_write_executed: false,
      migration_repair_executed: false,
      migration_push_executed: false,
      migration_renamed: false,
    },
    confirmed_collision_mappings: mappings,
  };
}

test("historical mapping is accepted only as a historical reference", () => {
  const snapshot = historicalSnapshot([{
    remote_version: "20260808010000",
    remote_name: "20260808000001_second",
    original_local_version: "20260808000000",
    canonical_intent_version: "20260808000001",
  }]);
  const validation = validateHistoricalCollisionSnapshot(snapshot);
  assert.equal(validation.valid, true);
  assert.equal(validation.reason, "historical_reference_valid_but_not_current");
});

test("invalid or mutation-tainted historical evidence cannot influence lineage", () => {
  const snapshot = historicalSnapshot([{
    remote_version: "20260808010000",
    remote_name: "20260808000000_first",
    original_local_version: "20260808000000",
  }]);
  snapshot.execution.migration_push_executed = true;
  assert.equal(validateHistoricalCollisionSnapshot(snapshot).reason, "historical_snapshot_mutation_tainted");
});

test("matches logical names while keeping every action fail-closed", () => {
  const root = fixture({
    "20260808000000_first.sql": "alter table public.leads add column if not exists score int;",
    "20260808000000_second.sql": "create table public.events(id uuid);",
  });
  try {
    const lineage = buildMigrationCollisionLineage({
      root,
      historicalSnapshot: historicalSnapshot([
        {
          remote_version: "20260808010000",
          remote_name: "20260808000000_first",
          original_local_version: "20260808000000",
        },
        {
          remote_version: "20260808010001",
          remote_name: "20260808000001_second",
          original_local_version: "20260808000000",
          canonical_intent_version: "20260808000001",
        },
      ]),
    });
    assert.equal(lineage.matchedHistoricalMappingCount, 2);
    assert.equal(lineage.collisions[0].files[1].historicalCanonicalIntentVersion, "20260808000001");
    assert.equal(lineage.historicalSnapshotAcceptedAsCurrent, false);
    assert.equal(lineage.currentNamedRemoteEvidenceAvailable, false);
    assert.equal(lineage.migrationFileRenamed, false);
    assert.equal(lineage.migrationApplied, false);
    assert.equal(lineage.directPushAuthorized, false);
    assert.equal(lineage.buildAuthorized, false);
    assert.equal(lineage.zipAuthorized, false);
    assert.equal(lineage.deployAuthorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workspace identifies all six historical lineages without retaining SQL bodies", () => {
  const lineage = buildMigrationCollisionLineage({
    root: process.cwd(),
    historicalSnapshot: loadHistoricalCollisionSnapshot(process.cwd()),
  });
  assert.equal(lineage.status, "blocked_current_named_remote_evidence_unavailable");
  assert.equal(lineage.collisionCount, 3);
  assert.equal(lineage.collidingFileCount, 6);
  assert.equal(lineage.historicalMappingCount, 6);
  assert.equal(lineage.matchedHistoricalMappingCount, 6);
  assert.equal(lineage.currentResolutionCount, 0);
  assert.equal(lineage.sqlBodiesIncluded, false);
  for (const collision of lineage.collisions) {
    for (const file of collision.files) {
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
      assert.equal(file.historicalMappingObserved, true);
      assert.equal(file.historicalReferenceOnly, true);
      assert.equal(Object.hasOwn(file, "source"), false);
      assert.equal(Object.hasOwn(file, "sql"), false);
    }
  }
});

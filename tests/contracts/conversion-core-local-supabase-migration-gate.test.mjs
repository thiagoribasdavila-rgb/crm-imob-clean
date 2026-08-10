import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertLocalOnlySupabaseCommand,
  evaluateLocalMigrationGate,
  sanitizeLocalSupabaseEnvironment,
  scanLocalMigrationCatalog,
} from "../../lib/testing/local-supabase-migration-gate.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "atlas-migration-gate-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(
    join(root, "supabase", "config.toml"),
    'project_id = "atlas-local"\n[db]\nmajor_version = 17\n[db.migrations]\nenabled = true\n',
  );
  for (const file of files) {
    writeFileSync(join(root, "supabase", "migrations", file), "select 1;\n");
  }
  return root;
}

test("detects duplicate migration versions without modifying files", () => {
  const root = fixture([
    "20260808000000_first.sql",
    "20260808000000_second.sql",
  ]);
  try {
    const catalog = scanLocalMigrationCatalog(root);
    assert.equal(catalog.ready, false);
    assert.equal(catalog.duplicates.length, 1);
    assert.equal(catalog.duplicates[0].files.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requires explicit local flags and rejects every remote escape hatch", () => {
  assert.equal(assertLocalOnlySupabaseCommand(["db", "reset", "--local", "--no-seed"]), true);
  assert.equal(assertLocalOnlySupabaseCommand(["migration", "list", "--local"]), true);
  assert.throws(() => assertLocalOnlySupabaseCommand(["db", "reset"]), /--local/);
  assert.throws(() => assertLocalOnlySupabaseCommand(["db", "reset", "--linked"]), /remota/);
  assert.throws(() => assertLocalOnlySupabaseCommand(["db", "push"]), /proibida/);
  assert.throws(() => assertLocalOnlySupabaseCommand(["migration", "repair"]), /proibida/);
  assert.throws(
    () => assertLocalOnlySupabaseCommand(["migration", "list", "--db-url=postgres://example"]),
    /remota/,
  );
});

test("removes operational Supabase and database credentials from child environment", () => {
  const environment = sanitizeLocalSupabaseEnvironment({
    PATH: "/usr/bin",
    HOME: "/tmp/home",
    SUPABASE_ACCESS_TOKEN: "secret",
    DATABASE_URL: "postgres://secret",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "secret",
    PGHOST: "remote",
  });
  assert.deepEqual(environment, { PATH: "/usr/bin", HOME: "/tmp/home" });
});

test("gate remains blocked until catalog and local runtime are both safe", () => {
  const root = fixture(["20260808000000_first.sql"]);
  try {
    const ready = evaluateLocalMigrationGate({
      root,
      runtime: { dockerAvailable: true, supabaseCliAvailable: true },
    });
    assert.equal(ready.ready, true);
    const blocked = evaluateLocalMigrationGate({
      root,
      runtime: { dockerAvailable: false, supabaseCliAvailable: true },
    });
    assert.equal(blocked.ready, false);
    assert.ok(blocked.blockers.includes("docker-runtime-unavailable"));
    assert.equal(blocked.operationalEnvironmentTouched, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


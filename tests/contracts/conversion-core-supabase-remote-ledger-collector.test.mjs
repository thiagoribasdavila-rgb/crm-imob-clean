import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assessRemoteMigrationLedgerCollection,
  parseSupabaseMigrationList,
} from "../../lib/testing/supabase-remote-migration-ledger-collector.mjs";

function linkedFixture(projectRef = "pozbrcsfthnhmnebfoxv") {
  const root = mkdtempSync(join(tmpdir(), "atlas-remote-ledger-"));
  mkdirSync(join(root, "supabase", ".temp"), { recursive: true });
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  writeFileSync(join(root, "supabase", ".temp", "project-ref"), projectRef);
  writeFileSync(join(root, "node_modules", ".bin", "supabase"), "fixture");
  return root;
}

test("preflight never contacts the remote environment", () => {
  let calls = 0;
  const result = assessRemoteMigrationLedgerCollection({ spawn: () => { calls += 1; } });
  assert.equal(result.status, "preflight_only_remote_not_contacted");
  assert.equal(result.remoteContacted, false);
  assert.equal(calls, 0);
});

test("collection requires both explicit authorization and the exact linked project", () => {
  let calls = 0;
  const blocked = assessRemoteMigrationLedgerCollection({ argv: ["--collect"], spawn: () => { calls += 1; } });
  assert.equal(blocked.status, "blocked_missing_explicit_authorization");
  assert.equal(calls, 0);

  const root = linkedFixture("wrong-project");
  try {
    const mismatch = assessRemoteMigrationLedgerCollection({
      root,
      argv: ["--collect"],
      env: { ATLAS_ALLOW_READ_ONLY_REMOTE_MIGRATION_HISTORY: "1" },
      spawn: () => { calls += 1; },
    });
    assert.equal(mismatch.status, "blocked_linked_project_mismatch");
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parser retains only migration versions and derived states", () => {
  const parsed = parseSupabaseMigrationList(`\n LOCAL | REMOTE | TIME (UTC)\n 20260716235900 | 20260716235900 | secret@example.com\n                | 20260722044340 | postgres://credential\n 20260808000100 |                | token=abc\n`);
  assert.deepEqual(parsed.localVersions, ["20260716235900", "20260808000100"]);
  assert.deepEqual(parsed.remoteVersions, ["20260716235900", "20260722044340"]);
  assert.equal(JSON.stringify(parsed).includes("secret@example.com"), false);
  assert.equal(JSON.stringify(parsed).includes("credential"), false);
  assert.equal(JSON.stringify(parsed).includes("token=abc"), false);
});

test("authorized collector uses a fixed read-only command and sanitizes evidence", () => {
  const root = linkedFixture();
  try {
    let invocation;
    const result = assessRemoteMigrationLedgerCollection({
      root,
      argv: ["--collect"],
      env: {
        ATLAS_ALLOW_READ_ONLY_REMOTE_MIGRATION_HISTORY: "1",
        DATABASE_URL: "postgres://must-not-leak",
        SUPABASE_DB_PASSWORD: "must-not-leak",
      },
      now: () => new Date("2026-08-08T12:00:00.000Z"),
      spawn: (command, args, options) => {
        invocation = { command, args, options };
        return {
          status: 0,
          stdout: " 20260716235900 | 20260716235900 | 2026-07-16\n | 20260722044340 | 2026-07-22\n",
          stderr: "",
        };
      },
    });
    assert.deepEqual(invocation.args, ["migration", "list", "--linked"]);
    assert.equal(invocation.options.shell, false);
    assert.equal(invocation.options.env.DATABASE_URL, undefined);
    assert.equal(invocation.options.env.SUPABASE_DB_PASSWORD, undefined);
    assert.equal(result.status, "remote_ledger_collected_read_only");
    assert.equal(result.remoteWriteExecuted, false);
    assert.equal(result.ledger.remoteVersionCount, 2);
    assert.equal(result.reconciliation.directPushAuthorized, false);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("pozbrcsfthnhmnebfoxv"), false);
    assert.equal(serialized.includes("must-not-leak"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unrecognized arguments fail closed before process execution", () => {
  let calls = 0;
  const result = assessRemoteMigrationLedgerCollection({
    argv: ["--db-url", "postgres://unsafe"],
    spawn: () => { calls += 1; },
  });
  assert.equal(result.status, "refused_unrecognized_arguments");
  assert.equal(result.unknownArgumentCount, 2);
  assert.equal(calls, 0);
});


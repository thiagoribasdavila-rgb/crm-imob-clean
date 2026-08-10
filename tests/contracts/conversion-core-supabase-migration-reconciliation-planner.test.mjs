import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildMigrationReconciliationPlan,
  validateCurrentRemoteLedgerEvidence,
} from "../../lib/testing/supabase-migration-reconciliation-planner.mjs";

const NOW = new Date("2026-08-08T15:00:00.000Z");

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "atlas-reconciliation-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(root, "supabase", "migrations", name), source);
  }
  return root;
}

function evidence(remoteVersions, overrides = {}) {
  return {
    schemaVersion: "atlas.remote_migration_ledger_collection.v1",
    status: "remote_ledger_collected_read_only",
    collectedAt: "2026-08-08T14:30:00.000Z",
    remoteContacted: true,
    remoteWriteExecuted: false,
    migrationApplied: false,
    migrationHistoryRepaired: false,
    databaseReset: false,
    ledger: { remoteVersions },
    ...overrides,
  };
}

test("fails closed when current remote evidence is missing", () => {
  const root = fixture({ "20260808000000_one.sql": "select 1;" });
  try {
    const plan = buildMigrationReconciliationPlan({ root, evidence: null, now: NOW });
    assert.equal(plan.status, "blocked_current_remote_evidence_unavailable");
    assert.equal(plan.evidenceAccepted, false);
    assert.equal(plan.operationalEnvironmentTouched, false);
    assert.equal(plan.directPushAuthorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("historical phase-010 evidence can never masquerade as current evidence", () => {
  const validation = validateCurrentRemoteLedgerEvidence({
    schema_version: "atlas.remote_migration_ledger_summary.v1",
    captured_at: "2026-07-23",
  }, { now: NOW });
  assert.deepEqual(validation, {
    valid: false,
    reason: "unsupported_or_historical_evidence_schema",
  });
});

test("rejects stale, future, malformed, or mutation-tainted evidence", () => {
  assert.equal(validateCurrentRemoteLedgerEvidence(
    evidence(["20260808000000"], { collectedAt: "2026-08-06T12:00:00.000Z" }),
    { now: NOW },
  ).reason, "current_remote_evidence_stale");
  assert.equal(validateCurrentRemoteLedgerEvidence(
    evidence(["20260808000000"], { collectedAt: "2026-08-09T12:00:00.000Z" }),
    { now: NOW },
  ).reason, "evidence_timestamp_in_future");
  assert.equal(validateCurrentRemoteLedgerEvidence(
    evidence(["not-a-version"]),
    { now: NOW },
  ).reason, "remote_version_ledger_invalid");
  assert.equal(validateCurrentRemoteLedgerEvidence(
    evidence(["20260808000000"], { remoteWriteExecuted: true }),
    { now: NOW },
  ).reason, "evidence_contains_forbidden_remote_mutation");
});

test("observes exact version parity without authorizing release or database writes", () => {
  const root = fixture({
    "20260808000000_one.sql": "select 1;",
    "20260808000100_two.sql": "select 2;",
  });
  try {
    const plan = buildMigrationReconciliationPlan({
      root,
      evidence: evidence(["20260808000100", "20260808000000"]),
      now: NOW,
    });
    assert.equal(plan.status, "version_parity_observed_actions_still_blocked");
    assert.equal(plan.comparison.exactVersionParity, true);
    assert.equal(plan.reconciliationComplete, true);
    assert.equal(plan.releaseGateStillBlocked, true);
    assert.equal(plan.migrationApplied, false);
    assert.equal(plan.buildAuthorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate local versions remain blocked even when the version exists remotely", () => {
  const root = fixture({
    "20260808000000_one.sql": "select 1;",
    "20260808000000_two.sql": "select 2;",
  });
  try {
    const plan = buildMigrationReconciliationPlan({
      root,
      evidence: evidence(["20260808000000"]),
      now: NOW,
    });
    assert.equal(plan.status, "blocked_duplicate_versions_require_named_remote_evidence");
    assert.equal(plan.collisions[0].presentRemotelyByVersion, true);
    assert.equal(plan.collisions[0].resolved, false);
    assert.equal(plan.migrationFileRenamed, false);
    assert.equal(plan.migrationHistoryRepaired, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


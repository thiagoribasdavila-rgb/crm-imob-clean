import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const config = JSON.parse(
  readFileSync(
    new URL(
      "../config/atlas-10x-phase-002-recovery.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

export function assessRecoveryReadiness({
  envAvailable,
  runtimeRequested,
  evidence = {},
}) {
  const required = {
    database_restore: Boolean(evidence.database_restore),
    storage_restore: Boolean(evidence.storage_restore),
    immutable_artifact: Boolean(evidence.immutable_artifact),
    previous_v3_release: Boolean(evidence.previous_v3_release),
    authenticated_smoke: Boolean(evidence.authenticated_smoke),
    recovery_metrics: Boolean(evidence.recovery_metrics),
    director_approval: Boolean(evidence.director_approval),
  };
  const passed = Object.values(required).filter(Boolean).length;
  const runtimeStatus = !runtimeRequested
    ? "not_executed"
    : envAvailable
      ? "evidence_required"
      : "blocked_missing_env";

  return {
    schema_version: config.schema_version,
    phase: config.phase,
    total_phases: config.total_phases,
    strategy: config.rollback_strategy,
    legacy_v2_accepted: false,
    status:
      passed === Object.keys(required).length
        ? "recovery_ready_for_human_decision"
        : "recovery_blocked",
    evidence: {
      passed,
      total: Object.keys(required).length,
      controls: required,
    },
    runtime: {
      requested: runtimeRequested,
      env_available: envAvailable,
      status: runtimeStatus,
    },
    release: {
      build_executed: false,
      package_created: false,
      production_ready: false,
      reason: "real_recovery_drill_and_human_approval_required",
    },
    next_phase: config.next_phase,
  };
}

function selfTest() {
  const blocked = assessRecoveryReadiness({
    envAvailable: false,
    runtimeRequested: false,
  });
  const evidenced = assessRecoveryReadiness({
    envAvailable: true,
    runtimeRequested: true,
    evidence: {
      database_restore: true,
      storage_restore: true,
      immutable_artifact: true,
      previous_v3_release: true,
      authenticated_smoke: true,
      recovery_metrics: true,
      director_approval: true,
    },
  });
  const failures = [];

  if (blocked.status !== "recovery_blocked")
    failures.push("missing_evidence_must_block");
  if (blocked.legacy_v2_accepted !== false)
    failures.push("legacy_v2_must_not_be_accepted");
  if (blocked.release.production_ready !== false)
    failures.push("assessment_must_not_promote_production");
  if (evidenced.status !== "recovery_ready_for_human_decision")
    failures.push("complete_evidence_not_recognized");
  if (evidenced.release.build_executed !== false)
    failures.push("build_policy_violated");

  if (failures.length) {
    console.error(`ATLAS RECOVERY SELF-TEST: FAILED (${failures.join(", ")})`);
    process.exit(1);
  }
  console.log("ATLAS RECOVERY SELF-TEST: PASSED");
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else {
    const report = assessRecoveryReadiness({
      envAvailable: existsSync(".env.local"),
      runtimeRequested: process.argv.includes("--runtime"),
    });
    console.log(JSON.stringify(report, null, 2));
  }
}

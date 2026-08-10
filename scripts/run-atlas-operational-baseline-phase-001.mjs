import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const config = JSON.parse(
  readFileSync(new URL("../config/atlas-10x-phase-001-operational-baseline.json", import.meta.url), "utf8"),
);

function runNpmScript(script) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const startedAt = Date.now();
  const result = spawnSync(command, ["run", script, "--silent"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });

  return {
    script,
    status: result.status === 0 ? "passed" : "failed",
    duration_ms: Date.now() - startedAt,
  };
}

export function summarizeBaseline({ codeChecks, envAvailable, runtimeRequested }) {
  const passed = codeChecks.filter((check) => check.status === "passed").length;
  const failed = codeChecks.filter((check) => check.status === "failed").length;
  const runtimeStatus = !runtimeRequested
    ? "not_executed"
    : envAvailable
      ? "executed"
      : "blocked_missing_env";

  return {
    schema_version: config.schema_version,
    phase: config.phase,
    total_phases: config.total_phases,
    status: failed === 0 ? "baseline_measured" : "baseline_measured_with_code_blockers",
    code: {
      passed,
      failed,
      total: codeChecks.length,
      checks: codeChecks,
    },
    runtime: {
      requested: runtimeRequested,
      env_available: envAvailable,
      status: runtimeStatus,
      checks: config.runtime_checks,
    },
    release: {
      build_executed: false,
      package_created: false,
      production_ready: false,
      reason: "runtime_evidence_and_human_release_gate_required",
    },
    next_phase: config.next_phase,
  };
}

function selfTest() {
  const approved = summarizeBaseline({
    codeChecks: [{ status: "passed" }, { status: "passed" }],
    envAvailable: false,
    runtimeRequested: false,
  });
  const blocked = summarizeBaseline({
    codeChecks: [{ status: "passed" }, { status: "failed" }],
    envAvailable: true,
    runtimeRequested: true,
  });

  const failures = [];
  if (approved.status !== "baseline_measured") failures.push("approved_status_invalid");
  if (approved.runtime.status !== "not_executed") failures.push("runtime_default_must_not_execute");
  if (approved.release.production_ready !== false) failures.push("baseline_must_not_promote_production");
  if (blocked.status !== "baseline_measured_with_code_blockers") failures.push("failed_check_not_blocking");
  if (blocked.runtime.status !== "executed") failures.push("runtime_requested_with_env_not_classified");

  if (failures.length) {
    console.error(`ATLAS BASELINE SELF-TEST: FAILED (${failures.join(", ")})`);
    process.exit(1);
  }

  console.log("ATLAS BASELINE SELF-TEST: PASSED");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const runtimeRequested = process.argv.includes("--runtime");
  const envAvailable = existsSync(".env.local");
  const codeChecks = config.code_checks.map(runNpmScript);

  let runtimeChecks = [];
  if (runtimeRequested && envAvailable) {
    runtimeChecks = config.runtime_checks.map(runNpmScript);
  }

  const report = summarizeBaseline({ codeChecks, envAvailable, runtimeRequested });
  if (runtimeChecks.length) {
    report.runtime.results = runtimeChecks;
    report.runtime.status = runtimeChecks.every((check) => check.status === "passed")
      ? "passed"
      : "failed";
  }

  console.log(JSON.stringify(report, null, 2));
}

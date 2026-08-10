import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve("scripts/evaluate-phase-354-cycle-release.mjs");

async function runGate({ baseline, persistence, after }) {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-phase-354-"));
  const files = {
    baseline: path.join(directory, "baseline.json"),
    persistence: path.join(directory, "persistence.json"),
    after: path.join(directory, "after.json"),
  };
  for (const [key, value] of Object.entries({ baseline, persistence, after })) {
    if (value !== undefined) await writeFile(files[key], JSON.stringify(value), "utf8");
  }
  const execution = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      ATLAS_PHASE_350_EVIDENCE_FILE: files.baseline,
      ATLAS_PHASE_353_EVIDENCE_FILE: files.persistence,
      ATLAS_PHASE_354_AFTER_EVIDENCE_FILE: files.after,
    },
  });
  return { execution, output: JSON.parse(execution.stdout) };
}

function metricEvidence(schema, status, median, measuredFirstActions = 12) {
  return {
    schema,
    status,
    metric: { medianLeadToFirstActionMinutes: median, measuredFirstActions },
    evidence: { authenticatedRead: true, tenantScoped: true },
  };
}

const persistence = {
  schema: "atlas.phase-353-runtime-evidence.v1",
  status: "authenticated_first_action_proved",
  evidence: {
    authenticatedSession: true,
    tenantScopedLeadVisible: true,
    activityPersisted: "activity…",
    taskPersisted: "task…",
    leadUpdated: true,
    auditEventPersisted: "event…",
    replayedWithoutDuplication: true,
  },
};

test("bloqueia sem os três artefatos autenticados e não autoriza release", async () => {
  const { execution, output } = await runGate({});
  assert.equal(execution.status, 2);
  assert.equal(output.status, "release_blocked_missing_runtime_evidence");
  assert.deepEqual(output.decision.missingOrInvalid, [
    "authenticated_phase_350_baseline",
    "authenticated_phase_353_persistence",
    "authenticated_phase_354_after_snapshot",
  ]);
  assert.equal(output.decision.buildZipDeployAuthorized, false);
});

test("não converte métrica desconhecida em zero", async () => {
  const { execution, output } = await runGate({
    baseline: metricEvidence("atlas.phase-350-lead-intake-baseline.v1", "authenticated_baseline_captured", null),
    persistence,
    after: metricEvidence("atlas.phase-354-lead-intake-after.v1", "authenticated_after_snapshot_captured", 20),
  });
  assert.equal(execution.status, 2);
  assert.equal(output.evidence.baseline.medianLeadToFirstActionMinutes, null);
  assert.equal(output.comparison.deltaMinutes, null);
  assert.equal(output.comparison.unknownMetricsRemainNull, true);
});

test("bloqueia quando há evidência válida mas nenhum ganho medido", async () => {
  const { execution, output } = await runGate({
    baseline: metricEvidence("atlas.phase-350-lead-intake-baseline.v1", "authenticated_baseline_captured", 20),
    persistence,
    after: metricEvidence("atlas.phase-354-lead-intake-after.v1", "authenticated_after_snapshot_captured", 20),
  });
  assert.equal(execution.status, 2);
  assert.equal(output.status, "release_blocked_no_measured_gain");
  assert.equal(output.comparison.measuredGain, false);
  assert.equal(output.decision.approved, false);
});

test("aprova somente com baseline, persistência e redução autenticadas", async () => {
  const { execution, output } = await runGate({
    baseline: metricEvidence("atlas.phase-350-lead-intake-baseline.v1", "authenticated_baseline_captured", 30, 18),
    persistence,
    after: metricEvidence("atlas.phase-354-lead-intake-after.v1", "authenticated_after_snapshot_captured", 20, 21),
  });
  assert.equal(execution.status, 0);
  assert.equal(output.status, "cycle_release_approved");
  assert.equal(output.comparison.deltaMinutes, -10);
  assert.equal(output.comparison.reductionPercent, 33.33);
  assert.equal(output.decision.buildZipDeployAuthorized, true);
  assert.equal(output.officialPhaseMarker, 354);
});

test("o gate é local, somente leitura e rejeita baseline retroativa", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(script, "utf8"));
  assert.match(source, /readFile/);
  assert.doesNotMatch(source, /fetch\(|createClient|\.from\(|insert\(|update\(|delete\(/);
  assert.match(source, /retroactiveBaselineAccepted: false/);
  assert.match(source, /singleLeadSampleUsedAsMedian: false/);
});

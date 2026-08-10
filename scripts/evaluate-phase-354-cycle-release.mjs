import { readFile } from "node:fs/promises";
import process from "node:process";

const paths = {
  baseline: process.env.ATLAS_PHASE_350_EVIDENCE_FILE || "artifacts/runtime/phase-350/lead-intake-baseline.json",
  persistence: process.env.ATLAS_PHASE_353_EVIDENCE_FILE || "artifacts/runtime/phase-353/first-action-evidence.json",
  after: process.env.ATLAS_PHASE_354_AFTER_EVIDENCE_FILE || "artifacts/runtime/phase-354/lead-intake-after.json",
};

async function readEvidence(label, path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("o conteúdo não é um objeto JSON");
    }
    return value;
  } catch (error) {
    return {
      unavailable: true,
      reason: error instanceof Error ? error.message : `${label} indisponível`,
    };
  }
}

function finiteMetric(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function metricEvidence(value, expectedSchema, expectedStatus) {
  const metric = finiteMetric(value?.metric?.medianLeadToFirstActionMinutes);
  const sampleSize = positiveInteger(value?.metric?.measuredFirstActions);
  const authenticated = value?.evidence?.authenticatedRead === true;
  const tenantScoped = value?.evidence?.tenantScoped === true;
  const exactContract = value?.schema === expectedSchema && value?.status === expectedStatus;

  return {
    valid: exactContract && authenticated && tenantScoped && metric !== null && sampleSize !== null,
    exactContract,
    authenticated,
    tenantScoped,
    metric,
    sampleSize,
  };
}

function persistenceEvidence(value) {
  const proof = value?.evidence || {};
  const exactContract = value?.schema === "atlas.phase-353-runtime-evidence.v1"
    && value?.status === "authenticated_first_action_proved";
  const persisted = Boolean(
    proof.authenticatedSession === true
    && proof.tenantScopedLeadVisible === true
    && proof.activityPersisted
    && proof.taskPersisted
    && proof.leadUpdated === true
    && proof.auditEventPersisted
    && proof.replayedWithoutDuplication === true,
  );

  return { valid: exactContract && persisted, exactContract, persisted };
}

const [baselineRaw, persistenceRaw, afterRaw] = await Promise.all([
  readEvidence("baseline", paths.baseline),
  readEvidence("persistência", paths.persistence),
  readEvidence("medição posterior", paths.after),
]);

const baseline = metricEvidence(
  baselineRaw,
  "atlas.phase-350-lead-intake-baseline.v1",
  "authenticated_baseline_captured",
);
const persistence = persistenceEvidence(persistenceRaw);
const after = metricEvidence(
  afterRaw,
  "atlas.phase-354-lead-intake-after.v1",
  "authenticated_after_snapshot_captured",
);

const missingOrInvalid = [];
if (!baseline.valid) missingOrInvalid.push("authenticated_phase_350_baseline");
if (!persistence.valid) missingOrInvalid.push("authenticated_phase_353_persistence");
if (!after.valid) missingOrInvalid.push("authenticated_phase_354_after_snapshot");

const comparable = baseline.valid && after.valid;
const deltaMinutes = comparable ? Number((after.metric - baseline.metric).toFixed(2)) : null;
const reductionPercent = comparable && baseline.metric > 0
  ? Number((((baseline.metric - after.metric) / baseline.metric) * 100).toFixed(2))
  : null;
const measuredGain = comparable && after.metric < baseline.metric;
const approved = missingOrInvalid.length === 0 && measuredGain;

const result = {
  schema: "atlas.phase-354-cycle-release-decision.v1",
  status: approved
    ? "cycle_release_approved"
    : comparable && !measuredGain
      ? "release_blocked_no_measured_gain"
      : "release_blocked_missing_runtime_evidence",
  cycle: "350-354",
  officialPhaseMarker: approved ? 354 : 349,
  evidence: {
    baseline: {
      valid: baseline.valid,
      medianLeadToFirstActionMinutes: baseline.metric,
      measuredFirstActions: baseline.sampleSize,
    },
    persistence: {
      valid: persistence.valid,
      atomicFirstActionPersisted: persistence.persisted,
    },
    after: {
      valid: after.valid,
      medianLeadToFirstActionMinutes: after.metric,
      measuredFirstActions: after.sampleSize,
    },
  },
  comparison: {
    comparable,
    deltaMinutes,
    reductionPercent,
    measuredGain,
    unknownMetricsRemainNull: true,
  },
  decision: {
    approved,
    missingOrInvalid,
    buildZipDeployAuthorized: approved,
  },
  safety: {
    readOnly: true,
    remoteMutation: false,
    retroactiveBaselineAccepted: false,
    singleLeadSampleUsedAsMedian: false,
    secretsPrinted: false,
  },
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = approved ? 0 : 2;

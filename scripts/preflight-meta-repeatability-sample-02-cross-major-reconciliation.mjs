import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validatePhase31RuntimeEvidence, buildPhase31ExpectedArtifacts } from "./preflight-meta-repeatability-sample-02-runtime-evidence.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-cross-major-reconciliation-gate.json"));
const phase31Gate = JSON.parse(read("config/meta-repeatability-sample-02-runtime-evidence-gate.json"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const buildPhase33ExpectedPg17Artifacts = () => Object.fromEntries(
  Object.entries(gate.requiredPhase32Artifacts).map(([name, file]) => [name, { file, sha256: sha256(read(file)) }])
);

const findSensitiveEvidence = (value, path = "$", issues = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key)/i.test(key)) issues.push(`sensitive_key:${path}.${key}`);
      findSensitiveEvidence(child, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+)/i.test(value)) issues.push(`sensitive_value:${path}`);
  return issues;
};

export function validatePhase32RuntimeEvidence(evidence, expectedArtifacts = buildPhase33ExpectedPg17Artifacts()) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(evidence && typeof evidence === "object" && !Array.isArray(evidence), "phase32_evidence_object_required");
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return { approved: false, issues };

  expect(evidence.schemaVersion === gate.sourceSchemas.phase32Evidence, "phase32_schema_version_mismatch");
  expect(evidence.phase === 32 && evidence.status === "approved", "phase32_runtime_not_approved");
  expect(evidence.environment === "local_ephemeral_pg17", "phase32_environment_mismatch");
  expect(uuidPattern.test(evidence.runId ?? ""), "phase32_run_id_invalid");
  const startedAt = Date.parse(evidence.startedAt);
  const finishedAt = Date.parse(evidence.finishedAt);
  const maxDuration = gate.maximumRuntimeMinutes * 60 * 1000;
  expect(Number.isFinite(startedAt) && Number.isFinite(finishedAt), "phase32_runtime_timestamps_invalid");
  expect(Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt >= startedAt && finishedAt - startedAt <= maxDuration, "phase32_runtime_duration_invalid");

  const runtime = evidence.runtime ?? {};
  expect(runtime.engineDetected === true && runtime.engine === "docker_compose", "phase32_runtime_engine_invalid");
  expect(runtime.databaseHealthy === true, "phase32_database_health_not_proven");
  expect(runtime.imageReference === gate.runtimes.pg17.postgresImage, "phase32_postgres_image_mismatch");
  expect(shaPattern.test(runtime.imageFingerprint ?? ""), "phase32_image_fingerprint_invalid");
  expect(runtime.targetFingerprint === sha256(gate.runtimes.pg17.targetIdentity), "phase32_target_fingerprint_mismatch");
  expect(typeof runtime.postgresVersion === "string" && runtime.postgresVersion.startsWith(`${gate.runtimes.pg17.postgresMajor}.`), "phase32_postgres_major_mismatch");
  expect(runtime.currentUser === gate.runtimes.pg17.currentUser, "phase32_current_user_mismatch");

  const actualArtifactNames = Object.keys(evidence.artifactFingerprints ?? {}).sort();
  const expectedArtifactNames = Object.keys(expectedArtifacts).sort();
  expect(JSON.stringify(actualArtifactNames) === JSON.stringify(expectedArtifactNames), "phase32_artifact_set_mismatch");
  for (const name of expectedArtifactNames) {
    const actual = evidence.artifactFingerprints?.[name];
    const expected = expectedArtifacts[name];
    expect(actual?.file === expected.file, `phase32_artifact_path_mismatch:${name}`);
    expect(shaPattern.test(actual?.sha256 ?? "") && actual?.sha256 === expected.sha256, `phase32_artifact_fingerprint_mismatch:${name}`);
  }

  const sequence = Array.isArray(evidence.eventSequence) ? evidence.eventSequence : [];
  expect(JSON.stringify(sequence.map((item) => item?.event)) === JSON.stringify(gate.requiredPhase32EventSequence), "phase32_event_sequence_mismatch");
  let previousAt = startedAt;
  for (const item of sequence) {
    const at = Date.parse(item?.at);
    expect(Number.isFinite(at), `phase32_event_timestamp_invalid:${item?.event ?? "unknown"}`);
    expect(Number.isFinite(at) && at >= previousAt && at <= finishedAt, `phase32_event_timestamp_out_of_order:${item?.event ?? "unknown"}`);
    if (Number.isFinite(at)) previousAt = at;
  }

  expect(shaPattern.test(evidence.sourceReference?.phase30EvidenceFingerprint ?? ""), "phase32_source_phase30_fingerprint_invalid");
  expect(shaPattern.test(evidence.sourceReference?.phase31ReceiptFingerprint ?? ""), "phase32_source_phase31_fingerprint_invalid");
  expect(evidence.sourceReference?.sharedArtifactFingerprintsMatched === true, "phase32_shared_artifacts_not_proven");
  expect(evidence.compatibility?.freshVolumeProven === true && evidence.compatibility?.pg17Verified === true, "phase32_pg17_compatibility_not_proven");
  expect(Array.isArray(evidence.compatibility?.blockedExtensionsDetected) && evidence.compatibility.blockedExtensionsDetected.length === 0, "phase32_blocked_extension_detected");
  for (const [name, required] of Object.entries(gate.requiredPhase32RehearsalState)) {
    expect(evidence.rehearsal?.[name] === required, `phase32_rehearsal_state_mismatch:${name}`);
  }
  for (const [name, required] of Object.entries(gate.requiredPhase32ReleaseGates)) {
    expect(evidence.releaseGates?.[name] === required, `phase32_release_gate_mismatch:${name}`);
  }
  expect(evidence.databaseTouched === true, "phase32_local_database_touch_not_recorded");
  expect(evidence.remoteDatabaseTouched === false, "phase32_remote_database_touch_prohibited");
  expect(evidence.metaTouched === false, "phase32_meta_touch_prohibited");
  expect(evidence.buildExecuted === false, "phase32_build_execution_prohibited");
  issues.push(...findSensitiveEvidence(evidence));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function validatePhase33CrossMajorSources({ phase30Evidence, phase31Receipt, phase32Evidence, rawPhase30, rawPhase31Receipt }) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  const phase30Validation = validatePhase31RuntimeEvidence(phase30Evidence);
  const phase32Validation = validatePhase32RuntimeEvidence(phase32Evidence);
  if (!phase30Validation.approved) issues.push(...phase30Validation.issues.map((code) => `phase30:${code}`));
  if (!phase32Validation.approved) issues.push(...phase32Validation.issues.map((code) => `phase32:${code}`));

  expect(phase31Receipt?.schemaVersion === gate.sourceSchemas.phase31Receipt, "phase31_receipt_schema_mismatch");
  expect(phase31Receipt?.phase === 31 && phase31Receipt?.sourcePhase === 30, "phase31_receipt_phase_mismatch");
  expect(phase31Receipt?.status === "approved" && phase31Receipt?.runtimeApproved === true, "phase31_receipt_not_approved");
  expect(phase31Receipt?.artifactFingerprintsMatched === true, "phase31_receipt_artifacts_not_approved");
  const phase31CheckedAt = Date.parse(phase31Receipt?.checkedAt);
  const phase30FinishedAt = Date.parse(phase30Evidence?.finishedAt);
  const phase32StartedAt = Date.parse(phase32Evidence?.startedAt);
  expect(Number.isFinite(phase31CheckedAt), "phase31_receipt_timestamp_invalid");
  expect(Number.isFinite(phase31CheckedAt) && phase31CheckedAt >= phase30FinishedAt && phase31CheckedAt <= phase32StartedAt, "phase31_receipt_timestamp_out_of_chain");
  expect(phase31Receipt?.evidenceFingerprint === sha256(rawPhase30), "phase31_receipt_evidence_fingerprint_mismatch");
  expect(phase31Receipt?.eventSequenceFingerprint === sha256(JSON.stringify(phase30Evidence?.eventSequence)), "phase31_receipt_event_fingerprint_mismatch");
  expect(phase31Receipt?.remoteDatabaseTouched === false && phase31Receipt?.metaTouched === false && phase31Receipt?.buildExecuted === false, "phase31_receipt_prohibited_touch_detected");

  expect(phase32Evidence?.sourceReference?.phase30EvidenceFingerprint === sha256(rawPhase30), "phase32_phase30_chain_mismatch");
  expect(phase32Evidence?.sourceReference?.phase31ReceiptFingerprint === sha256(rawPhase31Receipt), "phase32_phase31_chain_mismatch");
  expect(phase32Evidence?.runtime?.targetFingerprint !== phase30Evidence?.runtime?.targetFingerprint, "runtime_targets_not_distinct");
  expect(phase30Evidence?.runtime?.imageReference === gate.runtimes.pg15.postgresImage, "pg15_image_mismatch");
  expect(phase32Evidence?.runtime?.imageReference === gate.runtimes.pg17.postgresImage, "pg17_image_mismatch");
  issues.push(...findSensitiveEvidence(phase31Receipt));

  for (const [pg17Name, pg15Name] of Object.entries(gate.sharedArtifactMapping)) {
    expect(
      phase32Evidence?.artifactFingerprints?.[pg17Name]?.sha256 === phase30Evidence?.artifactFingerprints?.[pg15Name]?.sha256,
      `cross_major_shared_artifact_mismatch:${pg17Name}`
    );
  }

  const comparison = {
    pg15: {
      major: gate.runtimes.pg15.postgresMajor,
      imageReference: gate.runtimes.pg15.postgresImage,
      runtimeApproved: phase30Validation.approved,
      securityApproved: phase30Evidence?.rehearsal?.securityVerified === true,
      rollbackApproved: phase30Evidence?.rehearsal?.rollbackApproved === true && phase30Evidence?.rehearsal?.volumesDestroyed === true
    },
    pg17: {
      major: gate.runtimes.pg17.postgresMajor,
      imageReference: gate.runtimes.pg17.postgresImage,
      runtimeApproved: phase32Validation.approved,
      compatibilityApproved: phase32Evidence?.compatibility?.pg17Verified === true,
      securityApproved: phase32Evidence?.rehearsal?.securityVerified === true,
      rollbackApproved: phase32Evidence?.rehearsal?.rollbackApproved === true && phase32Evidence?.rehearsal?.volumesDestroyed === true
    },
    targetsDistinct: phase32Evidence?.runtime?.targetFingerprint !== phase30Evidence?.runtime?.targetFingerprint,
    sharedArtifactsMatched: Object.entries(gate.sharedArtifactMapping).every(([pg17Name, pg15Name]) =>
      phase32Evidence?.artifactFingerprints?.[pg17Name]?.sha256 === phase30Evidence?.artifactFingerprints?.[pg15Name]?.sha256
    ),
    extensionCompatibilityApproved: phase32Evidence?.compatibility?.pg17Verified === true && phase32Evidence?.compatibility?.blockedExtensionsDetected?.length === 0,
    securityEquivalent: phase30Evidence?.rehearsal?.securityVerified === true && phase32Evidence?.rehearsal?.securityVerified === true,
    rollbackEquivalent: phase30Evidence?.rehearsal?.rollbackApproved === true && phase32Evidence?.rehearsal?.rollbackApproved === true && phase30Evidence?.rehearsal?.volumesDestroyed === true && phase32Evidence?.rehearsal?.volumesDestroyed === true
  };
  return { approved: issues.length === 0, issues: [...new Set(issues)], comparison };
}

const approvedBundle = () => {
  const start = Date.parse("2026-07-19T12:00:00.000Z");
  const phase30Evidence = {
    schemaVersion: gate.sourceSchemas.phase30Evidence,
    phase: 30,
    runId: "123e4567-e89b-42d3-a456-426614174000",
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(start + 8000).toISOString(),
    status: "approved",
    environment: "local_ephemeral",
    runtime: {
      engineDetected: true, engine: "docker_compose", databaseHealthy: true,
      imageReference: gate.runtimes.pg15.postgresImage, imageFingerprint: "a".repeat(64),
      targetFingerprint: sha256(gate.runtimes.pg15.targetIdentity), postgresVersion: "15.14"
    },
    artifactFingerprints: buildPhase31ExpectedArtifacts(),
    eventSequence: phase31Gate.requiredEventSequence.map((event, index) => ({ event, at: new Date(start + 1000 + index * 1000).toISOString() })),
    rehearsal: { ...phase31Gate.requiredRehearsalState },
    releaseGates: { ...phase31Gate.requiredReleaseGates },
    databaseTouched: true, remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawPhase30 = JSON.stringify(phase30Evidence);
  const phase31Receipt = {
    schemaVersion: gate.sourceSchemas.phase31Receipt, phase: 31, sourcePhase: 30, status: "approved",
    checkedAt: new Date(start + 9000).toISOString(), evidenceFingerprint: sha256(rawPhase30),
    eventSequenceFingerprint: sha256(JSON.stringify(phase30Evidence.eventSequence)), artifactFingerprintsMatched: true,
    runtimeApproved: true, remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  const rawPhase31Receipt = JSON.stringify(phase31Receipt);
  const phase32Start = start + 10000;
  const phase32Evidence = {
    schemaVersion: gate.sourceSchemas.phase32Evidence, phase: 32,
    runId: "223e4567-e89b-42d3-a456-426614174000",
    startedAt: new Date(phase32Start).toISOString(), finishedAt: new Date(phase32Start + 10000).toISOString(),
    status: "approved", environment: "local_ephemeral_pg17",
    sourceReference: {
      phase30EvidenceFingerprint: sha256(rawPhase30), phase31ReceiptFingerprint: sha256(rawPhase31Receipt),
      sharedArtifactFingerprintsMatched: true
    },
    runtime: {
      engineDetected: true, engine: "docker_compose", databaseHealthy: true,
      imageReference: gate.runtimes.pg17.postgresImage, imageFingerprint: "b".repeat(64),
      targetFingerprint: sha256(gate.runtimes.pg17.targetIdentity), postgresVersion: "17.6", currentUser: "postgres"
    },
    artifactFingerprints: buildPhase33ExpectedPg17Artifacts(),
    eventSequence: gate.requiredPhase32EventSequence.map((event, index) => ({ event, at: new Date(phase32Start + 1000 + index * 1000).toISOString() })),
    compatibility: { blockedExtensionsDetected: [], freshVolumeProven: true, pg17Verified: true },
    rehearsal: { ...gate.requiredPhase32RehearsalState },
    releaseGates: { ...gate.requiredPhase32ReleaseGates },
    databaseTouched: true, remoteDatabaseTouched: false, metaTouched: false, buildExecuted: false
  };
  return { phase30Evidence, phase31Receipt, phase32Evidence, rawPhase30, rawPhase31Receipt };
};

export function selfTestPhase33CrossMajorReconciliation() {
  const cases = [
    ["baseline", (value) => value, true],
    ["pg17-schema", (value) => { value.phase32Evidence.schemaVersion = "old"; return value; }, false],
    ["pg17-status", (value) => { value.phase32Evidence.status = "failed"; return value; }, false],
    ["pg17-environment", (value) => { value.phase32Evidence.environment = "production"; return value; }, false],
    ["pg17-run-id", (value) => { value.phase32Evidence.runId = "invalid"; return value; }, false],
    ["pg17-duration", (value) => { value.phase32Evidence.finishedAt = "2026-07-19T13:00:00.000Z"; return value; }, false],
    ["pg17-image", (value) => { value.phase32Evidence.runtime.imageReference = "latest"; return value; }, false],
    ["pg17-major", (value) => { value.phase32Evidence.runtime.postgresVersion = "15.14"; return value; }, false],
    ["pg17-user", (value) => { value.phase32Evidence.runtime.currentUser = "anon"; return value; }, false],
    ["pg17-target", (value) => { value.phase32Evidence.runtime.targetFingerprint = value.phase30Evidence.runtime.targetFingerprint; return value; }, false],
    ["pg17-artifact", (value) => { value.phase32Evidence.artifactFingerprints.migration.sha256 = "c".repeat(64); return value; }, false],
    ["pg17-order", (value) => { value.phase32Evidence.eventSequence.reverse(); return value; }, false],
    ["pg17-event-time", (value) => { value.phase32Evidence.eventSequence[3].at = "2026-07-19T11:00:00.000Z"; return value; }, false],
    ["pg17-blocked-extension", (value) => { value.phase32Evidence.compatibility.blockedExtensionsDetected = ["plv8"]; return value; }, false],
    ["pg17-fresh-volume", (value) => { value.phase32Evidence.compatibility.freshVolumeProven = false; return value; }, false],
    ["pg17-security", (value) => { value.phase32Evidence.rehearsal.securityVerified = false; return value; }, false],
    ["pg17-permit", (value) => { value.phase32Evidence.rehearsal.permitReservationExecuted = true; return value; }, false],
    ["pg17-cleanup", (value) => { value.phase32Evidence.releaseGates.cleanupApproved = false; return value; }, false],
    ["pg17-remote", (value) => { value.phase32Evidence.remoteDatabaseTouched = true; return value; }, false],
    ["pg17-meta", (value) => { value.phase32Evidence.metaTouched = true; return value; }, false],
    ["pg17-build", (value) => { value.phase32Evidence.buildExecuted = true; return value; }, false],
    ["phase30-chain", (value) => { value.phase32Evidence.sourceReference.phase30EvidenceFingerprint = "c".repeat(64); return value; }, false],
    ["phase31-chain", (value) => { value.phase32Evidence.sourceReference.phase31ReceiptFingerprint = "c".repeat(64); return value; }, false],
    ["receipt-evidence", (value) => { value.phase31Receipt.evidenceFingerprint = "c".repeat(64); return value; }, false],
    ["receipt-event", (value) => { value.phase31Receipt.eventSequenceFingerprint = "c".repeat(64); return value; }, false],
    ["receipt-time", (value) => { value.phase31Receipt.checkedAt = "2026-07-19T13:00:00.000Z"; return value; }, false],
    ["receipt-secret", (value) => { value.phase31Receipt.apiToken = "hidden"; return value; }, false],
    ["pg15-major", (value) => { value.phase30Evidence.runtime.postgresVersion = "17.6"; return value; }, false],
    ["pg15-security", (value) => { value.phase30Evidence.rehearsal.securityVerified = false; return value; }, false],
    ["secret", (value) => { value.phase32Evidence.apiToken = "hidden"; return value; }, false]
  ];
  const failures = [];
  for (const [name, mutate, expected] of cases) {
    const result = validatePhase33CrossMajorSources(mutate(structuredClone(approvedBundle())));
    if (result.approved !== expected) failures.push({ name, expected, result });
  }
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase33CrossMajorReconciliation();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

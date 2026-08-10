import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-runtime-evidence-gate.json"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const shaPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const buildPhase31ExpectedArtifacts = () => Object.fromEntries(
  Object.entries(gate.requiredArtifacts).map(([name, file]) => [name, { file, sha256: sha256(read(file)) }])
);

const findSensitiveEvidence = (value, path = "$", issues = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findSensitiveEvidence(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/(password|secret|token|authorization|database.?url|connection.?string|api.?key)/i.test(key)) {
        issues.push(`sensitive_key:${path}.${key}`);
      }
      findSensitiveEvidence(child, `${path}.${key}`, issues);
    }
    return issues;
  }
  if (typeof value === "string" && /(postgres(?:ql)?:\/\/|https?:\/\/|bearer\s+[a-z0-9._~-]+)/i.test(value)) {
    issues.push(`sensitive_value:${path}`);
  }
  return issues;
};

export function validatePhase31RuntimeEvidence(evidence, expectedArtifacts = buildPhase31ExpectedArtifacts()) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(evidence && typeof evidence === "object" && !Array.isArray(evidence), "evidence_object_required");
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return { approved: false, issues };

  expect(evidence.schemaVersion === gate.schemaVersion, "schema_version_mismatch");
  expect(evidence.phase === gate.sourcePhase, "source_phase_mismatch");
  expect(evidence.status === "approved", "runtime_not_approved");
  expect(evidence.environment === gate.environment, "environment_mismatch");
  expect(uuidPattern.test(evidence.runId ?? ""), "run_id_invalid");

  const startedAt = Date.parse(evidence.startedAt);
  const finishedAt = Date.parse(evidence.finishedAt);
  const maxDuration = gate.maximumRuntimeMinutes * 60 * 1000;
  expect(Number.isFinite(startedAt) && Number.isFinite(finishedAt), "runtime_timestamps_invalid");
  expect(Number.isFinite(startedAt) && Number.isFinite(finishedAt) && finishedAt >= startedAt && finishedAt - startedAt <= maxDuration, "runtime_duration_invalid");

  const runtime = evidence.runtime ?? {};
  expect(runtime.engineDetected === true && runtime.engine === gate.runtime.engine, "runtime_engine_invalid");
  expect(runtime.databaseHealthy === true, "database_health_not_proven");
  expect(runtime.imageReference === gate.runtime.postgresImage, "postgres_image_mismatch");
  expect(shaPattern.test(runtime.imageFingerprint ?? ""), "image_fingerprint_invalid");
  expect(runtime.targetFingerprint === sha256(gate.runtime.targetIdentity), "target_fingerprint_mismatch");
  expect(typeof runtime.postgresVersion === "string" && runtime.postgresVersion.startsWith(`${gate.runtime.postgresMajor}.`), "postgres_major_mismatch");

  const actualArtifactNames = Object.keys(evidence.artifactFingerprints ?? {}).sort();
  const expectedArtifactNames = Object.keys(expectedArtifacts).sort();
  expect(JSON.stringify(actualArtifactNames) === JSON.stringify(expectedArtifactNames), "artifact_set_mismatch");
  for (const name of expectedArtifactNames) {
    const actual = evidence.artifactFingerprints?.[name];
    const expected = expectedArtifacts[name];
    expect(actual?.file === expected.file, `artifact_path_mismatch:${name}`);
    expect(shaPattern.test(actual?.sha256 ?? "") && actual?.sha256 === expected.sha256, `artifact_fingerprint_mismatch:${name}`);
  }

  const sequence = Array.isArray(evidence.eventSequence) ? evidence.eventSequence : [];
  expect(JSON.stringify(sequence.map((item) => item?.event)) === JSON.stringify(gate.requiredEventSequence), "event_sequence_mismatch");
  let previousAt = startedAt;
  for (const item of sequence) {
    const at = Date.parse(item?.at);
    expect(Number.isFinite(at), `event_timestamp_invalid:${item?.event ?? "unknown"}`);
    expect(Number.isFinite(at) && at >= previousAt && at <= finishedAt, `event_timestamp_out_of_order:${item?.event ?? "unknown"}`);
    if (Number.isFinite(at)) previousAt = at;
  }

  for (const [name, required] of Object.entries(gate.requiredRehearsalState)) {
    expect(evidence.rehearsal?.[name] === required, `rehearsal_state_mismatch:${name}`);
  }
  for (const [name, required] of Object.entries(gate.requiredReleaseGates)) {
    expect(evidence.releaseGates?.[name] === required, `release_gate_mismatch:${name}`);
  }
  expect(evidence.databaseTouched === true, "local_database_touch_not_recorded");
  expect(evidence.remoteDatabaseTouched === false, "remote_database_touch_prohibited");
  expect(evidence.metaTouched === false, "meta_touch_prohibited");
  expect(evidence.buildExecuted === false, "build_execution_prohibited");
  issues.push(...findSensitiveEvidence(evidence));

  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

const approvedFixture = () => {
  const start = Date.parse("2026-07-19T12:00:00.000Z");
  return {
    schemaVersion: gate.schemaVersion,
    phase: 30,
    runId: "123e4567-e89b-42d3-a456-426614174000",
    startedAt: new Date(start).toISOString(),
    finishedAt: new Date(start + 8000).toISOString(),
    status: "approved",
    environment: "local_ephemeral",
    runtime: {
      engineDetected: true,
      engine: gate.runtime.engine,
      databaseHealthy: true,
      imageReference: gate.runtime.postgresImage,
      imageFingerprint: "a".repeat(64),
      targetFingerprint: sha256(gate.runtime.targetIdentity),
      postgresVersion: "15.14"
    },
    artifactFingerprints: buildPhase31ExpectedArtifacts(),
    eventSequence: gate.requiredEventSequence.map((event, index) => ({ event, at: new Date(start + 1000 + index * 1000).toISOString() })),
    rehearsal: { ...gate.requiredRehearsalState },
    releaseGates: { ...gate.requiredReleaseGates },
    databaseTouched: true,
    remoteDatabaseTouched: false,
    metaTouched: false,
    buildExecuted: false
  };
};

export function selfTestPhase31RuntimeEvidence() {
  const baseline = approvedFixture();
  const cases = [
    ["baseline", (value) => value, true],
    ["schema", (value) => { value.schemaVersion = "old"; return value; }, false],
    ["phase", (value) => { value.phase = 31; return value; }, false],
    ["status", (value) => { value.status = "failed"; return value; }, false],
    ["environment", (value) => { value.environment = "production"; return value; }, false],
    ["run-id", (value) => { value.runId = "invalid"; return value; }, false],
    ["duration", (value) => { value.finishedAt = "2026-07-19T13:00:00.000Z"; return value; }, false],
    ["engine", (value) => { value.runtime.engine = "remote"; return value; }, false],
    ["health", (value) => { value.runtime.databaseHealthy = false; return value; }, false],
    ["image", (value) => { value.runtime.imageReference = "latest"; return value; }, false],
    ["image-hash", (value) => { value.runtime.imageFingerprint = "bad"; return value; }, false],
    ["target", (value) => { value.runtime.targetFingerprint = "b".repeat(64); return value; }, false],
    ["postgres", (value) => { value.runtime.postgresVersion = "17.0"; return value; }, false],
    ["artifact", (value) => { value.artifactFingerprints.migration.sha256 = "b".repeat(64); return value; }, false],
    ["artifact-extra", (value) => { value.artifactFingerprints.extra = { file: "x", sha256: "a".repeat(64) }; return value; }, false],
    ["order", (value) => { value.eventSequence.reverse(); return value; }, false],
    ["event-time", (value) => { value.eventSequence[2].at = "2026-07-19T11:00:00.000Z"; return value; }, false],
    ["migration", (value) => { value.rehearsal.migrationApplied = false; return value; }, false],
    ["permit", (value) => { value.rehearsal.permitReservationExecuted = true; return value; }, false],
    ["cleanup", (value) => { value.releaseGates.cleanupApproved = false; return value; }, false],
    ["remote", (value) => { value.remoteDatabaseTouched = true; return value; }, false],
    ["meta", (value) => { value.metaTouched = true; return value; }, false],
    ["build", (value) => { value.buildExecuted = true; return value; }, false],
    ["secret-key", (value) => { value.apiToken = "hidden"; return value; }, false],
    ["connection-string", (value) => { value.note = "postgresql://user:pass@example/db"; return value; }, false]
  ];
  const failures = [];
  for (const [name, mutate, expected] of cases) {
    const result = validatePhase31RuntimeEvidence(mutate(structuredClone(baseline)));
    if (result.approved !== expected) failures.push({ name, expected, result });
  }
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase31RuntimeEvidence();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

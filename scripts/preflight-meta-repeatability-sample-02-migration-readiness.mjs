import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-migration-readiness-gate.json"));
const shaPattern = /^[a-f0-9]{64}$/;

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

export const buildPhase34ControlMatrix = () => Object.fromEntries([
  ...gate.verifiedFromPhase33.map((name) => [name, true]),
  ...gate.requiredBeforeProduction.map((name) => [name, false])
]);

export function validatePhase34SourceReceipt(receipt) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  expect(receipt && typeof receipt === "object" && !Array.isArray(receipt), "phase33_receipt_object_required");
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return { approved: false, issues };

  const required = gate.sourceReceipt;
  expect(receipt.schemaVersion === required.schemaVersion, "phase33_receipt_schema_mismatch");
  expect(receipt.phase === required.phase && receipt.sourcePhase === required.sourcePhase, "phase33_receipt_phase_mismatch");
  expect(receipt.status === required.status, "phase33_receipt_not_approved");
  expect(Number.isFinite(Date.parse(receipt.checkedAt)), "phase33_receipt_timestamp_invalid");
  const fingerprintNames = Object.keys(receipt.sourceFingerprints ?? {}).sort();
  expect(JSON.stringify(fingerprintNames) === JSON.stringify(["phase30Evidence", "phase31Receipt", "phase32Evidence"]), "phase33_source_fingerprint_set_mismatch");
  for (const name of fingerprintNames) expect(shaPattern.test(receipt.sourceFingerprints?.[name] ?? ""), `phase33_source_fingerprint_invalid:${name}`);

  const comparison = receipt.comparison ?? {};
  expect(comparison.pg15?.major === gate.runtimes.pg15.postgresMajor, "phase33_pg15_major_mismatch");
  expect(comparison.pg15?.imageReference === gate.runtimes.pg15.postgresImage, "phase33_pg15_image_mismatch");
  expect(comparison.pg15?.runtimeApproved === true, "phase33_pg15_runtime_not_approved");
  expect(comparison.pg15?.securityApproved === true, "phase33_pg15_security_not_approved");
  expect(comparison.pg15?.rollbackApproved === true, "phase33_pg15_rollback_not_approved");
  expect(comparison.pg17?.major === gate.runtimes.pg17.postgresMajor, "phase33_pg17_major_mismatch");
  expect(comparison.pg17?.imageReference === gate.runtimes.pg17.postgresImage, "phase33_pg17_image_mismatch");
  expect(comparison.pg17?.runtimeApproved === true, "phase33_pg17_runtime_not_approved");
  expect(comparison.pg17?.compatibilityApproved === true, "phase33_pg17_compatibility_not_approved");
  expect(comparison.pg17?.securityApproved === true, "phase33_pg17_security_not_approved");
  expect(comparison.pg17?.rollbackApproved === true, "phase33_pg17_rollback_not_approved");
  expect(comparison.targetsDistinct === true, "phase33_runtime_targets_not_distinct");
  expect(comparison.sharedArtifactsMatched === true, "phase33_shared_artifacts_not_approved");
  expect(comparison.extensionCompatibilityApproved === true, "phase33_extension_compatibility_not_approved");
  expect(comparison.securityEquivalent === true, "phase33_security_equivalence_not_approved");
  expect(comparison.rollbackEquivalent === true, "phase33_rollback_equivalence_not_approved");
  expect(receipt.crossMajorApproved === required.crossMajorApproved, "phase33_cross_major_not_approved");
  expect(receipt.productionCompatibilityApproved === required.productionCompatibilityApproved, "phase33_production_claim_invalid");
  expect(receipt.remoteDatabaseTouched === false, "phase33_remote_database_touch_prohibited");
  expect(receipt.metaTouched === false, "phase33_meta_touch_prohibited");
  expect(receipt.buildExecuted === false, "phase33_build_execution_prohibited");
  issues.push(...findSensitiveEvidence(receipt));
  return { approved: issues.length === 0, issues: [...new Set(issues)] };
}

export function evaluatePhase34MigrationReadiness(receipt) {
  const sourceValidation = validatePhase34SourceReceipt(receipt);
  const controls = buildPhase34ControlMatrix();
  const verifiedControls = sourceValidation.approved ? Object.values(controls).filter(Boolean).length : 0;
  const requiredControls = Object.keys(controls).length;
  return {
    sourceApproved: sourceValidation.approved,
    issues: sourceValidation.issues,
    controls: sourceValidation.approved ? controls : Object.fromEntries(Object.keys(controls).map((name) => [name, false])),
    evidenceCoverage: {
      verifiedControls,
      requiredControls,
      percent: Math.floor((verifiedControls / requiredControls) * 100)
    },
    stagingMigrationAllowed: false,
    productionMigrationAllowed: false,
    productionCompatibilityApproved: false
  };
}

const approvedReceipt = () => ({
  schemaVersion: gate.sourceReceipt.schemaVersion,
  phase: 33,
  sourcePhase: 32,
  status: "approved",
  checkedAt: "2026-07-19T13:00:00.000Z",
  sourceFingerprints: {
    phase30Evidence: "a".repeat(64),
    phase31Receipt: "b".repeat(64),
    phase32Evidence: "c".repeat(64)
  },
  comparison: {
    pg15: {
      major: 15,
      imageReference: gate.runtimes.pg15.postgresImage,
      runtimeApproved: true,
      securityApproved: true,
      rollbackApproved: true
    },
    pg17: {
      major: 17,
      imageReference: gate.runtimes.pg17.postgresImage,
      runtimeApproved: true,
      compatibilityApproved: true,
      securityApproved: true,
      rollbackApproved: true
    },
    targetsDistinct: true,
    sharedArtifactsMatched: true,
    extensionCompatibilityApproved: true,
    securityEquivalent: true,
    rollbackEquivalent: true
  },
  crossMajorApproved: true,
  productionCompatibilityApproved: false,
  remoteDatabaseTouched: false,
  metaTouched: false,
  buildExecuted: false
});

export function selfTestPhase34MigrationReadiness() {
  const cases = [
    ["baseline", (value) => value, true],
    ["schema", (value) => { value.schemaVersion = "old"; return value; }, false],
    ["phase", (value) => { value.phase = 32; return value; }, false],
    ["status", (value) => { value.status = "blocked"; return value; }, false],
    ["timestamp", (value) => { value.checkedAt = "invalid"; return value; }, false],
    ["fingerprint-set", (value) => { value.sourceFingerprints.extra = "d".repeat(64); return value; }, false],
    ["fingerprint", (value) => { value.sourceFingerprints.phase30Evidence = "bad"; return value; }, false],
    ["pg15-major", (value) => { value.comparison.pg15.major = 17; return value; }, false],
    ["pg15-image", (value) => { value.comparison.pg15.imageReference = "latest"; return value; }, false],
    ["pg15-security", (value) => { value.comparison.pg15.securityApproved = false; return value; }, false],
    ["pg15-rollback", (value) => { value.comparison.pg15.rollbackApproved = false; return value; }, false],
    ["pg17-major", (value) => { value.comparison.pg17.major = 15; return value; }, false],
    ["pg17-image", (value) => { value.comparison.pg17.imageReference = "latest"; return value; }, false],
    ["pg17-runtime", (value) => { value.comparison.pg17.runtimeApproved = false; return value; }, false],
    ["pg17-compatibility", (value) => { value.comparison.pg17.compatibilityApproved = false; return value; }, false],
    ["targets", (value) => { value.comparison.targetsDistinct = false; return value; }, false],
    ["artifacts", (value) => { value.comparison.sharedArtifactsMatched = false; return value; }, false],
    ["extensions", (value) => { value.comparison.extensionCompatibilityApproved = false; return value; }, false],
    ["security", (value) => { value.comparison.securityEquivalent = false; return value; }, false],
    ["rollback", (value) => { value.comparison.rollbackEquivalent = false; return value; }, false],
    ["cross-major", (value) => { value.crossMajorApproved = false; return value; }, false],
    ["production-claim", (value) => { value.productionCompatibilityApproved = true; return value; }, false],
    ["remote", (value) => { value.remoteDatabaseTouched = true; return value; }, false],
    ["meta", (value) => { value.metaTouched = true; return value; }, false],
    ["build", (value) => { value.buildExecuted = true; return value; }, false],
    ["secret", (value) => { value.apiToken = "hidden"; return value; }, false]
  ];
  const failures = [];
  for (const [name, mutate, expected] of cases) {
    const result = validatePhase34SourceReceipt(mutate(structuredClone(approvedReceipt())));
    if (result.approved !== expected) failures.push({ name, expected, result });
  }
  const readiness = evaluatePhase34MigrationReadiness(approvedReceipt());
  if (readiness.evidenceCoverage.verifiedControls !== gate.evidenceCoverage.verifiedControls) failures.push({ name: "verified-control-count", readiness });
  if (readiness.evidenceCoverage.requiredControls !== gate.evidenceCoverage.requiredControls) failures.push({ name: "required-control-count", readiness });
  if (readiness.evidenceCoverage.percent !== gate.evidenceCoverage.percent) failures.push({ name: "evidence-coverage", readiness });
  if (readiness.stagingMigrationAllowed || readiness.productionMigrationAllowed || readiness.productionCompatibilityApproved) failures.push({ name: "migration-gate", readiness });
  return { passed: failures.length === 0, caseCount: cases.length + 4, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase34MigrationReadiness();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

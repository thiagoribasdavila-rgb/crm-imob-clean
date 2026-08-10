import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const gate = JSON.parse(read("config/meta-repeatability-sample-02-pg17-compatibility-gate.json"));
export const PHASE32_APPROVAL = gate.approval.exactValue;

const declaredExtensions = (sql) => [...sql.matchAll(/create\s+extension(?:\s+if\s+not\s+exists)?\s+([a-zA-Z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());

export function validatePhase32Pg17Compatibility(input) {
  const issues = [];
  const expect = (condition, code) => { if (!condition) issues.push(code); };
  const runtime = input.runtime ?? {};
  const sourceEvidence = input.sourceEvidence ?? {};
  const sql = input.sql ?? "";
  const extensions = declaredExtensions(sql);
  const blocked = extensions.filter((name) => gate.extensionCompatibility.blockedOnPg17.includes(name));
  const unknown = extensions.filter((name) => !gate.extensionCompatibility.allowedRequiredExtensions.includes(name));

  expect(input.phase === 32, "phase_mismatch");
  expect(input.environment === "local_ephemeral_pg17", "environment_mismatch");
  expect(input.approval === PHASE32_APPROVAL, "exact_human_approval_required");
  expect(runtime.engine === "docker_compose", "docker_compose_required");
  expect(runtime.postgresImage === "supabase/postgres:17.6.1.149", "pinned_pg17_image_required");
  expect(runtime.postgresMajor === 17, "postgres_17_required");
  expect(runtime.host === "127.0.0.1" && runtime.port === 55433 && runtime.database === "atlas_phase32", "localhost_pg17_target_required");
  expect(runtime.reusesPg15Volume === false && runtime.volume === "phase32-pg17-postgres-data", "fresh_pg17_volume_required");
  expect(runtime.remoteTarget === false && runtime.productionTarget === false && runtime.linkedProject === false, "remote_target_prohibited");
  expect(runtime.destroyVolumesAfterRun === true, "volume_destruction_required");
  expect(sourceEvidence.phase30RuntimeEvidenceRequired === true && sourceEvidence.phase31ReconciliationRequired === true, "source_evidence_required");
  expect(sourceEvidence.sharedArtifactFingerprintsMustMatch === true, "shared_artifact_fingerprints_required");
  expect(Object.values(input.prohibitedActions ?? {}).every((value) => value === false), "prohibited_action_requested");
  expect(blocked.length === 0, `blocked_pg17_extension:${blocked.join("+")}`);
  expect(unknown.length === 0, `unreviewed_extension:${unknown.join("+")}`);

  return { approved: issues.length === 0, issueCodes: issues, declaredExtensions: [...new Set(extensions)], blockedExtensions: [...new Set(blocked)] };
}

const validInput = () => ({
  phase: gate.phase,
  environment: gate.environment,
  approval: PHASE32_APPROVAL,
  runtime: structuredClone(gate.runtime),
  sourceEvidence: structuredClone(gate.sourceEvidence),
  prohibitedActions: Object.fromEntries(Object.keys(gate.prohibitedActions).map((key) => [key, false])),
  sql: Object.values(gate.requiredArtifacts).filter((file) => file.endsWith(".sql")).map(read).join("\n")
});

export function selfTestPhase32Pg17Compatibility() {
  const cases = [
    ["baseline", (value) => value, true],
    ["phase", (value) => { value.phase = 31; return value; }, false],
    ["environment", (value) => { value.environment = "production"; return value; }, false],
    ["approval", (value) => { value.approval = "yes"; return value; }, false],
    ["engine", (value) => { value.runtime.engine = "remote"; return value; }, false],
    ["image-latest", (value) => { value.runtime.postgresImage = "supabase/postgres:latest"; return value; }, false],
    ["major", (value) => { value.runtime.postgresMajor = 15; return value; }, false],
    ["host", (value) => { value.runtime.host = "0.0.0.0"; return value; }, false],
    ["port", (value) => { value.runtime.port = 5432; return value; }, false],
    ["database", (value) => { value.runtime.database = "postgres"; return value; }, false],
    ["reuse-volume", (value) => { value.runtime.reusesPg15Volume = true; return value; }, false],
    ["wrong-volume", (value) => { value.runtime.volume = "phase30-postgres-data"; return value; }, false],
    ["remote", (value) => { value.runtime.remoteTarget = true; return value; }, false],
    ["linked", (value) => { value.runtime.linkedProject = true; return value; }, false],
    ["cleanup", (value) => { value.runtime.destroyVolumesAfterRun = false; return value; }, false],
    ["source-phase30", (value) => { value.sourceEvidence.phase30RuntimeEvidenceRequired = false; return value; }, false],
    ["source-phase31", (value) => { value.sourceEvidence.phase31ReconciliationRequired = false; return value; }, false],
    ["source-shared-hashes", (value) => { value.sourceEvidence.sharedArtifactFingerprintsMustMatch = false; return value; }, false],
    ["permit", (value) => { value.prohibitedActions.permitReservation = true; return value; }, false],
    ["meta", (value) => { value.prohibitedActions.realMetaEventDelivery = true; return value; }, false],
    ["build", (value) => { value.prohibitedActions.build = true; return value; }, false],
    ["timescaledb", (value) => { value.sql += "\ncreate extension timescaledb;"; return value; }, false],
    ["plv8", (value) => { value.sql += "\ncreate extension if not exists plv8;"; return value; }, false],
    ["unknown-extension", (value) => { value.sql += "\ncreate extension imaginary;"; return value; }, false]
  ];
  const failures = [];
  for (const [name, mutate, expected] of cases) {
    const result = validatePhase32Pg17Compatibility(mutate(validInput()));
    if (result.approved !== expected) failures.push({ name, expected, result });
  }
  return { passed: failures.length === 0, caseCount: cases.length, failures };
}

if (process.argv.includes("--self-test")) {
  const result = selfTestPhase32Pg17Compatibility();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

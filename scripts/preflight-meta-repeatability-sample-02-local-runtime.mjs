import { pathToFileURL } from "node:url";

export const PHASE30_APPROVAL = "EXECUTE_PHASE30_LOCAL_EPHEMERAL_ONLY";
export const PHASE30_IMAGE = "supabase/postgres:15.14.1.149";

export function validatePhase30Runtime(input) {
  const issues = new Set();
  const runtime = input?.runtime ?? {};
  const prohibited = input?.prohibitedActions ?? {};

  if (input?.phase !== 30 || input?.environment !== "local_ephemeral") issues.add("phase30_local_ephemeral_required");
  if (input?.approval !== PHASE30_APPROVAL) issues.add("explicit_human_approval_missing");
  if (runtime.engine !== "docker_compose") issues.add("docker_compose_required");
  if (runtime.postgresImage !== PHASE30_IMAGE) issues.add("pinned_supabase_postgres_image_required");
  if (runtime.host !== "127.0.0.1" || runtime.port !== 55432) issues.add("localhost_target_required");
  if (runtime.database !== "atlas_phase30" || runtime.user !== "postgres") issues.add("ephemeral_database_identity_mismatch");
  if (runtime.linkedProject !== false || runtime.remoteTarget !== false || runtime.productionTarget !== false) issues.add("remote_or_linked_target_forbidden");
  if (runtime.destroyVolumesAfterRun !== true) issues.add("volume_destruction_required");
  if (Object.values(prohibited).some((value) => value !== false)) issues.add("prohibited_action_requested");

  return {
    approved: issues.size === 0,
    issueCodes: [...issues].sort(),
    localOnly: true,
    remoteDatabaseAllowed: false,
    permitReservationAllowed: false,
    metaDeliveryAllowed: false
  };
}

function fixture() {
  return {
    phase: 30,
    environment: "local_ephemeral",
    approval: PHASE30_APPROVAL,
    runtime: {
      engine: "docker_compose",
      postgresImage: PHASE30_IMAGE,
      host: "127.0.0.1",
      port: 55432,
      database: "atlas_phase30",
      user: "postgres",
      linkedProject: false,
      remoteTarget: false,
      productionTarget: false,
      destroyVolumesAfterRun: true
    },
    prohibitedActions: {
      remoteDatabaseAccess: false,
      linkedProjectAccess: false,
      productionMutation: false,
      permitReservation: false,
      permitIssuance: false,
      permitConsumption: false,
      realMetaEventDelivery: false,
      testMetaEventDelivery: false,
      campaignMutation: false,
      budgetMutation: false,
      audienceMutation: false,
      deployment: false,
      build: false
    }
  };
}

export function selfTestPhase30Preflight() {
  const tests = [];
  const baseline = fixture();
  tests.push({ id: "complete_local_ephemeral_target", passed: validatePhase30Runtime(baseline).approved });
  const mutate = (id, change, expected) => {
    const value = structuredClone(baseline);
    change(value);
    tests.push({ id, passed: validatePhase30Runtime(value).issueCodes.includes(expected) });
  };
  mutate("production_environment", (v) => { v.environment = "production"; }, "phase30_local_ephemeral_required");
  mutate("approval_missing", (v) => { v.approval = ""; }, "explicit_human_approval_missing");
  mutate("runtime_mismatch", (v) => { v.runtime.engine = "remote"; }, "docker_compose_required");
  mutate("floating_image_rejected", (v) => { v.runtime.postgresImage = "supabase/postgres:latest"; }, "pinned_supabase_postgres_image_required");
  mutate("remote_host_rejected", (v) => { v.runtime.host = "db.example.com"; }, "localhost_target_required");
  mutate("port_mismatch", (v) => { v.runtime.port = 5432; }, "localhost_target_required");
  mutate("database_mismatch", (v) => { v.runtime.database = "postgres"; }, "ephemeral_database_identity_mismatch");
  mutate("linked_rejected", (v) => { v.runtime.linkedProject = true; }, "remote_or_linked_target_forbidden");
  mutate("remote_rejected", (v) => { v.runtime.remoteTarget = true; }, "remote_or_linked_target_forbidden");
  mutate("production_rejected", (v) => { v.runtime.productionTarget = true; }, "remote_or_linked_target_forbidden");
  mutate("cleanup_required", (v) => { v.runtime.destroyVolumesAfterRun = false; }, "volume_destruction_required");
  mutate("permit_rejected", (v) => { v.prohibitedActions.permitReservation = true; }, "prohibited_action_requested");
  mutate("meta_rejected", (v) => { v.prohibitedActions.testMetaEventDelivery = true; }, "prohibited_action_requested");
  mutate("build_rejected", (v) => { v.prohibitedActions.build = true; }, "prohibited_action_requested");
  return { passed: tests.every((test) => test.passed), testCount: tests.length, tests };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = selfTestPhase30Preflight();
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

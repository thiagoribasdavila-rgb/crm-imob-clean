import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessSanitizedRemediationPlan } from "./run-atlas-sanitized-remediation-plan-phase-019.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = JSON.parse(
  readFileSync(
    resolve(
      root,
      "config/atlas-10x-phase-020-local-remediation-specification.json",
    ),
    "utf8",
  ),
);
const phase019Config = JSON.parse(
  readFileSync(
    resolve(root, "config/atlas-10x-phase-019-sanitized-remediation-plan.json"),
    "utf8",
  ),
);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const isSha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const allTrue = (object) => Object.values(object).every(Boolean);
const exactKeys = (value, allowed) => {
  const keys = Object.keys(value ?? {});
  return (
    keys.length === allowed.length &&
    keys.every((key) => allowed.includes(key))
  );
};
const unique = (values) =>
  Array.isArray(values) && new Set(values).size === values.length;
const safeIdentifier = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9_-]{3,80}$/.test(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

function safeWorkspacePath(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  if (isAbsolute(candidate) || candidate.includes("\0")) return false;
  const absolute = resolve(root, candidate);
  const offset = relative(root, absolute);
  return offset === "" || (!offset.startsWith("..") && !isAbsolute(offset));
}

function readArtifact(path) {
  if (!safeWorkspacePath(path)) {
    return { exists: false, parses: false, value: null, source: "", hash: "" };
  }
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    return { exists: false, parses: false, value: null, source: "", hash: "" };
  }
  const source = readFileSync(absolute, "utf8");
  try {
    return {
      exists: true,
      parses: true,
      value: JSON.parse(source),
      source,
      hash: sha256(source),
    };
  } catch {
    return {
      exists: true,
      parses: false,
      value: null,
      source,
      hash: sha256(source),
    };
  }
}

const approvalAuthorizationFields =
  config.approval_contract.required_authorization_fields;
const specificationAuthorizationFields =
  config.specification_contract.required_authorization_fields;
const specificationPrivacyFields =
  config.specification_contract.required_privacy_fields;

function validatePhase019Plan(plan) {
  const privacy = plan?.privacy ?? {};
  const authorizations = plan?.authorizations ?? {};
  const items = Array.isArray(plan?.items) ? plan.items : [];
  return {
    phase_019_plan_schema_matches:
      plan?.schema_version ===
        config.input_contract.required_plan_schema_version &&
      plan?.status === config.input_contract.required_plan_status,
    phase_019_plan_is_sanitized:
      items.length === phase019Config.workstreams.length &&
      items.every(
        (item) =>
          Number.isInteger(item?.finding_count) &&
          item.finding_count >= 0 &&
          item.human_review_required === true,
      ) &&
      Object.values(privacy).length > 0 &&
      Object.values(privacy).every((value) => value === false),
    phase_019_plan_authorizes_no_action:
      Object.values(authorizations).length > 0 &&
      Object.values(authorizations).every((value) => value === false),
  };
}

export function validateWorkstreamApproval(
  approval,
  plan,
  planHash,
  now = new Date(),
) {
  const authorizations = approval?.authorizations ?? {};
  const approvedIds = Array.isArray(approval?.approved_workstream_ids)
    ? approval.approved_workstream_ids
    : [];
  const deferredIds = Array.isArray(approval?.deferred_workstream_ids)
    ? approval.deferred_workstream_ids
    : [];
  const activeIds = (Array.isArray(plan?.items) ? plan.items : [])
    .filter((item) => item.finding_count > 0)
    .map((item) => item.id);
  const activeSet = new Set(activeIds);
  const selected = [...approvedIds, ...deferredIds];
  const issuedAt = new Date(approval?.issued_at ?? "");
  const expiresAt = new Date(approval?.expires_at ?? "");
  const ttlMs = config.input_contract.approval_ttl_minutes * 60 * 1000;
  const windowMs = expiresAt.getTime() - issuedAt.getTime();
  const gates = {
    approval_schema_matches:
      approval?.schema_version ===
        config.input_contract.required_approval_schema_version &&
      exactKeys(approval, config.approval_contract.required_fields),
    approval_status_matches:
      approval?.status === config.input_contract.required_approval_status,
    approval_scope_matches:
      approval?.scope === config.input_contract.required_approval_scope,
    approval_is_one_shot_and_unused:
      approval?.one_shot === true && approval?.consumed === false,
    approval_window_is_valid:
      Number.isFinite(issuedAt.getTime()) &&
      Number.isFinite(expiresAt.getTime()) &&
      windowMs > 0 &&
      windowMs <= ttlMs &&
      now.getTime() >= issuedAt.getTime() &&
      now.getTime() < expiresAt.getTime(),
    approval_reviewer_is_present:
      config.approval_contract.requires_human_reviewer === true &&
      safeIdentifier(approval?.reviewed_by),
    approval_change_ticket_is_present:
      config.approval_contract.requires_change_ticket === true &&
      safeIdentifier(approval?.change_ticket),
    approval_plan_hash_matches:
      isSha256(approval?.plan_sha256) &&
      approval.plan_sha256 === planHash,
    approval_ids_are_unique:
      unique(approvedIds) &&
      unique(deferredIds) &&
      unique(selected) &&
      selected.every(safeIdentifier),
    approval_has_active_workstream:
      config.approval_contract.requires_non_empty_approval === true &&
      approvedIds.length > 0,
    approval_contains_only_active_workstreams:
      selected.every((id) => activeSet.has(id)),
    approval_partitions_active_workstreams:
      config.approval_contract.requires_exact_active_partition === true &&
      selected.length === activeIds.length &&
      activeIds.every((id) => selected.includes(id)),
    approval_authorizes_local_specification_only:
      exactKeys(authorizations, approvalAuthorizationFields) &&
      authorizations.local_specification === true &&
      approvalAuthorizationFields
        .filter((field) => field !== "local_specification")
        .every((field) => authorizations[field] === false),
    approval_contains_no_object_names_or_sql:
      config.approval_contract.object_names_forbidden === true &&
      config.approval_contract.raw_sql_forbidden === true &&
      exactKeys(approval, config.approval_contract.required_fields),
  };
  return { accepted: allTrue(gates), gates };
}

function validateDesignCatalog() {
  const catalog = config.design_catalog;
  const planIds = phase019Config.workstreams.map((item) => item.id);
  const catalogIds = catalog.map((item) => item.workstream_id);
  const exactCatalogItem = (item) =>
    exactKeys(item, [
      "workstream_id",
      "design_class",
      "design_requirements",
      "verification_cases",
    ]);
  return {
    design_catalog_is_exact:
      catalog.length === planIds.length &&
      planIds.every((id) => catalogIds.includes(id)) &&
      catalog.every(exactCatalogItem),
    design_catalog_ids_are_unique: unique(catalogIds),
    design_requirements_are_controlled: catalog.every(
      (item) =>
        safeIdentifier(item.design_class) &&
        item.design_requirements.length === 3 &&
        unique(item.design_requirements) &&
        item.design_requirements.every(safeIdentifier),
    ),
    verification_cases_are_controlled: catalog.every(
      (item) =>
        item.verification_cases.length === 3 &&
        unique(item.verification_cases) &&
        item.verification_cases.every(safeIdentifier),
    ),
  };
}

export function buildLocalRemediationSpecification(
  plan,
  approval,
  sourceHashes,
) {
  const approvedIds = new Set(approval.approved_workstream_ids);
  const items = plan.items
    .filter((item) => approvedIds.has(item.id))
    .map((item) => {
      const design = config.design_catalog.find(
        (candidate) => candidate.workstream_id === item.id,
      );
      return {
        workstream_id: item.id,
        finding_class: item.finding_class,
        finding_count: item.finding_count,
        priority: item.priority,
        owner_class: item.owner_class,
        design_class: design.design_class,
        design_requirements: [...design.design_requirements],
        verification_cases: [...design.verification_cases],
        rollback_required: true,
        human_sql_authoring_required: true,
        migration_file_created: false,
        raw_sql_included: false,
        remote_execution_allowed: false,
        status: config.specification_contract.item_status,
      };
    });
  return {
    schema_version: config.specification_contract.schema_version,
    status: config.specification_contract.ready_status,
    source: {
      plan_sha256: sourceHashes.plan,
      approval_sha256: sourceHashes.approval,
      observation_sha256: plan.source.observation_sha256,
      catalog_sha256: sha256(JSON.stringify(config.design_catalog)),
    },
    summary: {
      approved_workstreams: items.length,
      deferred_workstreams: approval.deferred_workstream_ids.length,
      approved_findings: items.reduce(
        (total, item) => total + item.finding_count,
        0,
      ),
      migration_files_created: 0,
    },
    items,
    privacy: Object.fromEntries(
      specificationPrivacyFields.map((field) => [field, false]),
    ),
    authorizations: Object.fromEntries(
      specificationAuthorizationFields.map((field) => [field, false]),
    ),
  };
}

export function validateLocalRemediationSpecification(
  specification,
  plan,
  approval,
  sourceHashes,
) {
  const source = specification?.source ?? {};
  const summary = specification?.summary ?? {};
  const items = Array.isArray(specification?.items)
    ? specification.items
    : [];
  const privacy = specification?.privacy ?? {};
  const authorizations = specification?.authorizations ?? {};
  const approvedIds = approval?.approved_workstream_ids ?? [];
  const planById = new Map(
    (plan?.items ?? []).map((item) => [item.id, item]),
  );
  const catalogById = new Map(
    config.design_catalog.map((item) => [item.workstream_id, item]),
  );
  const expectedSource = {
    plan_sha256: sourceHashes.plan,
    approval_sha256: sourceHashes.approval,
    observation_sha256: plan?.source?.observation_sha256,
    catalog_sha256: sha256(JSON.stringify(config.design_catalog)),
  };
  const approvedFindings = items.reduce(
    (total, item) =>
      total + (Number.isInteger(item?.finding_count) ? item.finding_count : 0),
    0,
  );
  const gates = {
    specification_schema_matches:
      exactKeys(
        specification,
        config.specification_contract.required_root_fields,
      ) &&
      specification?.schema_version ===
        config.specification_contract.schema_version,
    specification_status_matches:
      specification?.status === config.specification_contract.ready_status,
    specification_source_shape_is_exact: exactKeys(
      source,
      config.specification_contract.required_source_fields,
    ),
    specification_source_hashes_match:
      Object.entries(expectedSource).every(
        ([field, expected]) =>
          isSha256(source[field]) && source[field] === expected,
      ),
    specification_summary_shape_is_exact: exactKeys(
      summary,
      config.specification_contract.required_summary_fields,
    ),
    specification_summary_matches_approval:
      summary.approved_workstreams === approvedIds.length &&
      summary.deferred_workstreams ===
        approval.deferred_workstream_ids.length &&
      summary.approved_findings === approvedFindings &&
      summary.migration_files_created === 0,
    specification_item_count_matches_approval:
      items.length === approvedIds.length,
    specification_item_shapes_are_exact: items.every((item) =>
      exactKeys(
        item,
        config.specification_contract.required_item_fields,
      ),
    ),
    specification_contains_only_approved_workstreams:
      unique(items.map((item) => item.workstream_id)) &&
      items.every((item) => approvedIds.includes(item.workstream_id)) &&
      approvedIds.every((id) =>
        items.some((item) => item.workstream_id === id),
      ),
    specification_counts_match_plan: items.every((item) => {
      const planItem = planById.get(item.workstream_id);
      return (
        planItem &&
        item.finding_class === planItem.finding_class &&
        item.finding_count === planItem.finding_count &&
        item.priority === planItem.priority &&
        item.owner_class === planItem.owner_class
      );
    }),
    specification_designs_match_catalog: items.every((item) => {
      const design = catalogById.get(item.workstream_id);
      return (
        design &&
        item.design_class === design.design_class &&
        JSON.stringify(item.design_requirements) ===
          JSON.stringify(design.design_requirements) &&
        JSON.stringify(item.verification_cases) ===
          JSON.stringify(design.verification_cases) &&
        item.status === config.specification_contract.item_status
      );
    }),
    specification_requires_rollback:
      items.length > 0 &&
      items.every((item) => item.rollback_required === true),
    specification_requires_human_sql_authoring:
      items.length > 0 &&
      items.every((item) => item.human_sql_authoring_required === true),
    specification_contains_no_migration_file:
      summary.migration_files_created === 0 &&
      items.every((item) => item.migration_file_created === false),
    specification_contains_no_sql_or_object_names:
      exactKeys(privacy, specificationPrivacyFields) &&
      privacy.contains_raw_sql === false &&
      privacy.contains_object_names === false &&
      items.every(
        (item) =>
          item.raw_sql_included === false &&
          !Object.hasOwn(item, "sql") &&
          !Object.hasOwn(item, "object_name"),
      ),
    specification_contains_no_credentials_or_rows:
      privacy.contains_credentials === false &&
      privacy.contains_personal_data === false &&
      privacy.contains_business_data === false &&
      privacy.contains_auth_user_data === false &&
      privacy.contains_raw_cli_output === false,
    specification_authorizes_no_remote_action:
      exactKeys(authorizations, specificationAuthorizationFields) &&
      specificationAuthorizationFields.every(
        (field) => authorizations[field] === false,
      ) &&
      items.every((item) => item.remote_execution_allowed === false),
  };
  return { accepted: allTrue(gates), gates };
}

export function assessLocalRemediationSpecification({
  approvalPath = config.input_contract.approval_path,
  now = new Date(),
} = {}) {
  const phase019 = assessSanitizedRemediationPlan();
  const phase019Available =
    phase019?.schema_version === phase019Config.schema_version;
  const plan =
    phase019?.conclusion?.ready_for_local_migration_design === true
      ? phase019.plan
      : null;
  const planValidation = plan
    ? validatePhase019Plan(plan)
    : {
        phase_019_plan_schema_matches: false,
        phase_019_plan_is_sanitized: false,
        phase_019_plan_authorizes_no_action: false,
      };
  const planSource = plan ? JSON.stringify(plan) : "";
  const planHash = plan ? sha256(planSource) : "";
  const approval = readArtifact(approvalPath);
  const approvalValidation =
    approval.parses && plan
      ? validateWorkstreamApproval(
          approval.value,
          plan,
          planHash,
          now,
        )
      : { accepted: false, gates: {} };
  const sourceHashes = { plan: planHash, approval: approval.hash };
  const specification =
    plan && approvalValidation.accepted
      ? buildLocalRemediationSpecification(
          plan,
          approval.value,
          sourceHashes,
        )
      : null;
  const specificationValidation = specification
    ? validateLocalRemediationSpecification(
        specification,
        plan,
        approval.value,
        sourceHashes,
      )
    : { accepted: false, gates: {} };
  const catalogValidation = validateDesignCatalog();
  const baseGates = {
    phase_019_assessment_is_available: phase019Available,
    phase_019_plan_is_ready:
      phase019?.conclusion?.ready_for_local_migration_design === true,
    ...planValidation,
    phase_019_plan_hash_is_sha256: isSha256(planHash),
    approval_exists: approval.exists,
    approval_parses: approval.parses,
    ...approvalValidation.gates,
    ...catalogValidation,
    specification_is_generated_in_memory: specification !== null,
    ...specificationValidation.gates,
    remote_command_not_executed: true,
    migration_not_generated_or_applied: true,
    production_not_touched: true,
    business_or_auth_data_not_read: true,
    build_not_executed: true,
    package_not_created: true,
  };
  const gates = Object.fromEntries(
    config.required_gates.map((gate) => [gate, Boolean(baseGates[gate])]),
  );
  const blockers = config.required_gates.filter((gate) => !gates[gate]);
  const passed = config.required_gates.length - blockers.length;
  const ready = blockers.length === 0;
  return {
    schema_version: config.schema_version,
    phase: "20/24",
    status: ready ? specification.status : config.status,
    specification_gates: {
      passed,
      total: config.required_gates.length,
      percentage: Math.round((passed / config.required_gates.length) * 100),
      blockers,
    },
    inputs: {
      phase_019_plan_ready: Boolean(plan),
      approval_exists: approval.exists,
      approval_parses: approval.parses,
    },
    local_specification: ready
      ? specification
      : {
          generated_in_memory: false,
          persisted: false,
          approved_workstreams: null,
          approved_findings: null,
          migration_files_created: 0,
        },
    safety: {
      evaluator_executed_remote_command: false,
      evaluator_wrote_file: false,
      remote_read_executed: false,
      remote_write_executed: false,
      migration_generated: false,
      migration_applied: false,
      branch_mutated: false,
      production_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    conclusion: {
      ready_for_local_migration_authoring: ready,
      remote_apply_authorized: false,
      production_authorized: false,
      human_sql_authoring_required: true,
      next_phase: config.next_phase,
    },
  };
}

function syntheticPlan() {
  const counts = [2, 3, 1, 1, 2, 4, 5];
  const items = phase019Config.workstreams.map((workstream, index) => ({
    ...workstream,
    finding_count: counts[index],
    human_review_required: true,
    status: "requires_local_design",
  }));
  return {
    schema_version: config.input_contract.required_plan_schema_version,
    status: config.input_contract.required_plan_status,
    source: {
      dossier_sha256: "1".repeat(64),
      target_descriptor_sha256: "2".repeat(64),
      permit_sha256: "3".repeat(64),
      observation_sha256: "4".repeat(64),
      catalog_sha256: "5".repeat(64),
      migration_ledger_sha256: "6".repeat(64),
      advisors_sha256: "7".repeat(64),
    },
    summary: {
      total_findings: 18,
      active_workstreams: 7,
      zero_finding_workstreams: 0,
    },
    items,
    privacy: {
      contains_credentials: false,
      contains_personal_data: false,
      contains_business_data: false,
      contains_auth_user_data: false,
      contains_object_names: false,
      contains_raw_sql: false,
      contains_raw_cli_output: false,
    },
    authorizations: {
      remote_read: false,
      remote_write: false,
      migration_generation: false,
      migration_apply: false,
      db_push: false,
      migration_repair: false,
      branch_mutation: false,
      production: false,
      real_data_copy: false,
    },
  };
}

function syntheticApproval(plan, now) {
  const issuedAt = new Date(now.getTime() - 60 * 1000);
  const expiresAt = new Date(now.getTime() + 29 * 60 * 1000);
  return {
    schema_version:
      config.input_contract.required_approval_schema_version,
    status: config.input_contract.required_approval_status,
    scope: config.input_contract.required_approval_scope,
    one_shot: true,
    consumed: false,
    issued_at: issuedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    reviewed_by: "reviewer_phase20",
    change_ticket: "change_phase20",
    plan_sha256: sha256(JSON.stringify(plan)),
    approved_workstream_ids: plan.items
      .filter((item) => item.priority === "P0")
      .map((item) => item.id),
    deferred_workstream_ids: plan.items
      .filter((item) => item.priority === "P2")
      .map((item) => item.id),
    authorizations: Object.fromEntries(
      approvalAuthorizationFields.map((field) => [
        field,
        field === "local_specification",
      ]),
    ),
  };
}

export function selfTest() {
  const now = new Date();
  const plan = syntheticPlan();
  const planHash = sha256(JSON.stringify(plan));
  const approval = syntheticApproval(plan, now);
  const approvalHash = sha256(JSON.stringify(approval));
  const approvalValidation = validateWorkstreamApproval(
    approval,
    plan,
    planHash,
    now,
  );
  const specification = buildLocalRemediationSpecification(
    plan,
    approval,
    { plan: planHash, approval: approvalHash },
  );
  const specificationValidation =
    validateLocalRemediationSpecification(
      specification,
      plan,
      approval,
      { plan: planHash, approval: approvalHash },
    );
  const baseline =
    approvalValidation.accepted && specificationValidation.accepted;
  const approvalContext = (candidate) =>
    validateWorkstreamApproval(candidate, plan, planHash, now).accepted;
  const specificationContext = (candidate) =>
    validateLocalRemediationSpecification(
      candidate,
      plan,
      approval,
      { plan: planHash, approval: approvalHash },
    ).accepted;
  const mutants = [
    () => approvalContext({ ...approval, schema_version: "bad" }),
    () => approvalContext({ ...approval, status: "approved_for_apply" }),
    () => approvalContext({ ...approval, scope: "production" }),
    () => approvalContext({ ...approval, consumed: true }),
    () => approvalContext({ ...approval, one_shot: false }),
    () => approvalContext({ ...approval, expires_at: approval.issued_at }),
    () => approvalContext({ ...approval, expires_at: new Date(now.getTime() + 61 * 60 * 1000).toISOString() }),
    () => approvalContext({ ...approval, expires_at: new Date(now.getTime() - 1).toISOString() }),
    () => approvalContext({ ...approval, reviewed_by: "" }),
    () => approvalContext({ ...approval, change_ticket: "drop table x" }),
    () => approvalContext({ ...approval, plan_sha256: "0".repeat(64) }),
    () => approvalContext({ ...approval, approved_workstream_ids: [] }),
    () => approvalContext({ ...approval, approved_workstream_ids: [...approval.approved_workstream_ids, approval.approved_workstream_ids[0]] }),
    () => approvalContext({ ...approval, deferred_workstream_ids: [approval.approved_workstream_ids[0]] }),
    () => approvalContext({ ...approval, deferred_workstream_ids: [] }),
    () => approvalContext({ ...approval, approved_workstream_ids: [...approval.approved_workstream_ids, "WS-UNKNOWN-999"] }),
    () => approvalContext({ ...approval, authorizations: { ...approval.authorizations, local_specification: false } }),
    () => approvalContext({ ...approval, authorizations: { ...approval.authorizations, sql_authoring: true } }),
    () => approvalContext({ ...approval, authorizations: { ...approval.authorizations, migration_generation: true } }),
    () => approvalContext({ ...approval, authorizations: { ...approval.authorizations, remote_write: true } }),
    () => approvalContext({ ...approval, authorizations: { ...approval.authorizations, production: true } }),
    () => approvalContext({ ...approval, sql: "alter table" }),
    () => specificationContext({ ...specification, schema_version: "bad" }),
    () => specificationContext({ ...specification, status: "applied" }),
    () => {
      const mutant = clone(specification);
      mutant.source.plan_sha256 = "0".repeat(64);
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.summary.approved_findings += 1;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items.pop();
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].finding_count += 1;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].design_class = "unsafe";
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].design_requirements.pop();
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].verification_cases.reverse();
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].rollback_required = false;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].human_sql_authoring_required = false;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].migration_file_created = true;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].raw_sql_included = true;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].remote_execution_allowed = true;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.items[0].sql = "alter table";
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.privacy.contains_object_names = true;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.privacy.contains_credentials = true;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.authorizations.migration_apply = true;
      return specificationContext(mutant);
    },
    () => {
      const mutant = clone(specification);
      mutant.authorizations.build = true;
      return specificationContext(mutant);
    },
  ];
  const rejected = mutants.filter((mutant) => mutant() === false).length;
  return {
    safe_baseline: baseline ? "accepted" : "rejected",
    approved_workstreams:
      specification.summary.approved_workstreams,
    deferred_workstreams:
      specification.summary.deferred_workstreams,
    approved_findings: specification.summary.approved_findings,
    mutants_rejected: rejected,
    mutants_total: mutants.length,
    remote_command_executed: false,
    file_written: false,
    migration_generated: false,
    migration_applied: false,
    production_touched: false,
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const payload = process.argv.includes("--self-test")
    ? selfTest()
    : assessLocalRemediationSpecification();
  console.log(JSON.stringify(payload, null, 2));
  if (
    process.argv.includes("--self-test") &&
    (payload.safe_baseline !== "accepted" ||
      payload.mutants_rejected !== payload.mutants_total)
  ) {
    process.exit(1);
  }
}

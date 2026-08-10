import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const config = JSON.parse(
  readFileSync(
    "config/atlas-10x-phase-015-isolated-migration-package.json",
    "utf8",
  ),
);
const phase014Config = JSON.parse(
  readFileSync(config.input_contract.phase_014_config_path, "utf8"),
);
const phase014Evidence = JSON.parse(
  readFileSync(config.input_contract.phase_014_evidence_path, "utf8"),
);
const phase015Evidence = JSON.parse(
  readFileSync(
    "artifacts/runtime/phase-015/isolated-migration-package-evidence.json",
    "utf8",
  ),
);

const nonMigratable = new Set(config.non_migratable_categories);
const reversibilityByCategory = {
  EXPOSED_TABLE_WITHOUT_RLS: "containment_only",
  ANON_BUSINESS_GRANT: "containment_only",
  UNSAFE_API_VIEW: "containment_only",
  SECURITY_DEFINER_PUBLIC_EXECUTE: "containment_only",
  POLICY_TRUSTS_USER_METADATA: "manual_only",
  BROAD_DEFAULT_PRIVILEGE: "containment_only",
  UPDATE_POLICY_INCOMPLETE: "manual_only",
  POLICY_USES_AUTH_ROLE: "manual_only",
  SECURITY_DEFINER_UNSAFE_SEARCH_PATH: "containment_only",
  SECURITY_DEFINER_AUTHENTICATED_EXECUTE_UNAPPROVED: "containment_only",
};

function readArtifact(path) {
  if (!existsSync(path)) {
    return { exists: false, parses: false, source: null, value: null };
  }
  try {
    const source = readFileSync(path, "utf8");
    return {
      exists: true,
      parses: true,
      source,
      value: JSON.parse(source),
    };
  } catch {
    return { exists: true, parses: false, source: null, value: null };
  }
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isOpaqueIdentifier(value) {
  return (
    typeof value === "string" &&
    /^[A-Z0-9][A-Z0-9_-]{2,63}$/i.test(value) &&
    !value.includes("@") &&
    !/\s/.test(value)
  );
}

function exactObjectKey(finding) {
  const subject = finding?.subject ?? {};
  return `${subject.type}:${subject.schema}:${subject.name}`;
}

function approvedIds(receipt) {
  return Array.isArray(receipt?.approved_finding_ids)
    ? receipt.approved_finding_ids
    : [];
}

function selectedFindings(backlog, receipt) {
  const approved = new Set(approvedIds(receipt));
  return (backlog?.findings ?? []).filter((finding) =>
    approved.has(finding.id),
  );
}

function p0PrecedesP1(backlog, selected) {
  const selectedIds = new Set(selected.map((finding) => finding.id));
  const selectedHasP1 = selected.some((finding) => finding.severity === "P1");
  if (!selectedHasP1) return true;
  return (backlog?.findings ?? [])
    .filter((finding) => finding.severity === "P0")
    .every((finding) => selectedIds.has(finding.id));
}

function dependencyClosureComplete(backlog, selected) {
  const selectedStages = new Set(
    selected.map((finding) => finding.remediation_stage),
  );
  const allFindings = backlog?.findings ?? [];
  return selected.every((finding) =>
    (finding.depends_on ?? []).every((stage) => {
      const dependencyFindings = allFindings.filter(
        (candidate) => candidate.remediation_stage === stage,
      );
      return (
        dependencyFindings.length === 0 ||
        (selectedStages.has(stage) &&
          dependencyFindings.every((candidate) =>
            selected.some((item) => item.id === candidate.id),
          ))
      );
    }),
  );
}

function rollbackDoesNotReopenExposure(selected, receipt) {
  const plans = receipt?.rollback_plans;
  if (!plans || typeof plans !== "object" || Array.isArray(plans)) return false;
  return selected.every((finding) => {
    const plan = plans[finding.id];
    const expectedClass = reversibilityByCategory[finding.category];
    return (
      plan?.reversibility === expectedClass &&
      plan?.restores_unsafe_access === false &&
      typeof plan?.safe_recovery === "string" &&
      plan.safe_recovery.trim().length >= 12
    );
  });
}

function safeSlug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function createMigrationPackage(backlog, receipt, context = {}) {
  const selected = selectedFindings(backlog, receipt);
  const groups = new Map();
  for (const finding of selected) {
    const key = `${finding.remediation_order}:${finding.remediation_stage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  const batches = [...groups.entries()]
    .sort(([a], [b]) => Number(a.split(":")[0]) - Number(b.split(":")[0]))
    .map(([key, findings], index) => {
      const [, stage] = key.split(":");
      const ordered = [...findings].sort((a, b) => a.id.localeCompare(b.id));
      return {
        sequence: index + 1,
        stage,
        proposed_migration_name: safeSlug(
          `atlas_security_${String(index + 1).padStart(2, "0")}_${stage}`,
        ),
        approved_finding_ids: ordered.map((finding) => finding.id),
        exact_object_allowlist: ordered.map(exactObjectKey).sort(),
        reversibility: ordered.map((finding) => ({
          finding_id: finding.id,
          class: reversibilityByCategory[finding.category],
          automatic_rollback_allowed: false,
          restores_unsafe_access: false,
        })),
        guards: {
          transaction_required_when_supported: true,
          lock_timeout_required: true,
          statement_timeout_required: true,
          preconditions_required: true,
          postconditions_required: true,
          idempotency_review_required: true,
        },
        verification: {
          dynamic_rls_tests_required: true,
          grants_verified_separately_from_rls: true,
          database_advisors_required: true,
          local_postgres_major: config.input_contract.expected_postgres_major,
        },
      };
    });

  return {
    schema_version:
      config.migration_package_contract.schema_version,
    status: "ready_for_cli_scaffold_review",
    scope: config.input_contract.required_approval_scope,
    source: {
      backlog_file: basename(
        config.input_contract.phase_014_backlog_path,
      ),
      backlog_sha256: context.backlog_sha256,
      snapshot_file: basename(
        config.input_contract.phase_013_snapshot_path,
      ),
      snapshot_sha256: context.snapshot_sha256,
      approval_change_ticket: receipt.change_ticket,
    },
    batches,
    cli_policy: {
      scaffold_only_after_review: true,
      scaffold_command:
        config.cli_contract.allowed_scaffold_command,
      rehearsal_command:
        config.cli_contract.allowed_rehearsal_command,
      forbidden_tokens: config.cli_contract.forbidden_tokens,
      remote_commands_allowed: false,
    },
    safety: {
      executable_sql_included: false,
      migration_file_created: false,
      business_row_dml_allowed: false,
      auth_user_read_allowed: false,
      automatic_rollback_allowed: false,
      rollback_may_not_restore_unsafe_access: true,
    },
  };
}

export function validateApprovedPackage(backlog, receipt, context) {
  const ids = approvedIds(receipt);
  const allIds = new Set((backlog?.findings ?? []).map((finding) => finding.id));
  const selected = selectedFindings(backlog, receipt);
  const uniqueIds = new Set(ids);
  const migratable =
    selected.length > 0 &&
    selected.every(
      (finding) =>
        !nonMigratable.has(finding.category) &&
        reversibilityByCategory[finding.category],
    );
  const gates = {
    backlog_schema_version_matches:
      backlog?.schema_version ===
      config.input_contract.required_backlog_schema_version,
    approval_schema_version_matches:
      receipt?.schema_version ===
      config.input_contract.required_approval_schema_version,
    approval_status_matches:
      receipt?.status === config.input_contract.required_approval_status,
    approval_scope_is_local_only:
      receipt?.scope === config.input_contract.required_approval_scope,
    approval_identity_is_opaque:
      isOpaqueIdentifier(receipt?.approved_by) &&
      isOpaqueIdentifier(receipt?.rollback_reviewed_by),
    approval_timestamp_is_valid:
      isIsoTimestamp(receipt?.approved_at) &&
      isIsoTimestamp(receipt?.rollback_reviewed_at),
    change_ticket_is_present: isOpaqueIdentifier(receipt?.change_ticket),
    rollback_review_is_present: receipt?.rollback_reviewed === true,
    backlog_hash_matches:
      isSha256(context?.backlog_sha256) &&
      receipt?.backlog_sha256 === context.backlog_sha256,
    snapshot_hash_matches:
      isSha256(context?.snapshot_sha256) &&
      receipt?.snapshot_sha256 === context.snapshot_sha256,
    approved_ids_are_known_and_unique:
      ids.length > 0 &&
      ids.length === uniqueIds.size &&
      ids.every((id) => allIds.has(id)),
    selected_findings_are_migratable: migratable,
    p0_precedes_p1: p0PrecedesP1(backlog, selected),
    dependency_closure_is_complete:
      dependencyClosureComplete(backlog, selected),
    exact_object_allowlist_is_derived:
      selected.length > 0 &&
      selected.every(
        (finding) =>
          typeof exactObjectKey(finding) === "string" &&
          exactObjectKey(finding).split(":").length === 3,
      ),
    reversibility_is_classified:
      selected.length > 0 &&
      selected.every((finding) =>
        config.migration_package_contract.reversibility_classes.includes(
          reversibilityByCategory[finding.category],
        ),
      ),
    rollback_does_not_reopen_exposure:
      rollbackDoesNotReopenExposure(selected, receipt),
  };
  return {
    accepted: Object.values(gates).every(Boolean),
    gates,
    selected,
  };
}

function isCommentOnly(source) {
  return source
    .split(/\r?\n/)
    .every((line) => line.trim() === "" || line.trim().startsWith("--"));
}

export function assessIsolatedMigrationPackage() {
  const backlogArtifact = readArtifact(
    config.input_contract.phase_014_backlog_path,
  );
  const snapshotArtifact = readArtifact(
    config.input_contract.phase_013_snapshot_path,
  );
  const approvalArtifact = readArtifact(
    config.input_contract.approval_receipt_path,
  );
  const backlog = backlogArtifact.value;
  const snapshot = snapshotArtifact.value;
  const receipt = approvalArtifact.value;
  const context = {
    backlog_sha256: backlogArtifact.source
      ? sha256(backlogArtifact.source)
      : null,
    snapshot_sha256: snapshotArtifact.source
      ? sha256(snapshotArtifact.source)
      : null,
  };
  const validation =
    backlog && receipt
      ? validateApprovedPackage(backlog, receipt, context)
      : { accepted: false, gates: {}, selected: [] };
  const migrationPackage = validation.accepted
    ? createMigrationPackage(backlog, receipt, context)
    : null;
  const reviewTemplate = readFileSync(
    config.migration_package_contract.review_template_path,
    "utf8",
  );

  const gates = {
    phase_014_backlog_exists: backlogArtifact.exists,
    phase_014_backlog_parses: backlogArtifact.parses,
    backlog_schema_version_matches:
      validation.gates.backlog_schema_version_matches === true,
    backlog_is_canonical:
      backlog?.review_status ===
        phase014Config.backlog_contract.review_status &&
      phase014Evidence.backlog?.generated === true &&
      phase014Evidence.source?.canonical_inventory_integrity_accepted === true,
    phase_013_snapshot_exists: snapshotArtifact.exists,
    phase_013_snapshot_parses: snapshotArtifact.parses,
    snapshot_schema_version_matches:
      snapshot?.schema_version ===
      config.input_contract.required_snapshot_schema_version,
    snapshot_source_is_approved_loopback:
      snapshot?.source?.kind === config.input_contract.required_source_kind,
    snapshot_postgres_major_matches:
      snapshot?.source?.postgres_major ===
      config.input_contract.expected_postgres_major,
    approval_receipt_exists: approvalArtifact.exists,
    approval_receipt_parses: approvalArtifact.parses,
    approval_schema_version_matches:
      validation.gates.approval_schema_version_matches === true,
    approval_status_matches:
      validation.gates.approval_status_matches === true,
    approval_scope_is_local_only:
      validation.gates.approval_scope_is_local_only === true,
    approval_identity_is_opaque:
      validation.gates.approval_identity_is_opaque === true,
    approval_timestamp_is_valid:
      validation.gates.approval_timestamp_is_valid === true,
    change_ticket_is_present:
      validation.gates.change_ticket_is_present === true,
    rollback_review_is_present:
      validation.gates.rollback_review_is_present === true,
    backlog_hash_matches:
      validation.gates.backlog_hash_matches === true,
    snapshot_hash_matches:
      validation.gates.snapshot_hash_matches === true,
    approved_ids_are_known_and_unique:
      validation.gates.approved_ids_are_known_and_unique === true,
    selected_findings_are_migratable:
      validation.gates.selected_findings_are_migratable === true,
    p0_precedes_p1: validation.gates.p0_precedes_p1 === true,
    dependency_closure_is_complete:
      validation.gates.dependency_closure_is_complete === true,
    exact_object_allowlist_is_derived:
      validation.gates.exact_object_allowlist_is_derived === true,
    reversibility_is_classified:
      validation.gates.reversibility_is_classified === true,
    rollback_does_not_reopen_exposure:
      validation.gates.rollback_does_not_reopen_exposure === true,
    transaction_and_timeouts_are_required:
      config.migration_package_contract.transaction_required_when_supported ===
        true &&
      config.migration_package_contract.lock_timeout_required === true &&
      config.migration_package_contract.statement_timeout_required === true,
    preconditions_and_postconditions_are_required:
      config.migration_package_contract.preconditions_required === true &&
      config.migration_package_contract.postconditions_required === true &&
      config.migration_package_contract.idempotency_review_required === true,
    dynamic_rls_tests_are_required:
      config.migration_package_contract.dynamic_rls_tests_required === true,
    database_advisors_are_required:
      config.migration_package_contract.database_advisors_required === true,
    local_cli_contract_is_verified:
      phase015Evidence.cli?.local_cli_detected === true &&
      phase015Evidence.cli?.version ===
        config.cli_contract.verified_cli_version &&
      phase015Evidence.cli?.help_inspected === true &&
      phase015Evidence.cli?.isolated_home_used === true,
    review_template_is_comment_only: isCommentOnly(reviewTemplate),
    executable_sql_not_generated:
      phase015Evidence.package?.executable_sql_generated === false &&
      migrationPackage?.safety?.executable_sql_included !== true,
    migration_file_not_created:
      phase015Evidence.package?.migration_file_created === false &&
      migrationPackage?.safety?.migration_file_created !== true,
    remote_or_linked_command_not_used:
      phase015Evidence.cli?.linked_command_used === false &&
      phase015Evidence.cli?.db_url_used === false &&
      phase015Evidence.cli?.db_push_used === false &&
      phase015Evidence.cli?.migration_repair_used === false,
    business_or_auth_data_not_read:
      phase015Evidence.safety?.business_data_read === false &&
      phase015Evidence.safety?.auth_user_data_read === false,
    live_homologation_not_touched:
      phase015Evidence.safety?.live_homologation_touched === false,
    build_not_executed:
      phase015Evidence.safety?.build_executed === false,
    package_not_created:
      phase015Evidence.safety?.release_package_created === false,
  };
  const orderedGates = Object.fromEntries(
    config.required_runtime_gates.map((name) => [name, gates[name] === true]),
  );
  const blockers = Object.entries(orderedGates)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const passed = config.required_runtime_gates.length - blockers.length;
  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      validation.accepted && blockers.length === 0
        ? "isolated_migration_package_ready_for_cli_scaffold_review"
        : "isolated_migration_contract_ready_approval_blocked",
    specification: {
      passed,
      total: config.required_runtime_gates.length,
      percentage: Math.round(
        (passed / config.required_runtime_gates.length) * 100,
      ),
      blockers,
    },
    approval: {
      accepted: validation.accepted,
      selected_findings: validation.selected.length,
      scope: receipt?.scope ?? null,
    },
    migration_package: migrationPackage
      ? {
          generated_in_memory: true,
          batches: migrationPackage.batches.length,
          executable_sql_included: false,
          migration_file_created: false,
        }
      : {
          generated_in_memory: false,
          batches: 0,
          executable_sql_included: false,
          migration_file_created: false,
        },
    safety: {
      local_contract_only: true,
      remote_commands_allowed: false,
      remote_write_executed: false,
      live_homologation_touched: false,
      business_or_auth_data_read: false,
      build_executed: false,
      release_package_created: false,
    },
    gates: orderedGates,
    conclusion: {
      ready_for_cli_scaffold_review:
        validation.accepted && blockers.length === 0,
      migration_created: false,
      migration_applied: false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticBacklog() {
  const findings = [
    {
      id: "SEC-P0-ONE",
      category: "ANON_BUSINESS_GRANT",
      severity: "P0",
      subject: { type: "table", schema: "public", name: "leads" },
      remediation_stage: "CONTAIN_EXPOSURE",
      remediation_order: 1,
      depends_on: [],
    },
    {
      id: "SEC-P1-TWO",
      category: "UPDATE_POLICY_INCOMPLETE",
      severity: "P1",
      subject: {
        type: "policy",
        schema: "public",
        name: "leads.update_own",
      },
      remediation_stage: "REPAIR_RLS_POLICIES",
      remediation_order: 2,
      depends_on: [],
    },
    {
      id: "SEC-P0-THREE",
      category: "SECURITY_DEFINER_PUBLIC_EXECUTE",
      severity: "P0",
      subject: {
        type: "function",
        schema: "public",
        name: "qualify_lead(uuid)",
      },
      remediation_stage: "HARDEN_PRIVILEGED_FUNCTIONS",
      remediation_order: 5,
      depends_on: ["CONTAIN_EXPOSURE"],
    },
  ];
  return {
    schema_version: config.input_contract.required_backlog_schema_version,
    review_status: "unapproved",
    findings,
    summary: { total: 3, P0: 2, P1: 1, approved: 0 },
  };
}

function syntheticReceipt(backlogSource, snapshotSource) {
  return {
    schema_version: config.input_contract.required_approval_schema_version,
    status: config.input_contract.required_approval_status,
    scope: config.input_contract.required_approval_scope,
    approved_by: "SECURITY_REVIEWER_01",
    approved_at: "2026-07-23T12:00:00Z",
    change_ticket: "ATLAS_SEC_015",
    rollback_reviewed: true,
    rollback_reviewed_by: "ROLLBACK_REVIEWER_01",
    rollback_reviewed_at: "2026-07-23T12:05:00Z",
    backlog_sha256: sha256(backlogSource),
    snapshot_sha256: sha256(snapshotSource),
    approved_finding_ids: ["SEC-P0-ONE"],
    rollback_plans: {
      "SEC-P0-ONE": {
        reversibility: "containment_only",
        restores_unsafe_access: false,
        safe_recovery: "Aplicar correção segura para frente sem restaurar anon.",
      },
    },
  };
}

function runSelfTest() {
  const backlog = syntheticBacklog();
  const backlogSource = JSON.stringify(backlog);
  const snapshotSource = JSON.stringify({
    schema_version: config.input_contract.required_snapshot_schema_version,
    source: {
      kind: config.input_contract.required_source_kind,
      postgres_major: config.input_contract.expected_postgres_major,
    },
  });
  const context = {
    backlog_sha256: sha256(backlogSource),
    snapshot_sha256: sha256(snapshotSource),
  };
  const receipt = syntheticReceipt(backlogSource, snapshotSource);
  const baseline = validateApprovedPackage(backlog, receipt, context);
  const mutants = [
    ["missing approval", { ...receipt, status: "pending" }],
    ["remote scope", { ...receipt, scope: "linked_project" }],
    ["email identity", { ...receipt, approved_by: "person@example.com" }],
    ["bad timestamp", { ...receipt, approved_at: "today" }],
    ["missing ticket", { ...receipt, change_ticket: "" }],
    ["rollback not reviewed", { ...receipt, rollback_reviewed: false }],
    ["wrong backlog hash", { ...receipt, backlog_sha256: "0".repeat(64) }],
    ["wrong snapshot hash", { ...receipt, snapshot_sha256: "0".repeat(64) }],
    [
      "unknown finding",
      { ...receipt, approved_finding_ids: ["SEC-UNKNOWN"] },
    ],
    [
      "duplicate finding",
      {
        ...receipt,
        approved_finding_ids: ["SEC-P0-ONE", "SEC-P0-ONE"],
      },
    ],
    [
      "p1 before p0",
      {
        ...receipt,
        approved_finding_ids: ["SEC-P1-TWO"],
        rollback_plans: {
          "SEC-P1-TWO": {
            reversibility: "manual_only",
            restores_unsafe_access: false,
            safe_recovery: "Corrigir a policy para frente com revisão humana.",
          },
        },
      },
    ],
    [
      "missing dependency closure",
      {
        ...receipt,
        approved_finding_ids: ["SEC-P0-THREE"],
        rollback_plans: {
          "SEC-P0-THREE": {
            reversibility: "containment_only",
            restores_unsafe_access: false,
            safe_recovery:
              "Corrigir a função para frente sem restaurar EXECUTE amplo.",
          },
        },
      },
    ],
    [
      "unsafe rollback",
      {
        ...receipt,
        rollback_plans: {
          "SEC-P0-ONE": {
            reversibility: "containment_only",
            restores_unsafe_access: true,
            safe_recovery: "Restaurar o grant anônimo anterior.",
          },
        },
      },
    ],
    [
      "wrong reversibility",
      {
        ...receipt,
        rollback_plans: {
          "SEC-P0-ONE": {
            reversibility: "exact_reversible",
            restores_unsafe_access: false,
            safe_recovery: "Aplicar correção segura para frente.",
          },
        },
      },
    ],
    [
      "missing recovery plan",
      {
        ...receipt,
        rollback_plans: {
          "SEC-P0-ONE": {
            reversibility: "containment_only",
            restores_unsafe_access: false,
            safe_recovery: "curto",
          },
        },
      },
    ],
  ];
  const classified = mutants.filter(([, mutant]) => {
    const result = validateApprovedPackage(backlog, mutant, context);
    return result.accepted === false;
  });
  const migrationPackage = createMigrationPackage(backlog, receipt, context);
  const result = {
    safe_baseline: baseline.accepted ? "accepted" : "rejected",
    mutants_classified: classified.length,
    mutants_total: mutants.length,
    package_batches: migrationPackage.batches.length,
    scope: migrationPackage.scope,
    executable_sql: "not_generated",
    migration_file: "not_created",
    automatic_rollback: "disabled",
  };
  console.log(JSON.stringify(result, null, 2));
  if (!baseline.accepted || classified.length !== mutants.length) {
    process.exit(1);
  }
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    console.log(
      JSON.stringify(assessIsolatedMigrationPackage(), null, 2),
    );
  }
}

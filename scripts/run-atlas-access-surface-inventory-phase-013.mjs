import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const config = JSON.parse(
  readFileSync(
    "config/atlas-10x-phase-013-access-surface-inventory.json",
    "utf8",
  ),
);
const phase012Evidence = JSON.parse(
  readFileSync(config.input_contract.phase_012_evidence_path, "utf8"),
);
const phase013Evidence = JSON.parse(
  readFileSync(config.inventory_contract.evidence_path, "utf8"),
);

const apiRoles = new Set(config.security_contract.api_roles);
const trustedExecuteGrantees = new Set(
  config.security_contract.trusted_execute_grantees,
);
const authenticatedDefinerAllowlist = new Set(
  config.security_contract.security_definer_authenticated_allowlist,
);
const canonicalBusinessTables = new Set(
  config.security_contract.canonical_business_tables,
);

function sha256(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

function checksumFor(path, checksumPath) {
  if (!existsSync(path) || !existsSync(checksumPath)) return null;
  const expected = readFileSync(checksumPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
      return match ? { digest: match[1].toLowerCase(), file: match[2] } : null;
    })
    .filter(Boolean)
    .find(({ file }) => file === path || file.endsWith(`/${path.split("/").pop()}`));
  return expected?.digest ?? null;
}

function grantEntriesValid(entries) {
  return (
    Array.isArray(entries) &&
    entries.every(
      (entry) =>
        typeof entry?.grantee === "string" &&
        Array.isArray(entry?.privileges) &&
        entry.privileges.every((privilege) => typeof privilege === "string"),
    )
  );
}

function grantsFor(object, role) {
  return (object.grants ?? [])
    .filter((entry) => entry.grantee === role)
    .flatMap((entry) => entry.privileges ?? []);
}

function isApiExposed(object) {
  return [...apiRoles].some((role) => grantsFor(object, role).length > 0);
}

function functionSignature(fn) {
  return `${fn.schema}.${fn.name}(${fn.identity_arguments ?? ""})`;
}

function policyRoles(policy) {
  return Array.isArray(policy.roles) ? policy.roles : [];
}

function roleCoveredBySelect(role, selectPolicies) {
  return selectPolicies.some((policy) => {
    const roles = policyRoles(policy);
    return roles.includes("public") || roles.includes(role);
  });
}

export function evaluateAccessSnapshot(snapshot, context = {}) {
  const collectionsPresent = config.inventory_contract.required_collections.every(
    (name) => Array.isArray(snapshot?.[name]),
  );
  const tables = collectionsPresent ? snapshot.tables : [];
  const views = collectionsPresent ? snapshot.views : [];
  const functions = collectionsPresent ? snapshot.functions : [];
  const policies = collectionsPresent ? snapshot.policies : [];
  const defaultPrivileges = collectionsPresent
    ? snapshot.default_privileges
    : [];

  const tablesByName = new Map(tables.map((table) => [table.name, table]));
  const canonicalEntitiesInventoried = [...canonicalBusinessTables].every(
    (name) => tablesByName.has(name),
  );
  const grantsComplete =
    tables.every((table) => grantEntriesValid(table.grants)) &&
    views.every((view) => grantEntriesValid(view.grants));
  const functionInventoryComplete = functions.every(
    (fn) =>
      typeof fn?.schema === "string" &&
      typeof fn?.name === "string" &&
      typeof fn?.security_definer === "boolean" &&
      typeof fn?.search_path_mode === "string" &&
      Array.isArray(fn?.execute_grantees),
  );
  const policyInventoryComplete = policies.every(
    (policy) =>
      typeof policy?.table === "string" &&
      typeof policy?.name === "string" &&
      typeof policy?.command === "string" &&
      Array.isArray(policy?.roles) &&
      typeof policy?.has_using === "boolean" &&
      typeof policy?.has_with_check === "boolean" &&
      typeof policy?.uses_auth_role === "boolean" &&
      typeof policy?.uses_user_metadata === "boolean",
  );
  const defaultPrivilegeInventoryComplete = defaultPrivileges.every(
    (entry) =>
      typeof entry?.owner === "string" &&
      typeof entry?.schema === "string" &&
      typeof entry?.object_type === "string" &&
      typeof entry?.grantee === "string" &&
      typeof entry?.privilege === "string",
  );
  const exposedTablesHaveRls = tables
    .filter(isApiExposed)
    .every((table) => table.rls_enabled === true);
  const viewsAreSafe = views.every(
    (view) => !isApiExposed(view) || view.security_invoker === true,
  );
  const securityDefiners = functions.filter(
    (fn) => fn.security_definer === true,
  );
  const securityDefinerSearchPathSafe = securityDefiners.every((fn) =>
    ["empty", "fixed"].includes(fn.search_path_mode),
  );
  const securityDefinerExecuteMinimal = securityDefiners.every((fn) =>
    fn.execute_grantees.every((grantee) => {
      if (trustedExecuteGrantees.has(grantee)) return true;
      if (grantee !== "authenticated") return false;
      return authenticatedDefinerAllowlist.has(functionSignature(fn));
    }),
  );
  const updatePolicies = policies.filter((policy) =>
    ["UPDATE", "ALL"].includes(policy.command),
  );
  const updatePoliciesComplete = updatePolicies.every((policy) => {
    if (!policy.has_using || !policy.has_with_check) return false;
    const selectPolicies = policies.filter(
      (candidate) =>
        candidate.table === policy.table &&
        ["SELECT", "ALL"].includes(candidate.command),
    );
    return policyRoles(policy).every((role) =>
      roleCoveredBySelect(role, selectPolicies),
    );
  });
  const noUserMetadata = policies.every(
    (policy) => policy.uses_user_metadata === false,
  );
  const noAuthRole = policies.every(
    (policy) => policy.uses_auth_role === false,
  );
  const anonymousBusinessAccessDenied = tables
    .filter((table) => canonicalBusinessTables.has(table.name))
    .every((table) => grantsFor(table, "anon").length === 0);
  const defaultPrivilegesSafe = defaultPrivileges.every(
    (entry) =>
      !["public", "anon", "authenticated"].includes(entry.grantee),
  );

  const checks = {
    catalog_snapshot_parses:
      snapshot?.schema_version === config.inventory_contract.schema_version,
    snapshot_source_is_approved_loopback:
      snapshot?.source?.kind === config.input_contract.allowed_target_kind &&
      snapshot?.source?.postgres_major ===
        config.input_contract.expected_postgres_major,
    snapshot_fingerprint_matches:
      typeof context.expectedFingerprint === "string" &&
      context.expectedFingerprint.length === 64 &&
      snapshot?.source?.target_fingerprint === context.expectedFingerprint,
    snapshot_transaction_is_read_only:
      snapshot?.source?.transaction_read_only === true,
    table_rows_not_read: snapshot?.source?.table_rows_read === false,
    required_collections_present: collectionsPresent,
    canonical_entities_inventoried: canonicalEntitiesInventoried,
    rls_inventory_complete:
      canonicalEntitiesInventoried &&
      tables.every((table) => typeof table?.rls_enabled === "boolean"),
    grant_inventory_complete: grantsComplete,
    default_privilege_inventory_complete:
      defaultPrivilegeInventoryComplete,
    view_inventory_complete: Array.isArray(snapshot?.views),
    security_definer_inventory_complete: functionInventoryComplete,
    function_execute_inventory_complete:
      functionInventoryComplete &&
      functions.every((fn) => Array.isArray(fn.execute_grantees)),
    policy_inventory_complete: policyInventoryComplete,
    exposed_tables_have_rls: exposedTablesHaveRls,
    views_are_safe_or_not_exposed: viewsAreSafe,
    security_definer_execute_is_minimal:
      securityDefinerExecuteMinimal,
    security_definer_search_path_is_safe:
      securityDefinerSearchPathSafe,
    update_policies_are_complete: updatePoliciesComplete,
    policies_do_not_use_user_metadata: noUserMetadata,
    policies_do_not_use_auth_role: noAuthRole,
    anonymous_business_access_is_denied:
      anonymousBusinessAccessDenied,
    default_privileges_are_safe: defaultPrivilegesSafe,
  };

  return {
    checks,
    metrics: {
      tables: tables.length,
      api_exposed_tables: tables.filter(isApiExposed).length,
      views: views.length,
      api_exposed_views: views.filter(isApiExposed).length,
      functions: functions.length,
      security_definer_functions: securityDefiners.length,
      policies: policies.length,
      update_policies: updatePolicies.length,
      default_privileges: defaultPrivileges.length,
    },
  };
}

export function inventoryHistoricalMigrations(directory = "supabase/migrations") {
  const files = existsSync(directory)
    ? readdirSync(directory)
        .filter((name) => name.endsWith(".sql"))
        .sort()
    : [];
  const source = files
    .map((name) => readFileSync(`${directory}/${name}`, "utf8"))
    .join("\n");
  const count = (pattern) => [...source.matchAll(pattern)].length;
  return {
    authority: "historical_migrations_only_not_effective_database_state",
    files: files.length,
    create_table_declarations: count(/\bcreate\s+table\b/gi),
    create_view_declarations: count(
      /\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\b/gi,
    ),
    create_function_declarations: count(
      /\bcreate\s+(?:or\s+replace\s+)?function\b/gi,
    ),
    policy_declarations: count(/\bcreate\s+policy\b/gi),
    rls_enablement_declarations: count(
      /\benable\s+row\s+level\s+security\b/gi,
    ),
    security_definer_declarations: count(/\bsecurity\s+definer\b/gi),
    grant_declarations: count(/\bgrant\b/gi),
    revoke_declarations: count(/\brevoke\b/gi),
    alter_default_privileges_declarations: count(
      /\balter\s+default\s+privileges\b/gi,
    ),
    security_invoker_declarations: count(/\bsecurity_invoker\b/gi),
  };
}

function loadSnapshot() {
  const path = config.inventory_contract.output_path;
  if (!existsSync(path)) return { path, snapshot: null, parseError: false };
  try {
    return {
      path,
      snapshot: JSON.parse(readFileSync(path, "utf8")),
      parseError: false,
    };
  } catch {
    return { path, snapshot: null, parseError: true };
  }
}

export function assessAccessSurface() {
  const sqlPath = config.input_contract.phase_012_sql_path;
  const checksumPath = config.input_contract.phase_012_checksum_path;
  const expectedChecksum = checksumFor(sqlPath, checksumPath);
  const checksumMatches =
    typeof expectedChecksum === "string" &&
    existsSync(sqlPath) &&
    sha256(sqlPath) === expectedChecksum;
  const snapshotResult = loadSnapshot();
  const expectedFingerprint =
    phase013Evidence.source?.target_fingerprint ??
    null;
  const snapshotAssessment = snapshotResult.snapshot
    ? evaluateAccessSnapshot(snapshotResult.snapshot, {
        expectedFingerprint,
      })
    : { checks: {}, metrics: {} };

  const gates = {
    phase_012_capture_accepted:
      phase012Evidence.status ===
        config.input_contract.required_phase_012_status &&
      phase012Evidence.capture?.executed === true,
    canonical_sql_exists: existsSync(sqlPath),
    phase_012_checksum_exists: existsSync(checksumPath),
    phase_012_checksum_matches: checksumMatches,
    catalog_snapshot_exists: existsSync(snapshotResult.path),
    catalog_snapshot_parses:
      snapshotResult.parseError === false &&
      snapshotAssessment.checks.catalog_snapshot_parses === true,
    ...snapshotAssessment.checks,
    live_homologation_not_touched:
      phase013Evidence.safety?.live_homologation_touched === false,
    remote_write_not_executed:
      phase013Evidence.safety?.remote_write_executed === false,
    build_not_executed:
      phase013Evidence.safety?.build_executed === false,
    package_not_created:
      phase013Evidence.safety?.package_created === false,
  };
  const orderedGates = Object.fromEntries(
    config.required_runtime_gates.map((name) => [name, gates[name] === true]),
  );
  const entries = Object.entries(orderedGates);
  const blockers = entries
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const passed = entries.length - blockers.length;

  return {
    schema_version: config.schema_version,
    phase: `${config.phase}/${config.total_phases}`,
    status:
      blockers.length === 0
        ? "access_surface_inventory_complete"
        : "access_surface_contract_ready_capture_blocked",
    specification: {
      passed,
      total: entries.length,
      percentage: Math.round((passed / entries.length) * 100),
      blockers,
    },
    canonical_inventory: snapshotAssessment.metrics,
    local_reference: inventoryHistoricalMigrations(),
    safety: {
      source_authority:
        "canonical_snapshot_required_for_security_approval",
      historical_migrations_are_not_runtime_proof: true,
      remote_read_executed:
        phase013Evidence.safety?.remote_read_executed === true,
      remote_write_executed:
        phase013Evidence.safety?.remote_write_executed === true,
      live_homologation_touched:
        phase013Evidence.safety?.live_homologation_touched === true,
      table_rows_read:
        phase013Evidence.inventory?.table_rows_read === true,
      build_executed:
        phase013Evidence.safety?.build_executed === true,
      package_created:
        phase013Evidence.safety?.package_created === true,
    },
    gates: orderedGates,
    conclusion: {
      security_approved: blockers.length === 0,
      inventory_captured:
        snapshotAssessment.checks.catalog_snapshot_parses === true,
      homologation_untouched:
        phase013Evidence.safety?.live_homologation_touched === false,
      next_phase: config.next_phase,
    },
  };
}

function syntheticSnapshot() {
  const tables = [...canonicalBusinessTables].map((name) => ({
    schema: "public",
    name,
    rls_enabled: true,
    rls_forced: false,
    grants: [
      {
        grantee: "authenticated",
        privileges: ["SELECT", "INSERT", "UPDATE"],
      },
      {
        grantee: "service_role",
        privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      },
    ],
  }));
  const policies = [...canonicalBusinessTables].flatMap((table) => [
    {
      schema: "public",
      table,
      name: `${table}_select`,
      command: "SELECT",
      roles: ["authenticated"],
      has_using: true,
      has_with_check: false,
      uses_auth_uid: true,
      uses_auth_role: false,
      uses_user_metadata: false,
    },
    {
      schema: "public",
      table,
      name: `${table}_update`,
      command: "UPDATE",
      roles: ["authenticated"],
      has_using: true,
      has_with_check: true,
      uses_auth_uid: true,
      uses_auth_role: false,
      uses_user_metadata: false,
    },
  ]);
  return {
    schema_version: config.inventory_contract.schema_version,
    source: {
      kind: config.input_contract.allowed_target_kind,
      postgres_major: config.input_contract.expected_postgres_major,
      target_fingerprint: "a".repeat(64),
      transaction_read_only: true,
      table_rows_read: false,
    },
    tables,
    views: [
      {
        schema: "public",
        name: "lead_summary",
        security_invoker: true,
        grants: [
          { grantee: "authenticated", privileges: ["SELECT"] },
        ],
      },
    ],
    functions: [
      {
        schema: "public",
        name: "internal_audit",
        identity_arguments: "",
        security_definer: true,
        search_path_mode: "empty",
        execute_grantees: ["service_role"],
      },
    ],
    policies,
    default_privileges: [],
  };
}

function runSelfTest() {
  const context = { expectedFingerprint: "a".repeat(64) };
  const baseline = syntheticSnapshot();
  const baselineResult = evaluateAccessSnapshot(baseline, context);
  if (Object.values(baselineResult.checks).some((value) => value !== true)) {
    throw new Error("synthetic safe baseline was rejected");
  }

  const mutants = [
    {
      gate: "exposed_tables_have_rls",
      mutate(snapshot) {
        snapshot.tables[0].rls_enabled = false;
      },
    },
    {
      gate: "views_are_safe_or_not_exposed",
      mutate(snapshot) {
        snapshot.views[0].security_invoker = false;
      },
    },
    {
      gate: "security_definer_execute_is_minimal",
      mutate(snapshot) {
        snapshot.functions[0].execute_grantees.push("public");
      },
    },
    {
      gate: "security_definer_search_path_is_safe",
      mutate(snapshot) {
        snapshot.functions[0].search_path_mode = "unsafe";
      },
    },
    {
      gate: "update_policies_are_complete",
      mutate(snapshot) {
        snapshot.policies.find((policy) => policy.command === "UPDATE").has_with_check =
          false;
      },
    },
    {
      gate: "policies_do_not_use_user_metadata",
      mutate(snapshot) {
        snapshot.policies[0].uses_user_metadata = true;
      },
    },
    {
      gate: "policies_do_not_use_auth_role",
      mutate(snapshot) {
        snapshot.policies[0].uses_auth_role = true;
      },
    },
    {
      gate: "anonymous_business_access_is_denied",
      mutate(snapshot) {
        snapshot.tables[0].grants.push({
          grantee: "anon",
          privileges: ["SELECT"],
        });
      },
    },
    {
      gate: "default_privileges_are_safe",
      mutate(snapshot) {
        snapshot.default_privileges.push({
          owner: "postgres",
          schema: "public",
          object_type: "functions",
          grantee: "public",
          privilege: "EXECUTE",
        });
      },
    },
  ];

  for (const mutant of mutants) {
    const candidate = structuredClone(baseline);
    mutant.mutate(candidate);
    const result = evaluateAccessSnapshot(candidate, context);
    if (result.checks[mutant.gate] !== false) {
      throw new Error(`mutant escaped gate ${mutant.gate}`);
    }
  }

  return { safe_baseline: "accepted", mutants_rejected: mutants.length };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  if (process.argv.includes("--self-test")) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
  } else {
    console.log(JSON.stringify(assessAccessSurface(), null, 2));
  }
}

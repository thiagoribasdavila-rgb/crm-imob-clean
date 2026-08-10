import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import process from "node:process";

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const config = readJson(
  new URL("../config/atlas-10x-phase-003-schema-parity.json", import.meta.url),
);
const defaultSnapshot = readJson(
  new URL(
    "../config/atlas-10x-phase-003-remote-schema-snapshot.json",
    import.meta.url,
  ),
);

const logicalName = (name) =>
  String(name).replace(/\.sql$/, "").replace(/^\d{14}_/, "");

const isEvidenceCurrent = (observedAt, now = new Date()) => {
  const observed = new Date(`${observedAt}T00:00:00.000Z`);
  const maximumAgeMs = Number(config.remote_evidence_max_age_days) * 86_400_000;
  return Number.isFinite(observed.getTime()) && now.getTime() - observed.getTime() <= maximumAgeMs;
};

export function inventoryLocalMigrations(files) {
  const migrationNames = files
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.slice(0, -4))
    .sort();
  const byVersion = new Map();

  for (const name of migrationNames) {
    const version = name.slice(0, 14);
    const bucket = byVersion.get(version) ?? [];
    bucket.push(`${name}.sql`);
    byVersion.set(version, bucket);
  }

  const duplicateVersions = Object.fromEntries(
    [...byVersion.entries()].filter(([, names]) => names.length > 1),
  );
  const logicalMigrations = [...new Set(migrationNames.map(logicalName))];
  const inventorySha256 = createHash("sha256")
    .update(migrationNames.join("\n"))
    .digest("hex");

  return {
    migrationNames,
    logicalMigrations,
    migrationFiles: migrationNames.length,
    uniqueVersions: byVersion.size,
    duplicateVersions,
    inventorySha256,
  };
}

const hasRequiredColumns = (snapshot, requiredColumns) =>
  Object.entries(requiredColumns).every(([table, required]) => {
    const observed = new Set(
      snapshot.target.observed_core_columns?.[table] ?? [],
    );
    return required.every((column) => observed.has(column));
  });

export function assessSchemaParity({
  localInventory,
  snapshot,
  hasSupabaseConfig,
}) {
  const comparison = snapshot.local_comparison;
  const target = snapshot.target;
  const selectedRows = target.selected_rows ?? {};
  const requiredTables = new Set(target.required_tables_present ?? []);
  const controls = {
    target_environment_confirmed:
      target.name === config.target_environment &&
      target.status === "ACTIVE_HEALTHY",
    remote_evidence_current:
      snapshot.source === "supabase_mcp_read_only" &&
      isEvidenceCurrent(snapshot.observed_at),
    local_inventory_matches_snapshot:
      localInventory.inventorySha256 === comparison.inventory_sha256,
    local_versions_unique:
      Object.keys(localInventory.duplicateVersions).length === 0,
    migration_history_logically_equal:
      comparison.local_logical_missing_remotely.length === 0 &&
      comparison.remote_logical_not_in_local.length === 0 &&
      target.logical_duplicate_names === 0,
    required_tables_present: config.required_core_tables.every((table) =>
      requiredTables.has(table),
    ),
    required_columns_present: hasRequiredColumns(
      snapshot,
      config.required_core_columns,
    ),
    public_tables_protected_by_rls:
      target.tables > 0 &&
      target.rls_enabled_tables === target.tables &&
      target.rls_disabled_tables === 0,
    privilege_evidence_complete: Object.entries(
      snapshot.privilege_evidence,
    )
      .filter(([key]) => key.endsWith("_verified"))
      .every(([, value]) => value === true),
    operational_tenant_present:
      Number(selectedRows.organizations ?? 0) > 0 &&
      Number(selectedRows.profiles ?? 0) > 0,
    operational_data_present:
      Number(selectedRows.leads ?? 0) > 0 &&
      (Number(selectedRows.projects ?? 0) > 0 ||
        Number(selectedRows.developments ?? 0) > 0),
    local_project_binding_present: hasSupabaseConfig,
  };
  const passed = Object.values(controls).filter(Boolean).length;
  const blockers = Object.entries(controls)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    schema_version: config.schema_version,
    phase: config.phase,
    total_phases: config.total_phases,
    status: blockers.length ? "schema_parity_blocked" : "schema_parity_ready",
    target: {
      name: target.name,
      tables: target.tables,
      migrations: target.migration_records,
      estimated_rows: target.estimated_rows,
    },
    legacy: {
      name: snapshot.legacy.name,
      tables: snapshot.legacy.tables,
      migrations: snapshot.legacy.migration_records,
      estimated_rows: snapshot.legacy.estimated_rows,
    },
    local: {
      migrations: localInventory.migrationFiles,
      unique_versions: localInventory.uniqueVersions,
      duplicate_versions: localInventory.duplicateVersions,
      inventory_matches_snapshot:
        controls.local_inventory_matches_snapshot,
    },
    drift: {
      local_logical_missing_remotely:
        comparison.local_logical_missing_remotely,
      remote_logical_not_in_local:
        comparison.remote_logical_not_in_local,
      remote_logical_duplicate_names: target.logical_duplicate_names,
    },
    controls: {
      passed,
      total: Object.keys(controls).length,
      results: controls,
      blockers,
    },
    release: {
      build_executed: false,
      package_created: false,
      remote_write_executed: false,
      production_ready: false,
      reason: blockers.length
        ? "schema_history_or_operational_tenant_not_proven"
        : "human_release_decision_still_required",
    },
    next_phase: config.next_phase,
  };
}

function selfTest() {
  const files = [
    "20260723010000_first.sql",
    "20260723020000_second.sql",
  ];
  const local = inventoryLocalMigrations(files);
  const snapshot = {
    ...defaultSnapshot,
    observed_at: new Date().toISOString().slice(0, 10),
    target: {
      ...defaultSnapshot.target,
      name: config.target_environment,
      status: "ACTIVE_HEALTHY",
      migration_records: 2,
      logical_migrations: 2,
      logical_duplicate_names: 0,
      tables: config.required_core_tables.length,
      rls_enabled_tables: config.required_core_tables.length,
      rls_disabled_tables: 0,
      selected_rows: {
        organizations: 1,
        profiles: 1,
        leads: 1,
        projects: 1,
        developments: 0,
      },
      required_tables_present: config.required_core_tables,
      observed_core_columns: config.required_core_columns,
    },
    local_comparison: {
      migration_files: 2,
      logical_migrations: 2,
      unique_versions: 2,
      inventory_sha256: local.inventorySha256,
      local_logical_missing_remotely: [],
      remote_logical_not_in_local: [],
      duplicate_local_versions: {},
    },
    privilege_evidence: {
      policies_verified: true,
      grants_verified: true,
      security_definer_functions_verified: true,
    },
  };
  const ready = assessSchemaParity({
    localInventory: local,
    snapshot,
    hasSupabaseConfig: true,
  });
  const duplicate = inventoryLocalMigrations([
    ...files,
    "20260723020000_collision.sql",
  ]);
  const blocked = assessSchemaParity({
    localInventory: duplicate,
    snapshot,
    hasSupabaseConfig: true,
  });
  const failures = [];

  if (ready.status !== "schema_parity_ready")
    failures.push("matching_schema_must_be_ready");
  if (blocked.status !== "schema_parity_blocked")
    failures.push("duplicate_version_must_block");
  if (blocked.release.production_ready !== false)
    failures.push("assessment_must_never_promote_production");
  if (blocked.release.remote_write_executed !== false)
    failures.push("assessment_must_be_read_only");

  if (failures.length) {
    console.error(`ATLAS SCHEMA PARITY SELF-TEST: FAILED (${failures.join(", ")})`);
    process.exit(1);
  }
  console.log("ATLAS SCHEMA PARITY SELF-TEST: PASSED");
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
  const localInventory = inventoryLocalMigrations(
    readdirSync(migrationDirectory),
  );
  const report = assessSchemaParity({
    localInventory,
    snapshot: defaultSnapshot,
    hasSupabaseConfig: existsSync(
      new URL("../supabase/config.toml", import.meta.url),
    ),
  });
  console.log(JSON.stringify(report, null, 2));
}

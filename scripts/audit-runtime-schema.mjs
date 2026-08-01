import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const surfaces = [
  ["organizations", ["id", "name"]],
  ["profiles", ["id", "organization_id", "full_name", "role", "access_role", "commercial_role", "reports_to", "active", "avatar_url", "phone", "creci", "bio", "updated_at"]],
  ["leads", ["id", "organization_id", "assigned_to", "development_id", "status", "score", "temperature", "bedrooms", "preferred_regions", "purpose", "next_action_at", "last_interaction_at", "metadata", "updated_at"]],
  ["tasks", ["id", "organization_id"]],
  ["developers", ["id", "organization_id", "trade_name", "status"]],
  ["developments", ["id", "organization_id", "developer_id", "name", "status"]],
  ["project_materials", ["id", "organization_id", "development_id", "material_type", "is_current", "review_status"]],
  ["properties", ["id", "organization_id", "development_id", "status"]],
];

async function probeColumns(table, columns) {
  const { error: groupedError } = await client.from(table).select(columns.join(",")).limit(0);
  if (!groupedError) return { missingColumns: [], codes: [] };

  const probes = await Promise.all(columns.map(async (column) => {
    const { error } = await client.from(table).select(column).limit(0);
    return error ? { column, code: error.code ?? "unknown" } : null;
  }));
  const missing = probes.filter(Boolean);
  return {
    missingColumns: missing.map((item) => item.column),
    codes: [...new Set(missing.map((item) => item.code))],
  };
}

const results = [];
for (const [table, columns] of surfaces) {
  const { error: tableError } = await client.from(table).select("*").limit(0);
  if (tableError) {
    results.push({ table, status: "table_missing", code: tableError.code ?? "unknown", missingColumns: columns });
    continue;
  }
  const probe = await probeColumns(table, columns);
  results.push({
    table,
    status: probe.missingColumns.length ? "migration_required" : "ready",
    code: probe.codes[0] ?? null,
    missingColumns: probe.missingColumns,
  });
}

const failed = results.filter((item) => item.status !== "ready");
console.log("ATLAS RUNTIME SCHEMA AUDIT");
for (const item of results) {
  if (item.status === "ready") {
    console.log(`✓ ${item.table}`);
    continue;
  }
  const label = item.status === "table_missing" ? "tabela ausente" : "migração necessária";
  console.log(`✗ ${item.table}: ${label}; campos: ${item.missingColumns.join(", ")}; código: ${item.code}`);
}
console.log(`\nResumo: ${results.length - failed.length}/${results.length} superfícies operacionais prontas; alterações executadas: 0.`);
if (failed.length) {
  console.error("Resultado: MIGRAÇÃO NECESSÁRIA. Valide a cadeia em staging antes de qualquer alteração no banco publicado.");
  process.exit(1);
}
console.log("Resultado: PRONTO. O contrato V3 está disponível e nenhuma alteração foi executada.");

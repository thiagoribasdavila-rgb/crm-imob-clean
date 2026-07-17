import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const surfaces = [
  ["organizations", "id,name"],
  ["profiles", "id,organization_id,full_name,role,access_role,commercial_role,reports_to,active,avatar_url,phone,creci,bio,updated_at"],
  ["leads", "id,organization_id,assigned_to,development_id,status,score,temperature,bedrooms,preferred_regions,purpose,next_action_at,last_interaction_at,metadata,updated_at"],
  ["tasks", "id,organization_id"],
  ["developers", "id,organization_id,trade_name,status"],
  ["developments", "id,organization_id,developer_id,name,status"],
  ["project_materials", "id,organization_id,development_id,material_type,is_current,review_status"],
  ["properties", "id,organization_id,development_id,status"],
];

const results = [];
for (const [table, columns] of surfaces) {
  const { error } = await client.from(table).select(columns).limit(1);
  results.push({ table, status: error ? "failed" : "ready", code: error?.code ?? null });
}

const failed = results.filter((item) => item.status === "failed");
console.log("ATLAS RUNTIME SCHEMA AUDIT");
for (const item of results) console.log(`${item.status === "ready" ? "✓" : "✗"} ${item.table}${item.status === "ready" ? "" : ` (${item.code || "unknown"})`}`);
console.log(`\nResumo: ${results.length - failed.length}/${results.length} superfícies operacionais prontas; alterações executadas: 0.`);
if (failed.length) {
  console.error("Banco incompatível com o V3. Aplique e verifique as migrations antes de homologar.");
  process.exit(1);
}

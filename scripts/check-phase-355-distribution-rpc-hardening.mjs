import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");

const migration = read(
  "supabase/migrations/20260809215625_phase_355_distribution_rpc_hardening.sql",
).toLowerCase();
const route = read("app/api/v1/crm/distribution/route.ts");

for (const fragment of [
  "to_regprocedure(",
  "public.distribute_project_leads_v5(uuid,uuid,uuid,integer,integer)",
  "from public, anon, authenticated",
  "to service_role",
]) {
  assert.ok(migration.includes(fragment), `Hardening migration must contain: ${fragment}`);
}

for (const fragment of [
  'if (role !== "director")',
  "const admin = getSupabaseAdmin()",
  'admin.rpc("distribute_project_leads_v6"',
  "isMissingSchema(distributionResult.error)",
  'admin.rpc("distribute_project_leads_v4"',
]) {
  assert.ok(route.includes(fragment), `Distribution route must contain: ${fragment}`);
}

assert.equal(
  route.includes('supabase.rpc("distribute_project_leads_v5"'),
  false,
  "The browser-scoped Supabase client must not execute the v5 distribution RPC.",
);
assert.equal(
  route.includes('supabase.rpc("distribute_project_leads_v6"'),
  false,
  "The browser-scoped Supabase client must not execute the v6 distribution RPC.",
);

console.log("Phase 355 distribution RPC hardening contract passed.");

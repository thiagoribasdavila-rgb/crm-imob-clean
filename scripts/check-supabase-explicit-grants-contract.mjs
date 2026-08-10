import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath =
  "supabase/migrations/20260723090000_explicit_data_api_grants.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");
const failures = [];
let checks = 0;

function expect(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const browserReadable = [
  "integrations",
  "automation_rules",
  "message_templates",
  "conversations",
  "messages",
  "creative_assets",
  "campaign_events",
  "approval_requests",
];

const serverOnly = [
  "idempotency_keys",
  "integration_outbox",
  "dead_letter_events",
  "feature_flags",
  "atlas_decisions",
  "atlas_agent_runs",
  "digital_twin_snapshots",
  "atlas_events",
  "atlas_entities",
  "atlas_relationships",
  "atlas_memories",
  "atlas_simulations",
  "atlas_recommendations",
  "atlas_data_products",
  "atlas_api_clients",
  "atlas_launch_rooms",
  "atlas_inventory_reservations",
  "ai_conversations",
  "ai_messages",
  "ai_tool_calls",
  "ai_usage",
];

expect(
  migration.includes("from anon, authenticated"),
  "a migration precisa revogar o acesso implícito de anon e authenticated",
);
expect(
  migration.includes("to service_role"),
  "a migration precisa conceder acesso explícito ao serviço do servidor",
);
expect(
  migration.includes("grant select on table"),
  "as leituras de telas ativas precisam de um grant explícito",
);

for (const table of browserReadable) {
  expect(
    migration.includes(`public.${table}`),
    `a tabela ${table} precisa estar no contrato explícito`,
  );
}

for (const table of serverOnly) {
  expect(
    migration.includes(`public.${table}`),
    `a tabela interna ${table} precisa estar no contrato do service_role`,
  );
}

const authenticatedGrant =
  migration.match(
    /grant select on table([\s\S]*?)to authenticated;/i,
  )?.[1] ?? "";

for (const table of browserReadable) {
  expect(
    authenticatedGrant.includes(`public.${table}`),
    `authenticated precisa de SELECT em ${table}`,
  );
}

for (const table of serverOnly) {
  expect(
    !authenticatedGrant.includes(`public.${table}`),
    `${table} deve permanecer fora do grant de authenticated`,
  );
}

if (failures.length) {
  console.error(
    `Contrato de grants Supabase: ${failures.length} falha(s) em ${checks} verificações.`,
  );
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Contrato de grants Supabase: ${checks}/${checks} verificações aprovadas. ` +
    "Leituras tenant-safe e tabelas internas server-only estão separadas.",
);

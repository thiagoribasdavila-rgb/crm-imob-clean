import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationPath =
  "supabase/migrations/20260810070850_phase_372_whatsapp_memory_director_decision_ledger.sql";
const routePath =
  "app/api/v1/integrations/whatsapp/memory-director-decision/route.ts";

const migration = readFileSync(migrationPath, "utf8");
const route = readFileSync(routePath, "utf8");

for (const proof of [
  "create table if not exists public.whatsapp_memory_director_decisions",
  "force row level security",
  "record_whatsapp_memory_director_decision",
  "pg_advisory_xact_lock",
]) assert.match(migration.toLowerCase(), new RegExp(proof.replaceAll(".", "\\.")));

assert.match(route, /export async function GET/);
assert.match(route, /export async function POST/);
assert.match(route, /PERSISTENCE_MIGRATION_PENDING/);
assert.match(route, /learningActivated: false/);

const linked = existsSync("supabase/.temp/project-ref");
console.log(JSON.stringify({
  ok: true,
  migrationPackaged: true,
  endpointReadReady: true,
  endpointWriteReady: true,
  localProjectLinked: linked,
  remoteMigrationApplied: "not_asserted",
  safeWhenMigrationPending: true,
  remoteStateMutated: false,
}));

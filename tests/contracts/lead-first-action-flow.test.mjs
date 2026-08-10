import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("API exige autenticação, confirmação humana, escopo e idempotência", async () => {
  const route = await source("app/api/v1/leads/[id]/first-action/route.ts");

  assert.match(route, /requireAccessContext\(request\)/);
  assert.match(route, /enforceRateLimit\(request/);
  assert.match(route, /readIdempotencyKey\(request\)/);
  assert.match(route, /body\.humanConfirmed !== true/);
  assert.match(route, /\.from\("leads"\)/);
  assert.match(route, /\.eq\("organization_id", organizationId\)/);
  assert.match(route, /admin\.rpc\("record_lead_first_action"/);
  assert.match(route, /Nada foi alterado; tente novamente/);
});

test("RPC mantém primeira ação, tarefa, lead e evento na mesma transação", async () => {
  const migration = await source(
    "supabase/migrations/20260809120000_phase_352_atomic_first_action.sql",
  );

  assert.match(migration, /security definer/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /insert into public\.activities/);
  assert.match(migration, /insert into public\.tasks/);
  assert.match(migration, /update public\.leads/);
  assert.match(migration, /insert into public\.lead_events/);
  assert.match(migration, /grant execute on function[\s\S]+to service_role/);
  assert.match(migration, /revoke all on function[\s\S]+from authenticated/);
});

test("RPC valida ator e bloqueia a lead antes de reproduzir uma gravação", async () => {
  const migration = await source(
    "supabase/migrations/20260809120000_phase_352_atomic_first_action.sql",
  );
  const actorValidation = migration.indexOf("first_action_actor_invalid");
  const leadLock = migration.indexOf("for update;");
  const replayLookup = migration.indexOf("metadata ->> 'idempotencyKey'");

  assert.ok(actorValidation > -1);
  assert.ok(leadLock > actorValidation);
  assert.ok(replayLookup > leadLock);
  assert.match(
    migration,
    /where p\.id = v_lead\.assigned_to[\s\S]+p\.organization_id = p_organization[\s\S]+p\.active is true/,
  );
});

test("interface registra uma única intenção explícita e recarrega a fila", async () => {
  const page = await source("app/(crm)/leads/page.tsx");

  assert.match(page, /\/api\/v1\/leads\/\$\{lead\.id\}\/first-action/);
  assert.match(page, /"Idempotency-Key"/);
  assert.match(page, /humanConfirmed: true/);
  assert.match(page, /Confirmar ação e criar tarefa/);
  assert.match(page, /setReloadKey\(\(current\) => current \+ 1\)/);
  assert.match(page, /type="datetime-local"/);
});

test("formulário de primeira ação possui adaptação responsiva", async () => {
  const css = await source("app/globals.css");
  assert.match(css, /\.atlas-leads-first-action-grid/);
  assert.match(css, /@media[^}]+[\s\S]+\.atlas-leads-first-action-grid/);
});

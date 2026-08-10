import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../../app/api/v1/crm/distribution/route.ts", import.meta.url),
  "utf8",
);
const directorGuard = readFileSync(
  new URL(
    "../../supabase/migrations/20260810120000_phase_363_distribution_director_tenant_guard.sql",
    import.meta.url,
  ),
  "utf8",
);
const distributionV3 = readFileSync(
  new URL(
    "../../supabase/migrations/20260718083000_phase_57_explainable_distribution_priority.sql",
    import.meta.url,
  ),
  "utf8",
);

test("a identidade autenticada é a única origem da organização e do ator", () => {
  assert.match(route, /const organizationId = identity\.access\.organization\.id/);
  assert.match(route, /const actorId = identity\.access\.profile\.id/);
  assert.doesNotMatch(route, /organizationId\??:\s*string/);
  assert.doesNotMatch(route, /actorId\??:\s*string/);
});

test("heartbeat é pessoal, mas distribuir fica atrás da barreira de diretoria", () => {
  const post = route.indexOf("export async function POST");
  const heartbeat = route.indexOf('body.action === "heartbeat"', post);
  const director = route.indexOf('if (role !== "director")', heartbeat);
  const distribute = route.indexOf('body.action === "distribute"', heartbeat);

  assert.ok(post >= 0 && heartbeat > post, "POST e heartbeat existem");
  assert.ok(
    director > heartbeat && distribute > director,
    "a autorização antecede a distribuição imediata",
  );
  assert.match(
    route.slice(director, distribute),
    /Somente a diretoria pode alterar a distribuição/,
  );
});

test("o RPC recebe ator, organização e projeto resolvidos no servidor", () => {
  assert.match(route, /admin\.rpc\("distribute_project_leads_v6",\s*\{/);
  assert.match(
    route,
    /isMissingSchema\(distributionResult\.error\)[\s\S]{0,240}distribute_project_leads_v4/,
  );
  assert.match(route, /p_actor_id: actorId/);
  assert.match(route, /p_organization_id: organizationId/);
  assert.match(route, /p_development_id: developmentId/);
});

test("as consultas centrais e administrativas permanecem isoladas por organização", () => {
  for (const table of [
    "profiles",
    "developments",
    "leads",
    "commercial_presence",
    "project_distribution_members",
    "distribution_roster",
    "broker_capacity_limits",
    "lead_distribution_priority_rules",
    "lead_source_distribution_members",
    "lead_distribution_events",
  ]) {
    const start = route.indexOf(`.from("${table}")`);
    assert.ok(start >= 0, `${table} participa da rota`);
    assert.match(
      route.slice(start, start + 450),
      /\.eq\("organization_id", organizationId\)/,
      `${table} usa o tenant autenticado`,
    );
  }
});

test("a configuração canônica recebe somente o tenant autenticado", () => {
  assert.match(route, /configure_project_distribution_roster_v1/);
  assert.match(route, /configure_project_distribution_member_v1/);
  assert.match(route, /p_actor_id: actorId/);
  assert.match(route, /p_organization_id: organizationId/);
  assert.match(route, /p_development_id: developmentId/);
  assert.match(route, /EMPTY_DISTRIBUTION_ROSTER/);
});

test("a migration V4 exige diretor ativo da mesma organização", () => {
  assert.match(directorGuard, /p\.id = p_actor_id/);
  assert.match(directorGuard, /p\.organization_id = p_organization_id/);
  assert.match(directorGuard, /coalesce\(p\.active, true\) = true/);
  assert.match(directorGuard, /actor_role is distinct from 'director'/);
  assert.match(directorGuard, /distribution_director_only/);
});

test("projeto, algoritmo V3 e reservas preservam o mesmo tenant", () => {
  assert.match(
    directorGuard,
    /d\.id = p_development_id[\s\S]{0,100}d\.organization_id = p_organization_id/,
  );
  assert.match(
    directorGuard,
    /distribute_project_leads_v3\([\s\S]{0,160}p_organization_id/,
  );
  assert.match(
    directorGuard,
    /where organization_id = p_organization_id[\s\S]{0,160}lead_id/,
  );
  assert.match(
    distributionV3,
    /l\.organization_id=p_organization_id and l\.development_id=p_development_id/,
  );
});

test("o RPC de distribuição não é exposto a clientes do Supabase", () => {
  assert.match(
    directorGuard,
    /revoke all on function public\.distribute_project_leads_v4[\s\S]{0,160}from public, anon, authenticated/,
  );
  assert.match(
    directorGuard,
    /grant execute on function public\.distribute_project_leads_v4[\s\S]{0,160}to service_role/,
  );
});

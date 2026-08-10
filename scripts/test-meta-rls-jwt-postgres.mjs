import { readFileSync } from "node:fs";

const hierarchyMigration = readFileSync(
  new URL("../supabase/migrations/20260716212459_commercial_hierarchy_and_bulk_transfer.sql", import.meta.url),
  "utf8",
);

async function loadPGlite() {
  try {
    return await import("@electric-sql/pglite");
  } catch (error) {
    const override = process.env.ATLAS_PGLITE_MODULE;
    if (!override) throw error;
    return import(override);
  }
}

const { PGlite } = await loadPGlite();
const db = new PGlite();
const assertions = [];
const scenarios = [];

function check(condition, label) {
  if (!condition) throw new Error(`assertion_failed:${label}`);
  assertions.push(label);
}

async function scenario(id, execute) {
  const before = assertions.length;
  await execute();
  scenarios.push({ id, status: "passed", assertions: assertions.length - before });
}

const ids = {
  orgA: "10000000-0000-4000-8000-000000000001",
  orgB: "20000000-0000-4000-8000-000000000001",
  directorA: "10000000-0000-4000-8000-000000000011",
  superintendentA: "10000000-0000-4000-8000-000000000012",
  managerA: "10000000-0000-4000-8000-000000000013",
  brokerA1: "10000000-0000-4000-8000-000000000014",
  brokerA2: "10000000-0000-4000-8000-000000000015",
  managerOther: "10000000-0000-4000-8000-000000000016",
  brokerOther: "10000000-0000-4000-8000-000000000017",
  inactiveBroker: "10000000-0000-4000-8000-000000000018",
  directorB: "20000000-0000-4000-8000-000000000011",
  brokerB: "20000000-0000-4000-8000-000000000012",
  leadA1: "10000000-0000-4000-8000-000000000101",
  leadA2: "10000000-0000-4000-8000-000000000102",
  leadOther: "10000000-0000-4000-8000-000000000103",
  leadUnassigned: "10000000-0000-4000-8000-000000000104",
  leadInactive: "10000000-0000-4000-8000-000000000105",
  leadB: "20000000-0000-4000-8000-000000000101",
};

const quoted = (value) => `'${value}'`;

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create function auth.uid()
  returns uuid language sql stable set search_path = '' as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create function auth.jwt()
  returns jsonb language sql stable set search_path = '' as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$;

  create table public.organizations (
    id uuid primary key,
    name text not null,
    status text not null default 'active'
  );
  create table public.profiles (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    name text not null,
    role text not null,
    active boolean not null default true,
    created_at timestamptz not null default now()
  );
  create table public.leads (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    name text not null,
    status text not null default 'new',
    assigned_to uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create function public.current_organization_id()
  returns uuid language sql stable security definer set search_path = '' as $$
    select organization_id from public.profiles
    where id = (select auth.uid()) and active = true
  $$;

  alter table public.organizations enable row level security;
  alter table public.profiles enable row level security;
  alter table public.leads enable row level security;

  create policy profiles_select_org on public.profiles for select to authenticated
    using (organization_id = (select public.current_organization_id()));
  create policy profiles_update_self on public.profiles for update to authenticated
    using (id = (select auth.uid())) with check (id = (select auth.uid()));
  create policy leads_org_access on public.leads for all to authenticated
    using (organization_id = (select public.current_organization_id()))
    with check (organization_id = (select public.current_organization_id()));

  revoke all on public.organizations, public.profiles, public.leads from anon;
  grant select, insert, update, delete on public.profiles, public.leads to authenticated;
  grant select on public.organizations to authenticated;
  grant all on public.organizations, public.profiles, public.leads to service_role;
`);

await db.exec(`
  insert into public.organizations (id, name) values
    (${quoted(ids.orgA)}, 'Organizacao A'),
    (${quoted(ids.orgB)}, 'Organizacao B');
  insert into public.profiles (id, organization_id, name, role, active) values
    (${quoted(ids.directorA)}, ${quoted(ids.orgA)}, 'Diretoria A', 'admin', true),
    (${quoted(ids.superintendentA)}, ${quoted(ids.orgA)}, 'Superintendencia A', 'manager', true),
    (${quoted(ids.managerA)}, ${quoted(ids.orgA)}, 'Gerencia A', 'manager', true),
    (${quoted(ids.brokerA1)}, ${quoted(ids.orgA)}, 'Corretor A1', 'broker', true),
    (${quoted(ids.brokerA2)}, ${quoted(ids.orgA)}, 'Corretor A2', 'broker', true),
    (${quoted(ids.managerOther)}, ${quoted(ids.orgA)}, 'Gerencia Outra', 'manager', true),
    (${quoted(ids.brokerOther)}, ${quoted(ids.orgA)}, 'Corretor Outro', 'broker', true),
    (${quoted(ids.inactiveBroker)}, ${quoted(ids.orgA)}, 'Corretor Inativo', 'broker', false),
    (${quoted(ids.directorB)}, ${quoted(ids.orgB)}, 'Diretoria B', 'admin', true),
    (${quoted(ids.brokerB)}, ${quoted(ids.orgB)}, 'Corretor B', 'broker', true);
  insert into public.leads (id, organization_id, name, status, assigned_to) values
    (${quoted(ids.leadA1)}, ${quoted(ids.orgA)}, 'Lead A1', 'new', ${quoted(ids.brokerA1)}),
    (${quoted(ids.leadA2)}, ${quoted(ids.orgA)}, 'Lead A2', 'new', ${quoted(ids.brokerA2)}),
    (${quoted(ids.leadOther)}, ${quoted(ids.orgA)}, 'Lead Outra Equipe', 'new', ${quoted(ids.brokerOther)}),
    (${quoted(ids.leadUnassigned)}, ${quoted(ids.orgA)}, 'Lead Sem Responsavel', 'new', null),
    (${quoted(ids.leadInactive)}, ${quoted(ids.orgA)}, 'Lead Responsavel Inativo', 'new', ${quoted(ids.inactiveBroker)}),
    (${quoted(ids.leadB)}, ${quoted(ids.orgB)}, 'Lead B', 'new', ${quoted(ids.brokerB)});
`);

await db.exec(hierarchyMigration);
await db.exec(`
  update public.profiles set commercial_role = 'director', reports_to = null where id = ${quoted(ids.directorA)};
  update public.profiles set commercial_role = 'superintendent', reports_to = ${quoted(ids.directorA)} where id = ${quoted(ids.superintendentA)};
  update public.profiles set commercial_role = 'manager', reports_to = ${quoted(ids.superintendentA)} where id = ${quoted(ids.managerA)};
  update public.profiles set commercial_role = 'broker', reports_to = ${quoted(ids.managerA)} where id in (${quoted(ids.brokerA1)}, ${quoted(ids.brokerA2)});
  update public.profiles set commercial_role = 'manager', reports_to = ${quoted(ids.directorA)} where id = ${quoted(ids.managerOther)};
  update public.profiles set commercial_role = 'broker', reports_to = ${quoted(ids.managerOther)} where id = ${quoted(ids.brokerOther)};
  update public.profiles set commercial_role = 'broker', reports_to = ${quoted(ids.managerA)} where id = ${quoted(ids.inactiveBroker)};
  update public.profiles set commercial_role = 'director', reports_to = null where id = ${quoted(ids.directorB)};
  update public.profiles set commercial_role = 'broker', reports_to = ${quoted(ids.directorB)} where id = ${quoted(ids.brokerB)};
`);

async function asRole(role, userId, claims, execute) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims ?? {})]);
  try {
    return await execute();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.query("select set_config('request.jwt.claims', '{}', false)");
  }
}

async function visibleLeadIds(userId, claims = {}) {
  return asRole("authenticated", userId, claims, async () => {
    const result = await db.query("select id from public.leads order by id");
    return result.rows.map((row) => row.id);
  });
}

async function visibleProfileIds(userId) {
  return asRole("authenticated", userId, {}, async () => {
    const result = await db.query("select id from public.profiles order by id");
    return result.rows.map((row) => row.id);
  });
}

async function updateLead(userId, leadId, updateSql) {
  try {
    return await asRole("authenticated", userId, {}, async () => {
      const result = await db.query(`update public.leads set ${updateSql}, updated_at = now() where id = $1 returning id`, [leadId]);
      return result.rows.length;
    });
  } catch (error) {
    if (/row-level security|violates/.test(String(error?.message ?? error))) return -1;
    throw error;
  }
}

await scenario("anonymous_read_denied", async () => {
  let denied = false;
  try {
    await asRole("anon", null, {}, () => db.query("select id from public.leads"));
  } catch (error) {
    denied = /permission denied/.test(String(error?.message ?? error));
  }
  check(denied, "anon:leads_select_sem_privilegio");
});

await scenario("authenticated_without_subject_denied", async () => {
  check((await visibleLeadIds(null)).length === 0, "jwt:sub_ausente_sem_linhas");
});

await scenario("broker_own_lead_allowed", async () => {
  const visible = await visibleLeadIds(ids.brokerA1);
  check(visible.includes(ids.leadA1), "broker:lead_propria_visivel");
  check(visible.length === 1, "broker:somente_carteira_propria");
});

await scenario("broker_teammate_denied", async () => {
  check(!(await visibleLeadIds(ids.brokerA1)).includes(ids.leadA2), "broker:colega_mesmo_time_oculto");
});

await scenario("broker_other_team_denied", async () => {
  check(!(await visibleLeadIds(ids.brokerA1)).includes(ids.leadOther), "broker:outra_equipe_oculta");
});

await scenario("broker_cross_tenant_denied", async () => {
  check(!(await visibleLeadIds(ids.brokerA1)).includes(ids.leadB), "broker:outro_tenant_oculto");
});

await scenario("manager_team_allowed", async () => {
  const visible = await visibleLeadIds(ids.managerA);
  check(visible.includes(ids.leadA1) && visible.includes(ids.leadA2), "manager:subordinados_visiveis");
  check(!visible.includes(ids.leadOther), "manager:outra_equipe_oculta");
});

await scenario("superintendent_subtree_and_queue_allowed", async () => {
  const visible = await visibleLeadIds(ids.superintendentA);
  check(visible.includes(ids.leadA1) && visible.includes(ids.leadA2), "superintendente:subarvore_visivel");
  check(visible.includes(ids.leadUnassigned), "superintendente:fila_sem_responsavel_visivel");
  check(!visible.includes(ids.leadOther), "superintendente:ramo_paralelo_oculto");
});

await scenario("director_same_tenant_allowed", async () => {
  const visible = await visibleLeadIds(ids.directorA);
  check(visible.includes(ids.leadA1) && visible.includes(ids.leadOther), "diretor:todas_equipes_tenant_visiveis");
  check(visible.includes(ids.leadUnassigned), "diretor:fila_tenant_visivel");
  check(!visible.includes(ids.leadB), "diretor:outro_tenant_oculto");
});

await scenario("inactive_profile_denied", async () => {
  check((await visibleLeadIds(ids.inactiveBroker)).length === 0, "inativo:nenhuma_lead_visivel");
});

await scenario("manager_unassigned_denied", async () => {
  check(!(await visibleLeadIds(ids.managerA)).includes(ids.leadUnassigned), "manager:fila_sem_responsavel_oculta");
});

await scenario("broker_cross_tenant_insert_denied", async () => {
  let denied = false;
  try {
    await asRole("authenticated", ids.brokerA1, {}, () => db.query(
      "insert into public.leads (id, organization_id, name, assigned_to) values ($1, $2, 'Tentativa', $3)",
      ["20000000-0000-4000-8000-000000000199", ids.orgB, ids.brokerB],
    ));
  } catch (error) {
    denied = /row-level security|violates/.test(String(error?.message ?? error));
  }
  check(denied, "write:insert_cross_tenant_bloqueado");
});

await scenario("broker_reassignment_denied_by_with_check", async () => {
  check(await updateLead(ids.brokerA1, ids.leadA1, `assigned_to = ${quoted(ids.brokerA2)}`) === -1, "write:broker_reassign_bloqueado");
  const owner = (await db.query("select assigned_to from public.leads where id = $1", [ids.leadA1])).rows[0].assigned_to;
  check(owner === ids.brokerA1, "write:proprietario_preservado");
});

await scenario("manager_subordinate_update_allowed", async () => {
  check(await updateLead(ids.managerA, ids.leadA1, "status = 'contact'") === 1, "write:manager_atualiza_subordinado");
});

await scenario("manager_cross_team_transfer_denied", async () => {
  check(await updateLead(ids.managerA, ids.leadA1, `assigned_to = ${quoted(ids.brokerOther)}`) === -1, "write:manager_nao_transfere_outro_time");
  const owner = (await db.query("select assigned_to from public.leads where id = $1", [ids.leadA1])).rows[0].assigned_to;
  check(owner === ids.brokerA1, "write:owner_inalterado_apos_bloqueio");
});

await scenario("director_same_tenant_transfer_allowed", async () => {
  check(await updateLead(ids.directorA, ids.leadA1, `assigned_to = ${quoted(ids.brokerOther)}`) === 1, "write:diretor_transfere_no_tenant");
  await db.query("update public.leads set assigned_to = $1 where id = $2", [ids.brokerA1, ids.leadA1]);
});

await scenario("profile_scope_broker_self", async () => {
  const visible = await visibleProfileIds(ids.brokerA1);
  check(visible.length === 1 && visible[0] === ids.brokerA1, "profiles:broker_somente_self");
});

await scenario("profile_scope_manager_subtree", async () => {
  const visible = await visibleProfileIds(ids.managerA);
  check(visible.includes(ids.managerA) && visible.includes(ids.brokerA1) && visible.includes(ids.brokerA2), "profiles:manager_subarvore");
  check(!visible.includes(ids.brokerOther) && !visible.includes(ids.brokerB), "profiles:manager_sem_outro_escopo");
});

await scenario("profile_scope_director_tenant", async () => {
  const visible = await visibleProfileIds(ids.directorA);
  check(visible.includes(ids.managerOther) && visible.includes(ids.brokerOther), "profiles:diretor_tenant_completo");
  check(!visible.includes(ids.directorB) && !visible.includes(ids.brokerB), "profiles:diretor_sem_outro_tenant");
});

await scenario("editable_user_metadata_cannot_escalate", async () => {
  const visible = await visibleLeadIds(ids.brokerA1, {
    user_metadata: { commercial_role: "director", role: "admin", organization_id: ids.orgB },
    role: "authenticated",
  });
  check(visible.length === 1 && visible[0] === ids.leadA1, "jwt:user_metadata_ignorado_para_autorizacao");
  check(!visible.includes(ids.leadB), "jwt:user_metadata_sem_troca_tenant");
});

await scenario("service_role_boundary", async () => {
  const result = await asRole("service_role", null, {}, () => db.query("select id from public.leads"));
  check(result.rows.length === 6, "service_role:bypass_apenas_servidor");
  const bypass = await db.query("select rolbypassrls from pg_roles where rolname = 'service_role'");
  check(bypass.rows[0].rolbypassrls === true, "service_role:bypass_explicito");
});

await scenario("explicit_table_privileges", async () => {
  const grants = (await db.query(`
    select
      has_table_privilege('anon', 'public.leads', 'select') as anon_select,
      has_table_privilege('authenticated', 'public.leads', 'select') as authenticated_select,
      has_table_privilege('authenticated', 'public.leads', 'update') as authenticated_update,
      has_table_privilege('service_role', 'public.leads', 'select') as service_select
  `)).rows[0];
  check(grants.anon_select === false, "grants:anon_sem_select");
  check(grants.authenticated_select === true && grants.authenticated_update === true, "grants:authenticated_explicito");
  check(grants.service_select === true, "grants:service_explicito");
});

await scenario("policy_contract_catalog", async () => {
  const policies = await db.query(`
    select policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename in ('profiles', 'leads')
  `);
  const update = policies.rows.find((row) => row.policyname === "leads_commercial_update");
  check(Boolean(update?.qual) && Boolean(update?.with_check), "policy:update_using_e_with_check");
  check(policies.rows.some((row) => row.policyname === "profiles_commercial_scope"), "policy:profiles_hierarquia_ativa");
  check(policies.rows.filter((row) => row.policyname.startsWith("leads_commercial_")).length === 4, "policy:crud_leads_separado");
});

await scenario("helper_contract_catalog", async () => {
  const helpers = await db.query(`
    select p.proname, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('can_view_commercial_profile', 'can_access_commercial_lead')
    order by p.proname
  `);
  check(helpers.rows.length === 2 && helpers.rows.every((row) => row.prosecdef), "helpers:security_definer");
  check(helpers.rows.every((row) => row.proconfig?.includes("search_path=\"\"")), "helpers:search_path_vazio");
  check(helpers.rows.every((row) => row.definition.includes("auth.uid()")), "helpers:identidade_do_banco");
  check(helpers.rows.every((row) => !row.anon_execute && row.authenticated_execute), "helpers:execute_restrito");
  check(helpers.rows.every((row) => !/user_metadata|raw_user_meta_data/i.test(row.definition)), "helpers:sem_metadata_editavel");
});

const version = (await db.query("select version() as version")).rows[0].version;
await db.close();

console.log(JSON.stringify({
  phase: 13,
  passed: true,
  sanitized: true,
  containsPersonalData: false,
  engineVersion: version,
  migrationUnderTest: "20260716212459_commercial_hierarchy_and_bulk_transfer.sql",
  scenarioCount: scenarios.length,
  assertionCount: assertions.length,
  scenarios,
  limitations: {
    fullSupabaseStack: false,
    realSignedJwt: false,
    dataApiRuntime: false,
    remoteStaging: false,
    localPostgresClaimSemantics: true,
  },
}, null, 2));

import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migration-drafts/20260719070511_reconcile_legacy_and_canonical_contracts.sql", import.meta.url),
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
const assertions = [];
const scenarios = [];

function check(condition, label) {
  if (!condition) throw new Error(`assertion_failed:${label}`);
  assertions.push(label);
}

const ids = {
  org: "00000000-0000-4000-8000-000000000001",
  director: "00000000-0000-4000-8000-000000000011",
  manager: "00000000-0000-4000-8000-000000000012",
  broker: "00000000-0000-4000-8000-000000000013",
  development: "00000000-0000-4000-8000-000000000021",
  developmentAlt: "00000000-0000-4000-8000-000000000022",
  lead: "00000000-0000-4000-8000-000000000031",
};

function baselineSql({ canonicalLeadColumns = false } = {}) {
  const canonical = canonicalLeadColumns
    ? `,
      assigned_to uuid references public.profiles(id) on delete set null,
      development_id uuid references public.developments(id) on delete set null,
      score integer default 0 not null`
    : "";

  return `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;

    create table public.organizations (
      id uuid primary key,
      name text not null,
      slug text not null,
      plan text not null default 'homologation',
      active boolean not null default true
    );

    create table public.profiles (
      id uuid primary key,
      organization_id uuid not null,
      name text,
      role text,
      access_role text,
      active boolean default true,
      avatar_url text,
      phone text,
      creci text,
      bio text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create table public.developments (
      id uuid primary key,
      organization_id uuid not null,
      name text not null
    );

    create table public.leads (
      id uuid primary key,
      organization_id uuid not null,
      name text,
      status text,
      assigned_user_id uuid references public.profiles(id) on delete set null,
      project_id uuid references public.developments(id) on delete set null,
      score_ia integer,
      created_at timestamptz default now()
      ${canonical}
    );

    alter table public.profiles enable row level security;
    alter table public.leads enable row level security;
    create policy profiles_authenticated_semantic_fixture
      on public.profiles for select to authenticated using (true);
    create policy leads_authenticated_semantic_fixture
      on public.leads for all to authenticated using (true) with check (true);
  `;
}

function seedSql({ role = "broker", canonicalLead = null } = {}) {
  const canonicalColumns = canonicalLead ? ", assigned_to, development_id, score" : "";
  const canonicalValues = canonicalLead
    ? `, ${canonicalLead.assignedTo ? `'${canonicalLead.assignedTo}'` : "null"}, ${canonicalLead.developmentId ? `'${canonicalLead.developmentId}'` : "null"}, ${canonicalLead.score ?? 0}`
    : "";

  return `
    insert into public.organizations (id, name, slug) values
      ('${ids.org}', 'Organizacao Teste', 'organizacao-teste');
    insert into public.profiles (id, organization_id, name, role, access_role) values
      ('${ids.director}', '${ids.org}', 'Diretoria Teste', 'admin', 'ADMIN'),
      ('${ids.manager}', '${ids.org}', 'Gerencia Teste', 'manager', 'GERENTE'),
      ('${ids.broker}', '${ids.org}', 'Corretor Teste', '${role}', 'CORRETOR');
    insert into public.developments (id, organization_id, name) values
      ('${ids.development}', '${ids.org}', 'Projeto Teste A'),
      ('${ids.developmentAlt}', '${ids.org}', 'Projeto Teste B');
    insert into public.leads (
      id, organization_id, name, status, assigned_user_id, project_id, score_ia${canonicalColumns}
    ) values (
      '${ids.lead}', '${ids.org}', 'Lead Sintetica', 'new', '${ids.broker}', '${ids.development}', 82${canonicalValues}
    );
  `;
}

async function newDatabase(options = {}) {
  const db = new PGlite();
  await db.exec(baselineSql(options));
  return db;
}

async function setStaging(db) {
  await db.query("select set_config('app.atlas_reconciliation_environment', 'staging_clone', false)");
}

async function rollbackAfterFailure(db) {
  try {
    await db.exec("rollback;");
  } catch {
    // Alguns drivers encerram automaticamente a transacao abortada.
  }
}

async function expectMigrationFailure(db, expectedMessage, label) {
  let message = "";
  try {
    await db.exec(migration);
  } catch (error) {
    message = String(error?.message ?? error);
  }
  check(message.includes(expectedMessage), `${label}:erro_esperado`);
  await rollbackAfterFailure(db);
}

async function canonicalColumnsExist(db) {
  const result = await db.query(`
    select count(*)::int as count
    from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'profiles' and column_name in ('full_name', 'commercial_role', 'reports_to'))
        or (table_name = 'leads' and column_name in ('assigned_to', 'development_id', 'score')))
  `);
  return Number(result.rows[0].count) === 6;
}

async function happyPath() {
  const db = await newDatabase();
  try {
    await db.exec(seedSql());
    await setStaging(db);
    await db.exec(migration);

    const profiles = await db.query(`
      select name, full_name, role, commercial_role, reports_to
      from public.profiles order by id
    `);
    check(profiles.rows.length === 3, "happy:perfis_preservados");
    check(profiles.rows.every((row) => row.name === row.full_name), "happy:nomes_backfill");
    check(
      profiles.rows.map((row) => row.commercial_role).sort().join(",") === "broker,director,manager",
      "happy:papeis_mapeados",
    );
    check(profiles.rows.every((row) => row.reports_to === null), "happy:hierarquia_nao_inferida");

    const lead = (await db.query(`
      select assigned_user_id, assigned_to, project_id, development_id, score_ia, score
      from public.leads where id = '${ids.lead}'
    `)).rows[0];
    check(lead.assigned_user_id === lead.assigned_to, "happy:responsavel_backfill");
    check(lead.project_id === lead.development_id, "happy:projeto_backfill");
    check(lead.score_ia === 82 && lead.score === 82, "happy:score_backfill");

    const schema = await db.query(`
      select table_name, column_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
        and ((table_name = 'profiles' and column_name = 'full_name')
          or (table_name = 'leads' and column_name = 'score'))
      order by table_name, column_name
    `);
    check(schema.rows.every((row) => row.is_nullable === "NO"), "happy:not_null_restaurado");
    check(schema.rows.some((row) => row.column_name === "score" && row.column_default === "0"), "happy:score_default_restaurado");

    const legacyInsert = "00000000-0000-4000-8000-000000000041";
    await db.exec(`
      insert into public.leads (
        id, organization_id, name, status, assigned_user_id, project_id, score_ia
      ) values (
        '${legacyInsert}', '${ids.org}', 'Lead Legada', 'new', '${ids.broker}', '${ids.development}', 71
      );
    `);
    const legacyRow = (await db.query(`select * from public.leads where id = '${legacyInsert}'`)).rows[0];
    check(legacyRow.assigned_to === ids.broker, "trigger:insert_legado_responsavel");
    check(legacyRow.development_id === ids.development, "trigger:insert_legado_projeto");
    check(legacyRow.score === 71, "trigger:insert_legado_score");

    const canonicalInsert = "00000000-0000-4000-8000-000000000042";
    await db.exec(`
      insert into public.leads (
        id, organization_id, name, status, assigned_to, development_id, score
      ) values (
        '${canonicalInsert}', '${ids.org}', 'Lead Canonica', 'new', '${ids.manager}', '${ids.developmentAlt}', 63
      );
    `);
    const canonicalRow = (await db.query(`select * from public.leads where id = '${canonicalInsert}'`)).rows[0];
    check(canonicalRow.assigned_user_id === ids.manager, "trigger:insert_canonico_responsavel");
    check(canonicalRow.project_id === ids.developmentAlt, "trigger:insert_canonico_projeto");
    check(canonicalRow.score_ia === 63, "trigger:insert_canonico_score");

    await db.exec(`
      update public.leads
      set assigned_user_id = '${ids.director}', project_id = '${ids.developmentAlt}', score_ia = 91
      where id = '${legacyInsert}';
    `);
    const legacyUpdate = (await db.query(`select * from public.leads where id = '${legacyInsert}'`)).rows[0];
    check(legacyUpdate.assigned_to === ids.director, "trigger:update_legado_responsavel");
    check(legacyUpdate.development_id === ids.developmentAlt, "trigger:update_legado_projeto");
    check(legacyUpdate.score === 91, "trigger:update_legado_score");

    await db.exec(`
      update public.leads
      set assigned_to = '${ids.broker}', development_id = '${ids.development}', score = 47
      where id = '${canonicalInsert}';
    `);
    const canonicalUpdate = (await db.query(`select * from public.leads where id = '${canonicalInsert}'`)).rows[0];
    check(canonicalUpdate.assigned_user_id === ids.broker, "trigger:update_canonico_responsavel");
    check(canonicalUpdate.project_id === ids.development, "trigger:update_canonico_projeto");
    check(canonicalUpdate.score_ia === 47, "trigger:update_canonico_score");

    for (const test of [
      {
        label: "trigger:conflito_responsavel_rejeitado",
        message: "lead_contract_conflict:owner",
        sql: `insert into public.leads (id, organization_id, assigned_user_id, assigned_to, score_ia, score) values ('00000000-0000-4000-8000-000000000051', '${ids.org}', '${ids.broker}', '${ids.manager}', 10, 10)`,
      },
      {
        label: "trigger:conflito_projeto_rejeitado",
        message: "lead_contract_conflict:project",
        sql: `insert into public.leads (id, organization_id, project_id, development_id, score_ia, score) values ('00000000-0000-4000-8000-000000000052', '${ids.org}', '${ids.development}', '${ids.developmentAlt}', 10, 10)`,
      },
      {
        label: "trigger:conflito_score_rejeitado",
        message: "lead_contract_conflict:score",
        sql: `insert into public.leads (id, organization_id, score_ia, score) values ('00000000-0000-4000-8000-000000000053', '${ids.org}', 10, 20)`,
      },
      {
        label: "trigger:score_fora_faixa_rejeitado",
        message: "lead_contract_conflict:score_range",
        sql: `insert into public.leads (id, organization_id, score_ia) values ('00000000-0000-4000-8000-000000000054', '${ids.org}', 101)`,
      },
    ]) {
      let errorMessage = "";
      try {
        await db.exec(test.sql);
      } catch (error) {
        errorMessage = String(error?.message ?? error);
      }
      check(errorMessage.includes(test.message), test.label);
    }

    const privileges = (await db.query(`
      select
        has_table_privilege('authenticated', 'public.leads', 'select') as auth_leads_select,
        has_table_privilege('authenticated', 'public.leads', 'insert') as auth_leads_insert,
        has_table_privilege('anon', 'public.leads', 'select') as anon_leads_select,
        has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update') as auth_profile_name_update,
        has_column_privilege('authenticated', 'public.profiles', 'role', 'update') as auth_profile_role_update
    `)).rows[0];
    check(privileges.auth_leads_select === true && privileges.auth_leads_insert === true, "grants:authenticated_leads");
    check(privileges.anon_leads_select === false, "grants:anon_leads_bloqueado");
    check(privileges.auth_profile_name_update === true, "grants:perfil_campos_permitidos");
    check(privileges.auth_profile_role_update === false, "grants:perfil_papel_protegido");

    const security = (await db.query(`
      select
        (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) as profiles_rls,
        (select relrowsecurity from pg_class where oid = 'public.leads'::regclass) as leads_rls,
        (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'sync_lead_compatibility_contracts') as security_definer,
        (select count(*)::int from pg_trigger where tgrelid = 'public.leads'::regclass and not tgisinternal) as trigger_count
    `)).rows[0];
    check(security.profiles_rls === true && security.leads_rls === true, "security:rls_habilitado");
    check(security.security_definer === false, "security:funcao_security_invoker");
    check(Number(security.trigger_count) === 1, "security:trigger_unico");

    scenarios.push({ id: "happy_path", passed: true });
  } finally {
    await db.close();
  }
}

async function guardRollback() {
  const db = await newDatabase();
  try {
    await db.exec(seedSql());
    await expectMigrationFailure(db, "atlas_reconciliation_staging_only", "guard");
    check((await canonicalColumnsExist(db)) === false, "guard:rollback_sem_colunas_canonicas");
    scenarios.push({ id: "staging_guard_rollback", passed: true });
  } finally {
    await db.close();
  }
}

async function unknownRoleRollback() {
  const db = await newDatabase();
  try {
    await db.exec(seedSql({ role: "owner" }));
    await setStaging(db);
    await expectMigrationFailure(db, "atlas_reconciliation_unknown_legacy_role", "unknown_role");
    check((await canonicalColumnsExist(db)) === false, "unknown_role:rollback_sem_colunas_canonicas");
    scenarios.push({ id: "unknown_role_rollback", passed: true });
  } finally {
    await db.close();
  }
}

async function scoreConflictRollback() {
  const db = await newDatabase({ canonicalLeadColumns: true });
  try {
    await db.exec(seedSql({ canonicalLead: { assignedTo: ids.broker, developmentId: ids.development, score: 77 } }));
    await setStaging(db);
    await expectMigrationFailure(db, "atlas_reconciliation_score_conflict", "score_conflict");
    const row = (await db.query(`select score_ia, score from public.leads where id = '${ids.lead}'`)).rows[0];
    check(row.score_ia === 82 && row.score === 77, "score_conflict:rollback_preservou_valores");
    scenarios.push({ id: "score_conflict_rollback", passed: true });
  } finally {
    await db.close();
  }
}

async function maskedZeroBackfill() {
  const db = await newDatabase({ canonicalLeadColumns: true });
  try {
    await db.exec(seedSql({ canonicalLead: { assignedTo: ids.broker, developmentId: ids.development, score: 0 } }));
    await setStaging(db);
    await db.exec(migration);
    const row = (await db.query(`select score_ia, score from public.leads where id = '${ids.lead}'`)).rows[0];
    check(row.score_ia === 82 && row.score === 82, "masked_zero:score_legado_restaurado");
    scenarios.push({ id: "masked_zero_backfill", passed: true });
  } finally {
    await db.close();
  }
}

async function ownerConflictRollback() {
  const db = await newDatabase({ canonicalLeadColumns: true });
  try {
    await db.exec(seedSql({ canonicalLead: { assignedTo: ids.manager, developmentId: ids.development, score: 82 } }));
    await setStaging(db);
    await expectMigrationFailure(db, "atlas_reconciliation_owner_conflict", "owner_conflict");
    const row = (await db.query(`select assigned_user_id, assigned_to from public.leads where id = '${ids.lead}'`)).rows[0];
    check(row.assigned_user_id === ids.broker && row.assigned_to === ids.manager, "owner_conflict:rollback_preservou_valores");
    scenarios.push({ id: "owner_conflict_rollback", passed: true });
  } finally {
    await db.close();
  }
}

await happyPath();
await guardRollback();
await unknownRoleRollback();
await scoreConflictRollback();
await maskedZeroBackfill();
await ownerConflictRollback();

const versionDb = new PGlite();
const engineVersion = (await versionDb.query("select version() as version")).rows[0].version;
await versionDb.close();

console.log(JSON.stringify({
  passed: true,
  engine: "PGlite PostgreSQL WASM",
  engineVersion,
  sanitized: true,
  containsPersonalData: false,
  scenarioCount: scenarios.length,
  assertionCount: assertions.length,
  scenarios,
  assertions,
  limitations: {
    fullSupabaseStack: false,
    authenticatedJwtRls: false,
    crossTenantRls: false,
    remoteStaging: false,
  },
}, null, 2));

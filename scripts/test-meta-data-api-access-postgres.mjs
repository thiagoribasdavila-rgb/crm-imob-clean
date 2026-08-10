import { readFileSync } from "node:fs";

const query = readFileSync(
  new URL("./sql/meta-data-api-access-audit.sql", import.meta.url),
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

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create table public.organizations (
    id uuid primary key,
    name text not null,
    slug text not null,
    plan text not null,
    active boolean not null default true
  );
  create table public.profiles (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    name text not null,
    full_name text not null,
    role text not null,
    commercial_role text not null,
    reports_to uuid references public.profiles(id),
    access_role text not null,
    active boolean not null default true,
    availability_status text,
    avatar_url text,
    phone text,
    creci text,
    bio text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table public.leads (
    id uuid primary key,
    organization_id uuid not null references public.organizations(id),
    name text not null,
    created_at timestamptz not null default now()
  );

  alter table public.organizations enable row level security;
  alter table public.profiles enable row level security;
  alter table public.leads enable row level security;

  create policy organizations_select on public.organizations
    for select to authenticated using (true);
  create policy organizations_update on public.organizations
    for update to authenticated using (true) with check (true);
  create policy profiles_select on public.profiles
    for select to authenticated using (true);
  create policy profiles_update on public.profiles
    for update to authenticated using (true) with check (true);
  create policy leads_select on public.leads
    for select to authenticated using (true);
  create policy leads_insert on public.leads
    for insert to authenticated with check (true);
  create policy leads_update on public.leads
    for update to authenticated using (true) with check (true);

  revoke all on table public.organizations, public.profiles, public.leads from anon;
  revoke all on table public.organizations, public.profiles, public.leads from authenticated;
  grant select (id, name, slug, plan, active) on table public.organizations to authenticated;
  grant update (name, slug) on table public.organizations to authenticated;
  grant select (
    id, organization_id, name, full_name, role, commercial_role, reports_to,
    access_role, active, availability_status, avatar_url, phone, creci, bio,
    created_at, updated_at
  ) on table public.profiles to authenticated;
  grant update (name, full_name, avatar_url, phone, creci, bio, updated_at)
    on table public.profiles to authenticated;
  grant select, insert, update on table public.leads to authenticated;
  grant all on table public.organizations, public.profiles, public.leads to service_role;
`);

const result = await db.query(query);
const evidence = result.rows[0]?.jsonb_build_object;
if (!evidence || evidence.passed !== true) {
  throw new Error(`catalog_evidence_not_approved:${JSON.stringify(evidence?.controls ?? {})}`);
}
if (evidence.controls?.leadDeleteNotGranted !== true) {
  throw new Error("least_privilege_delete_gate_failed");
}
if (evidence.controls?.updatePoliciesHaveUsingAndWithCheck !== true) {
  throw new Error("rls_update_contract_failed");
}

console.log(JSON.stringify({
  passed: true,
  phase: 17,
  queryReadOnly: evidence.queryReadOnly,
  controlsApproved: Object.values(evidence.controls).every((value) => value === true),
  tableCount: Object.keys(evidence.tables ?? {}).length,
}, null, 2));

await db.close();

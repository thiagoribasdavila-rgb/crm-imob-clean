begin;

-- Phase 99 draft only. Apply first in an isolated homologation environment.
-- The shared private.can_manage_commercial_data() function is intentionally untouched.

create or replace function private.can_manage_projects(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.profiles as profile
      join public.organizations as organization
        on organization.id = profile.organization_id
      where profile.id = auth.uid()
        and profile.organization_id = target_organization_id
        and profile.active is true
        and profile.role in ('ADMIN', 'DIRETOR_DECISOR', 'DIRETOR', 'GERENTE')
        and organization.status = 'ACTIVE'
    );
$$;

revoke all on function private.can_manage_projects(uuid) from public;
revoke all on function private.can_manage_projects(uuid) from anon;
grant execute on function private.can_manage_projects(uuid) to authenticated;
grant execute on function private.can_manage_projects(uuid) to service_role;

comment on function private.can_manage_projects(uuid) is
  'Project-specific tenant and role gate. It does not alter the shared commercial role contract.';

create table if not exists public.crm_project_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  actor_id uuid not null,
  operation text not null,
  reason text not null,
  changed_fields text[] not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  constraint crm_project_events_organization_fk
    foreign key (organization_id)
    references public.organizations(id)
    on delete restrict,
  constraint crm_project_events_project_tenant_fk
    foreign key (project_id, organization_id)
    references public.crm_projects(id, organization_id)
    on delete restrict,
  constraint crm_project_events_actor_fk
    foreign key (actor_id)
    references public.profiles(id)
    on delete restrict,
  constraint crm_project_events_operation_check
    check (operation in ('create', 'update')),
  constraint crm_project_events_reason_check
    check (char_length(btrim(reason)) between 10 and 500),
  constraint crm_project_events_changed_fields_check
    check (cardinality(changed_fields) > 0),
  constraint crm_project_events_idempotency_key_check
    check (
      char_length(idempotency_key) between 8 and 120
      and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
    ),
  constraint crm_project_events_fingerprint_check
    check (request_fingerprint ~ '^[a-f0-9]{32}$'),
  constraint crm_project_events_state_check
    check (
      (operation = 'create' and before_state is null)
      or (operation = 'update' and before_state is not null)
    ),
  constraint crm_project_events_idempotency_unique
    unique (organization_id, idempotency_key)
);

create index if not exists crm_project_events_project_tenant_fk_idx
  on public.crm_project_events(project_id, organization_id);

create index if not exists crm_project_events_timeline_idx
  on public.crm_project_events(organization_id, project_id, created_at desc, id);

create index if not exists crm_project_events_actor_idx
  on public.crm_project_events(actor_id);

alter table public.crm_project_events enable row level security;
alter table public.crm_project_events force row level security;

drop policy if exists crm_project_events_select_managers on public.crm_project_events;
create policy crm_project_events_select_managers
  on public.crm_project_events
  for select
  to authenticated
  using (
    organization_id = private.current_organization_id()
    and private.can_manage_projects(organization_id)
  );

revoke all on table public.crm_project_events from public;
revoke all on table public.crm_project_events from anon;
revoke all on table public.crm_project_events from authenticated;
grant select on table public.crm_project_events to authenticated;
grant all on table public.crm_project_events to service_role;

comment on table public.crm_project_events is
  'Append-only audit history for governed project create and update commands.';

-- Remove only mutation policies from the project table, without depending on legacy names.
do $policy_cleanup$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'crm_projects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.crm_projects', policy_name);
  end loop;
end;
$policy_cleanup$;

drop policy if exists crm_projects_select_tenant on public.crm_projects;
create policy crm_projects_select_tenant
  on public.crm_projects
  for select
  to authenticated
  using (organization_id = private.current_organization_id());

create policy crm_projects_insert_managers
  on public.crm_projects
  for insert
  to authenticated
  with check (
    organization_id = private.current_organization_id()
    and private.can_manage_projects(organization_id)
  );

create policy crm_projects_update_managers
  on public.crm_projects
  for update
  to authenticated
  using (
    organization_id = private.current_organization_id()
    and private.can_manage_projects(organization_id)
  )
  with check (
    organization_id = private.current_organization_id()
    and private.can_manage_projects(organization_id)
  );

-- Initial rollout deliberately has no DELETE policy and no DELETE command.
revoke all on table public.crm_projects from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.crm_projects from authenticated;
grant select on table public.crm_projects to authenticated;

create or replace function public.mutate_crm_project_v1(
  p_organization_id uuid,
  p_operation text,
  p_project_id uuid,
  p_patch jsonb,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_operation text := lower(btrim(coalesce(p_operation, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_fingerprint text;
  v_changed_fields text[];
  v_before jsonb;
  v_after jsonb;
  v_project public.crm_projects%rowtype;
  v_existing_event public.crm_project_events%rowtype;
  v_event_id uuid;
  v_launch_date date;
  v_delivery_date date;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'authentication-required';
  end if;

  if p_organization_id is null
    or p_organization_id <> private.current_organization_id()
    or not private.can_manage_projects(p_organization_id)
  then
    raise exception using errcode = '42501', message = 'project-write-not-authorized';
  end if;

  if v_operation not in ('create', 'update') then
    raise exception using errcode = '22023', message = 'unsupported-project-operation';
  end if;

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'project-patch-must-be-a-non-empty-object';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as fields(field_name)
    where field_name not in (
      'name', 'developer_name', 'code', 'city', 'neighborhood', 'address',
      'status', 'launch_date', 'delivery_date'
    )
  ) then
    raise exception using errcode = '22023', message = 'unsupported-project-field';
  end if;

  if char_length(v_reason) not between 10 and 500 then
    raise exception using errcode = '22023', message = 'project-write-reason-invalid';
  end if;

  if char_length(v_idempotency_key) not between 8 and 120
    or v_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  then
    raise exception using errcode = '22023', message = 'project-idempotency-key-invalid';
  end if;

  if p_patch ? 'name'
    and (jsonb_typeof(p_patch -> 'name') <> 'string' or char_length(btrim(p_patch ->> 'name')) not between 2 and 160)
  then
    raise exception using errcode = '22023', message = 'project-name-invalid';
  end if;

  if p_patch ? 'status'
    and (
      jsonb_typeof(p_patch -> 'status') <> 'string'
      or upper(p_patch ->> 'status') not in ('ACTIVE', 'PAUSED', 'SOLD_OUT', 'ARCHIVED')
    )
  then
    raise exception using errcode = '22023', message = 'project-status-invalid';
  end if;

  if p_patch ? 'launch_date' and jsonb_typeof(p_patch -> 'launch_date') <> 'null' then
    v_launch_date := (p_patch ->> 'launch_date')::date;
  end if;

  if p_patch ? 'delivery_date' and jsonb_typeof(p_patch -> 'delivery_date') <> 'null' then
    v_delivery_date := (p_patch ->> 'delivery_date')::date;
  end if;

  if v_launch_date is not null and v_delivery_date is not null and v_delivery_date < v_launch_date then
    raise exception using errcode = '22023', message = 'project-date-range-invalid';
  end if;

  select array_agg(field_name order by field_name)
    into v_changed_fields
  from jsonb_object_keys(p_patch) as fields(field_name);

  v_fingerprint := md5(
    concat_ws(
      '|',
      v_actor_id::text,
      p_organization_id::text,
      v_operation,
      coalesce(p_project_id::text, ''),
      p_patch::text,
      v_reason
    )
  );

  select *
    into v_existing_event
  from public.crm_project_events
  where organization_id = p_organization_id
    and idempotency_key = v_idempotency_key;

  if found then
    if v_existing_event.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'project-idempotency-key-conflict';
    end if;

    return jsonb_build_object(
      'project', v_existing_event.after_state,
      'event_id', v_existing_event.id,
      'replayed', true
    );
  end if;

  if v_operation = 'create' then
    if p_project_id is not null then
      raise exception using errcode = '22023', message = 'project-id-must-be-empty-on-create';
    end if;

    if not (p_patch ? 'name') then
      raise exception using errcode = '22023', message = 'project-name-required';
    end if;

    insert into public.crm_projects (
      organization_id,
      name,
      developer_name,
      code,
      city,
      neighborhood,
      address,
      status,
      launch_date,
      delivery_date
    )
    values (
      p_organization_id,
      btrim(p_patch ->> 'name'),
      nullif(btrim(p_patch ->> 'developer_name'), ''),
      nullif(btrim(p_patch ->> 'code'), ''),
      nullif(btrim(p_patch ->> 'city'), ''),
      nullif(btrim(p_patch ->> 'neighborhood'), ''),
      nullif(btrim(p_patch ->> 'address'), ''),
      coalesce(upper(nullif(p_patch ->> 'status', '')), 'ACTIVE'),
      v_launch_date,
      v_delivery_date
    )
    returning * into v_project;

    v_before := null;
    v_after := to_jsonb(v_project);
  else
    if p_project_id is null then
      raise exception using errcode = '22023', message = 'project-id-required-on-update';
    end if;

    select *
      into v_project
    from public.crm_projects
    where id = p_project_id
      and organization_id = p_organization_id
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'project-not-found-in-tenant';
    end if;

    v_before := to_jsonb(v_project);

    update public.crm_projects
    set
      name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
      developer_name = case when p_patch ? 'developer_name' then nullif(btrim(p_patch ->> 'developer_name'), '') else developer_name end,
      code = case when p_patch ? 'code' then nullif(btrim(p_patch ->> 'code'), '') else code end,
      city = case when p_patch ? 'city' then nullif(btrim(p_patch ->> 'city'), '') else city end,
      neighborhood = case when p_patch ? 'neighborhood' then nullif(btrim(p_patch ->> 'neighborhood'), '') else neighborhood end,
      address = case when p_patch ? 'address' then nullif(btrim(p_patch ->> 'address'), '') else address end,
      status = case when p_patch ? 'status' then upper(p_patch ->> 'status') else status end,
      launch_date = case
        when p_patch ? 'launch_date' and jsonb_typeof(p_patch -> 'launch_date') = 'null' then null
        when p_patch ? 'launch_date' then v_launch_date
        else launch_date
      end,
      delivery_date = case
        when p_patch ? 'delivery_date' and jsonb_typeof(p_patch -> 'delivery_date') = 'null' then null
        when p_patch ? 'delivery_date' then v_delivery_date
        else delivery_date
      end,
      updated_at = now()
    where id = p_project_id
      and organization_id = p_organization_id
    returning * into v_project;

    if v_project.launch_date is not null
      and v_project.delivery_date is not null
      and v_project.delivery_date < v_project.launch_date
    then
      raise exception using errcode = '22023', message = 'project-date-range-invalid';
    end if;

    v_after := to_jsonb(v_project);
  end if;

  insert into public.crm_project_events (
    organization_id,
    project_id,
    actor_id,
    operation,
    reason,
    changed_fields,
    idempotency_key,
    request_fingerprint,
    before_state,
    after_state
  )
  values (
    p_organization_id,
    v_project.id,
    v_actor_id,
    v_operation,
    v_reason,
    v_changed_fields,
    v_idempotency_key,
    v_fingerprint,
    v_before,
    v_after
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'project', v_after,
    'event_id', v_event_id,
    'replayed', false
  );
end;
$function$;

revoke all on function public.mutate_crm_project_v1(uuid, text, uuid, jsonb, text, text) from public;
revoke all on function public.mutate_crm_project_v1(uuid, text, uuid, jsonb, text, text) from anon;
grant execute on function public.mutate_crm_project_v1(uuid, text, uuid, jsonb, text, text) to authenticated;
grant execute on function public.mutate_crm_project_v1(uuid, text, uuid, jsonb, text, text) to service_role;

comment on function public.mutate_crm_project_v1(uuid, text, uuid, jsonb, text, text) is
  'Atomic, idempotent and audited project create/update command. Delete remains disabled.';

commit;

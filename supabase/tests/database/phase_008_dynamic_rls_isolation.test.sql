begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

do $fixture_contract$
declare
  v_org_a uuid;
  v_director_a uuid;
  v_manager_a uuid;
  v_broker_a uuid;
  v_lead_a uuid;
  v_org_b uuid;
  v_actor_b uuid;
  v_lead_b uuid;
begin
  if current_setting('app.atlas_rls_rehearsal_environment', true)
    is distinct from 'isolated_clone'
  then
    raise exception 'phase_008_isolated_clone_required';
  end if;

  select
    director.organization_id,
    director.id,
    manager.id,
    broker.id,
    lead.id
  into
    v_org_a,
    v_director_a,
    v_manager_a,
    v_broker_a,
    v_lead_a
  from public.profiles as director
  join public.profiles as manager
    on manager.organization_id = director.organization_id
   and manager.reports_to = director.id
   and manager.active is true
   and manager.commercial_role = 'manager'
  join public.profiles as broker
    on broker.organization_id = manager.organization_id
   and broker.reports_to = manager.id
   and broker.active is true
   and broker.commercial_role = 'broker'
  join public.leads as lead
    on lead.organization_id = broker.organization_id
   and lead.assigned_to = broker.id
  where director.active is true
    and director.commercial_role = 'director'
    and director.reports_to is null
  order by director.organization_id, director.id, manager.id, broker.id, lead.id
  limit 1;

  if v_org_a is null then
    raise exception 'phase_008_organization_a_fixture_contract_unsatisfied';
  end if;

  select
    profile.organization_id,
    profile.id,
    lead.id
  into
    v_org_b,
    v_actor_b,
    v_lead_b
  from public.profiles as profile
  join public.leads as lead
    on lead.organization_id = profile.organization_id
   and lead.assigned_to = profile.id
  where profile.active is true
    and profile.organization_id <> v_org_a
  order by profile.organization_id, profile.id, lead.id
  limit 1;

  if v_org_b is null then
    raise exception 'phase_008_organization_b_fixture_contract_unsatisfied';
  end if;

  perform set_config('app.atlas_phase_008_org_a', v_org_a::text, true);
  perform set_config('app.atlas_phase_008_director_a', v_director_a::text, true);
  perform set_config('app.atlas_phase_008_manager_a', v_manager_a::text, true);
  perform set_config('app.atlas_phase_008_broker_a', v_broker_a::text, true);
  perform set_config('app.atlas_phase_008_lead_a', v_lead_a::text, true);
  perform set_config('app.atlas_phase_008_org_b', v_org_b::text, true);
  perform set_config('app.atlas_phase_008_actor_b', v_actor_b::text, true);
  perform set_config('app.atlas_phase_008_lead_b', v_lead_b::text, true);
  perform set_config(
    'app.atlas_phase_008_profile_count_before',
    (select count(*)::text from public.profiles),
    true
  );
  perform set_config(
    'app.atlas_phase_008_lead_count_before',
    (select count(*)::text from public.leads),
    true
  );
end;
$fixture_contract$;

select pass('contrato de fixtures com duas organizações foi satisfeito');

select ok(
  not has_table_privilege('anon', 'public.profiles', 'select')
  and not has_table_privilege('anon', 'public.leads', 'select'),
  'anon não possui acesso direto aos dados comerciais'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'select')
  and has_table_privilege('authenticated', 'public.leads', 'select'),
  'authenticated alcança as tabelas somente para aplicação das policies'
);

select set_config(
  'request.jwt.claim.sub',
  current_setting('app.atlas_phase_008_broker_a'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('app.atlas_phase_008_broker_a'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::bigint
    from public.profiles
    where id = current_setting('app.atlas_phase_008_broker_a')::uuid
  ),
  1::bigint,
  'corretor enxerga o próprio perfil'
);
select is(
  (
    select count(*)::bigint
    from public.profiles
    where id in (
      current_setting('app.atlas_phase_008_manager_a')::uuid,
      current_setting('app.atlas_phase_008_director_a')::uuid
    )
  ),
  0::bigint,
  'corretor não enxerga sua liderança'
);
select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_a')::uuid
  ),
  1::bigint,
  'corretor enxerga a própria lead'
);
select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_b')::uuid
  ),
  0::bigint,
  'corretor não enxerga lead de outra organização'
);

select throws_ok(
  format(
    $sql$
      select public.create_lead_atomic(
        %L::uuid,
        null,
        %L::uuid,
        'Atlas Phase 008 denied fixture',
        null,
        null,
        'phase_008_rehearsal',
        null,
        null,
        null,
        null,
        array[]::text[],
        null,
        0,
        'frio',
        '{}'::jsonb
      )
    $sql$,
    current_setting('app.atlas_phase_008_org_a'),
    current_setting('app.atlas_phase_008_director_a')
  ),
  'P0001',
  'lead_create_forbidden',
  'RPC de lead rejeita owner diferente de auth.uid'
);

select throws_ok(
  format(
    $sql$
      select public.mutate_crm_project_v1(
        %L::uuid,
        'create',
        null,
        '{"name":"Atlas Phase 008 denied project"}'::jsonb,
        'Ensaio negativo cross-tenant da Fase 8',
        'phase-008-cross-tenant'
      )
    $sql$,
    current_setting('app.atlas_phase_008_org_b')
  ),
  '42501',
  'project-write-not-authorized',
  'RPC de projeto rejeita organização diferente da identidade atual'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  current_setting('app.atlas_phase_008_manager_a'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('app.atlas_phase_008_manager_a'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::bigint
    from public.profiles
    where id in (
      current_setting('app.atlas_phase_008_manager_a')::uuid,
      current_setting('app.atlas_phase_008_broker_a')::uuid
    )
  ),
  2::bigint,
  'gerente enxerga a si e o corretor descendente'
);
select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_a')::uuid
  ),
  1::bigint,
  'gerente enxerga a lead do corretor descendente'
);
select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_b')::uuid
  ),
  0::bigint,
  'gerente não enxerga lead de outra organização'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  current_setting('app.atlas_phase_008_director_a'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('app.atlas_phase_008_director_a'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::bigint
    from public.profiles
    where id in (
      current_setting('app.atlas_phase_008_director_a')::uuid,
      current_setting('app.atlas_phase_008_manager_a')::uuid,
      current_setting('app.atlas_phase_008_broker_a')::uuid
    )
  ),
  3::bigint,
  'diretor enxerga a cadeia comercial da própria organização'
);
select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_a')::uuid
  ),
  1::bigint,
  'diretor enxerga a lead da própria organização'
);
select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_b')::uuid
  ),
  0::bigint,
  'diretor não enxerga lead de outra organização'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  current_setting('app.atlas_phase_008_actor_b'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('app.atlas_phase_008_actor_b'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_b')::uuid
  ),
  1::bigint,
  'ator da organização B enxerga sua própria lead'
);
select is(
  (
    select count(*)::bigint
    from public.leads
    where id = current_setting('app.atlas_phase_008_lead_a')::uuid
  ),
  0::bigint,
  'ator da organização B não enxerga lead da organização A'
);

reset role;

select ok(
  to_regprocedure(
    'public.bulk_transfer_leads(uuid,uuid,uuid[],uuid,text)'
  ) is not null
  and not has_function_privilege(
    'authenticated',
    'public.bulk_transfer_leads(uuid,uuid,uuid[],uuid,text)',
    'execute'
  ),
  'transferência em massa permanece server-only'
);
select ok(
  to_regprocedure(
    'public.distribute_project_leads(uuid,uuid,uuid,integer)'
  ) is not null
  and not has_function_privilege(
    'authenticated',
    'public.distribute_project_leads(uuid,uuid,uuid,integer)',
    'execute'
  ),
  'distribuição de projeto permanece server-only'
);
select ok(
  (
    select count(*)::text
    from public.profiles
  ) = current_setting('app.atlas_phase_008_profile_count_before')
  and (
    select count(*)::text
    from public.leads
  ) = current_setting('app.atlas_phase_008_lead_count_before'),
  'ensaio não alterou as fixtures de referência'
);

select * from finish();
rollback;

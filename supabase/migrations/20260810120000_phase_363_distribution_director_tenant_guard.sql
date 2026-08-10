-- Phase 363: defense in depth for the commercial distribution command.
-- The HTTP route already requires a director; this guard also protects the
-- service-role-only RPC against future internal callers that bypass the route.

create or replace function public.distribute_project_leads_v4(
  p_actor_id uuid,
  p_organization_id uuid,
  p_development_id uuid,
  p_limit integer default 1,
  p_acceptance_minutes integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  assignment jsonb;
  reservation_id uuid;
  reservations jsonb := '[]'::jsonb;
  actor_role text;
begin
  select coalesce(
    nullif(lower(trim(p.commercial_role)), ''),
    case when lower(trim(p.role)) = 'admin' then 'director' else lower(trim(p.role)) end
  )
  into actor_role
  from public.profiles p
  where p.id = p_actor_id
    and p.organization_id = p_organization_id
    and coalesce(p.active, true) = true;

  if actor_role is distinct from 'director' then
    raise exception 'distribution_director_only';
  end if;

  if not exists (
    select 1
    from public.developments d
    where d.id = p_development_id
      and d.organization_id = p_organization_id
  ) then
    raise exception 'distribution_project_invalid';
  end if;

  if p_acceptance_minutes < 2 or p_acceptance_minutes > 30 then
    raise exception 'reservation_period_invalid';
  end if;

  result := public.distribute_project_leads_v3(
    p_actor_id,
    p_organization_id,
    p_development_id,
    p_limit
  );

  for assignment in
    select value
    from jsonb_array_elements(coalesce(result -> 'assignments', '[]'::jsonb))
  loop
    update public.lead_assignment_reservations
    set status = 'superseded',
        released_at = now(),
        release_reason = 'Nova atribuição substituiu a reserva.'
    where organization_id = p_organization_id
      and lead_id = (assignment ->> 'leadId')::uuid
      and status = 'pending';

    insert into public.lead_assignment_reservations(
      organization_id,
      lead_id,
      broker_id,
      expires_at
    )
    values (
      p_organization_id,
      (assignment ->> 'leadId')::uuid,
      (assignment ->> 'brokerId')::uuid,
      now() + make_interval(mins => p_acceptance_minutes)
    )
    returning id into reservation_id;

    reservations := reservations || jsonb_build_array(
      jsonb_build_object(
        'reservationId', reservation_id,
        'leadId', assignment ->> 'leadId',
        'brokerId', assignment ->> 'brokerId',
        'expiresInMinutes', p_acceptance_minutes
      )
    );
  end loop;

  return result || jsonb_build_object(
    'algorithm', 'sla_source_priority_reservation_v4',
    'reservations', reservations,
    'acceptanceMinutes', p_acceptance_minutes,
    'acceptanceRequired', true,
    'safeExpiry', true
  );
end;
$$;

revoke all on function public.distribute_project_leads_v4(uuid, uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.distribute_project_leads_v4(uuid, uuid, uuid, integer, integer)
  to service_role;

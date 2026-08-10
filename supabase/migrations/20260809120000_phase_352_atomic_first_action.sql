-- Phase 352: one confirmed commercial action updates the lead, creates the
-- next commitment and preserves the learning trail in a single transaction.

create or replace function public.record_lead_first_action(
  p_actor uuid,
  p_organization uuid,
  p_lead_id uuid,
  p_action_type text,
  p_outcome text,
  p_note text,
  p_next_action_title text,
  p_next_action_at timestamptz,
  p_idempotency_key text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_activity_id uuid := gen_random_uuid();
  v_task_id uuid := gen_random_uuid();
  v_existing_activity uuid;
  v_existing_task uuid;
  v_status text;
  v_assignee uuid;
  v_now timestamptz := coalesce(p_occurred_at, now());
begin
  if p_actor is null or p_organization is null or p_lead_id is null then
    raise exception 'first_action_identity_required';
  end if;
  if lower(coalesce(p_action_type, '')) not in ('call', 'whatsapp', 'email', 'meeting', 'visit', 'contact') then
    raise exception 'first_action_type_invalid';
  end if;
  if lower(coalesce(p_outcome, '')) not in ('contacted', 'no_response', 'meeting_scheduled', 'follow_up_needed', 'not_interested') then
    raise exception 'first_action_outcome_invalid';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 10
     or char_length(trim(coalesce(p_note, ''))) > 1000 then
    raise exception 'first_action_note_invalid';
  end if;
  if char_length(trim(coalesce(p_next_action_title, ''))) < 3
     or char_length(trim(coalesce(p_next_action_title, ''))) > 120 then
    raise exception 'first_action_next_title_invalid';
  end if;
  if p_next_action_at is null or p_next_action_at <= v_now then
    raise exception 'first_action_next_date_invalid';
  end if;
  if coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9._:-]{8,128}$' then
    raise exception 'first_action_idempotency_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization::text || ':' || p_lead_id::text || ':' || p_idempotency_key, 0)
  );

  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor
      and p.organization_id = p_organization
      and p.active is true
  ) then
    raise exception 'first_action_actor_invalid';
  end if;

  select * into v_lead
  from public.leads l
  where l.id = p_lead_id and l.organization_id = p_organization
  for update;
  if not found then raise exception 'first_action_lead_not_found'; end if;

  select a.id,
         nullif(a.metadata ->> 'taskId', '')::uuid
    into v_existing_activity, v_existing_task
  from public.activities a
  where a.organization_id = p_organization
    and a.lead_id = p_lead_id
    and a.metadata ->> 'idempotencyKey' = p_idempotency_key
  order by a.occurred_at desc
  limit 1;

  if v_existing_activity is not null then
    select l.status into v_status
    from public.leads l
    where l.id = p_lead_id and l.organization_id = p_organization;
    return jsonb_build_object(
      'replayed', true,
      'leadId', p_lead_id,
      'activityId', v_existing_activity,
      'taskId', v_existing_task,
      'status', coalesce(v_status, 'novo'),
      'nextActionAt', p_next_action_at,
      'firstActionRecorded', true
    );
  end if;

  select p.id into v_assignee
  from public.profiles p
  where p.id = v_lead.assigned_to
    and p.organization_id = p_organization
    and p.active is true;
  v_assignee := coalesce(v_assignee, p_actor);
  v_status := lower(coalesce(v_lead.status, 'novo'));
  if v_status in ('new', 'novo', 'novo_lead')
     and lower(p_outcome) in ('contacted', 'meeting_scheduled') then
    v_status := 'contato';
  end if;

  insert into public.activities (
    id, organization_id, lead_id, user_id, type, description, metadata, occurred_at
  ) values (
    v_activity_id,
    p_organization,
    p_lead_id,
    p_actor,
    lower(p_action_type),
    left(trim(p_note), 1000),
    jsonb_build_object(
      'title', 'Primeira ação comercial registrada',
      'outcome', lower(p_outcome),
      'idempotencyKey', p_idempotency_key,
      'taskId', v_task_id,
      'humanConfirmed', true,
      'source', 'atlas_leads_action_queue'
    ),
    v_now
  );

  insert into public.tasks (
    id, organization_id, title, description, due_date,
    priority, status, lead_id, user_id, metadata
  ) values (
    v_task_id,
    p_organization,
    left(trim(p_next_action_title), 120),
    'Próxima ação criada a partir do primeiro contato confirmado.',
    p_next_action_at,
    case when lower(p_outcome) = 'meeting_scheduled' then 'alta' else 'media' end,
    'pendente',
    p_lead_id,
    v_assignee,
    jsonb_build_object(
      'source', 'atlas_leads_action_queue',
      'activityId', v_activity_id,
      'idempotencyKey', p_idempotency_key,
      'humanConfirmed', true
    )
  );

  update public.leads
  set status = v_status,
      last_interaction_at = v_now,
      next_action_at = p_next_action_at,
      updated_at = now()
  where id = p_lead_id and organization_id = p_organization;

  insert into public.lead_events (
    organization_id, lead_id, created_by, event_type, type, description, metadata
  ) values (
    p_organization,
    p_lead_id,
    p_actor,
    'first_action_recorded',
    'first_action_recorded',
    left('Primeira ação: ' || trim(p_note), 4000),
    jsonb_build_object(
      'activityId', v_activity_id,
      'taskId', v_task_id,
      'actionType', lower(p_action_type),
      'outcome', lower(p_outcome),
      'nextActionAt', p_next_action_at,
      'idempotencyKey', p_idempotency_key,
      'humanConfirmed', true
    )
  );

  return jsonb_build_object(
    'replayed', false,
    'leadId', p_lead_id,
    'activityId', v_activity_id,
    'taskId', v_task_id,
    'status', v_status,
    'nextActionAt', p_next_action_at,
    'firstActionRecorded', true
  );
end;
$$;

revoke all on function public.record_lead_first_action(uuid, uuid, uuid, text, text, text, text, timestamptz, text, timestamptz) from public;
revoke all on function public.record_lead_first_action(uuid, uuid, uuid, text, text, text, text, timestamptz, text, timestamptz) from anon;
revoke all on function public.record_lead_first_action(uuid, uuid, uuid, text, text, text, text, timestamptz, text, timestamptz) from authenticated;
grant execute on function public.record_lead_first_action(uuid, uuid, uuid, text, text, text, text, timestamptz, text, timestamptz) to service_role;

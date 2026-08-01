begin;

create or replace function public.append_lead_copilot_interaction(
  p_organization_id uuid,
  p_lead_id uuid,
  p_broker_id uuid,
  p_question text,
  p_answer text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_memory jsonb;
  recent_memory jsonb;
begin
  select lc.memory
    into current_memory
    from public.lead_copilots lc
    join public.leads l
      on l.id = lc.lead_id
     and l.organization_id = lc.organization_id
   where lc.organization_id = p_organization_id
     and lc.lead_id = p_lead_id
     and lc.broker_id = p_broker_id
     and l.assigned_to = p_broker_id
   for update of lc;

  if not found then
    raise exception 'Copiloto não corresponde ao corretor atual da lead.';
  end if;

  recent_memory := case
    when jsonb_typeof(current_memory -> 'recent') = 'array' then current_memory -> 'recent'
    else '[]'::jsonb
  end;
  recent_memory := coalesce(
    (select jsonb_agg(item order by ordinal)
       from jsonb_array_elements(recent_memory) with ordinality as entries(item, ordinal)
      where ordinal > greatest(jsonb_array_length(recent_memory) - 7, 0)),
    '[]'::jsonb
  );
  recent_memory := recent_memory || jsonb_build_array(jsonb_build_object(
    'at', now(),
    'question', left(coalesce(p_question, ''), 500),
    'answer', left(coalesce(p_answer, ''), 1500),
    'brokerId', p_broker_id
  ));

  update public.lead_copilots
     set memory = coalesce(current_memory, '{}'::jsonb) || jsonb_build_object('recent', recent_memory),
         interaction_count = interaction_count + 1,
         last_interaction_at = now(),
         updated_at = now()
   where organization_id = p_organization_id
     and lead_id = p_lead_id
     and broker_id = p_broker_id;
end;
$$;

revoke all on function public.append_lead_copilot_interaction(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.append_lead_copilot_interaction(uuid, uuid, uuid, text, text) to service_role;

commit;

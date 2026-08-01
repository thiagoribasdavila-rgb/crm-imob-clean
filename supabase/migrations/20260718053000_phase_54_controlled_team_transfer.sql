begin;
create or replace function public.transfer_leads_to_team(p_actor_id uuid,p_organization_id uuid,p_lead_ids uuid[],p_target_manager_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;requested integer;accessible integer;batch_id uuid;lead_row record;target_broker uuid;target_load integer;target_weight integer;transferred integer:=0;assignments jsonb:='[]'::jsonb;
begin
 requested:=coalesce(array_length(p_lead_ids,1),0);if requested<1 or requested>200 then raise exception 'team_transfer_limit_invalid';end if;if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'team_transfer_reason_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 if actor_role not in('director','superintendent') then raise exception 'team_transfer_actor_forbidden';end if;
 if not exists(select 1 from public.profiles where id=p_target_manager_id and organization_id=p_organization_id and active=true and coalesce(commercial_role,role)='manager') then raise exception 'team_transfer_manager_invalid';end if;
 if actor_role='superintendent' and not exists(select 1 from public.profiles where id=p_target_manager_id and organization_id=p_organization_id and reports_to=p_actor_id and active=true) then raise exception 'team_transfer_manager_out_of_scope';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_target_manager_id::text,0));
 perform 1 from public.leads where organization_id=p_organization_id and id=any(p_lead_ids) order by id for update;
 with recursive descendants as(select id from public.profiles where id=p_actor_id and organization_id=p_organization_id union all select p.id from public.profiles p join descendants d on p.reports_to=d.id where p.organization_id=p_organization_id and p.active=true)select count(*) into accessible from public.leads l where l.organization_id=p_organization_id and l.id=any(p_lead_ids) and(actor_role='director' or l.assigned_to in(select id from descendants));if accessible<>requested then raise exception 'team_transfer_lead_out_of_scope';end if;
 insert into public.lead_transfer_batches(organization_id,actor_id,target_owner_id,lead_count,reason)values(p_organization_id,p_actor_id,p_target_manager_id,requested,trim(p_reason))returning id into batch_id;
 for lead_row in select id,assigned_to,development_id from public.leads where organization_id=p_organization_id and id=any(p_lead_ids) order by id loop
  select p.id,count(l.id)::integer,coalesce(m.weight,1) into target_broker,target_load,target_weight from public.profiles p left join public.project_distribution_members m on m.profile_id=p.id and m.development_id=lead_row.development_id left join public.leads l on l.organization_id=p_organization_id and l.assigned_to=p.id and l.development_id is not distinct from lead_row.development_id where p.organization_id=p_organization_id and p.reports_to=p_target_manager_id and p.active=true and coalesce(p.commercial_role,p.role)='broker' and coalesce(m.enabled,true) group by p.id,m.weight,m.last_assigned_at order by(count(l.id)::numeric/coalesce(m.weight,1)),m.last_assigned_at nulls first,p.id limit 1;
  if target_broker is null then raise exception 'team_transfer_no_eligible_broker';end if;
  insert into public.lead_transfer_items(batch_id,lead_id,previous_owner_id,target_owner_id)values(batch_id,lead_row.id,lead_row.assigned_to,target_broker);
  update public.leads set assigned_to=target_broker,updated_at=now() where id=lead_row.id and organization_id=p_organization_id;
  update public.tasks set assigned_to=target_broker where organization_id=p_organization_id and lead_id=lead_row.id and coalesce(status,'pendente') not in('concluida','completed','cancelado','cancelled');
  insert into public.activities(organization_id,lead_id,user_id,title,description,type,occurred_at)values(p_organization_id,lead_row.id,p_actor_id,'Lead transferida entre equipes',left(trim(p_reason),500),'system',now());
  insert into public.project_distribution_members(organization_id,development_id,profile_id,assignments_count,last_assigned_at,updated_at)select p_organization_id,lead_row.development_id,target_broker,1,now(),now() where lead_row.development_id is not null on conflict(development_id,profile_id)do update set assignments_count=public.project_distribution_members.assignments_count+1,last_assigned_at=excluded.last_assigned_at,updated_at=excluded.updated_at;
  assignments:=assignments||jsonb_build_array(jsonb_build_object('leadId',lead_row.id,'brokerId',target_broker,'projectId',lead_row.development_id,'projectLoadBefore',target_load,'weight',target_weight,'reason','Menor carga ponderada no projeto dentro da equipe escolhida.'));transferred:=transferred+1;
 end loop;
 return jsonb_build_object('batchId',batch_id,'transferred',transferred,'teamTargetId',p_target_manager_id,'assignments',assignments,'managerOwnsLeads',false,'singleBrokerOwner',true,'openTasksRealigned',true,'auditable',true);
end $$;
revoke all on function public.transfer_leads_to_team(uuid,uuid,uuid[],uuid,text) from public,anon,authenticated;grant execute on function public.transfer_leads_to_team(uuid,uuid,uuid[],uuid,text) to service_role;
commit;

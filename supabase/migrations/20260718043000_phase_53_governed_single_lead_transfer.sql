begin;
create or replace function public.transfer_single_lead(p_actor_id uuid,p_organization_id uuid,p_lead_id uuid,p_expected_owner_id uuid,p_target_owner_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;target_role text;lead_row public.leads%rowtype;batch_id uuid;
begin
 if char_length(trim(coalesce(p_reason,'')))<10 or char_length(trim(p_reason))>500 then raise exception 'transfer_reason_invalid';end if;
 select coalesce(commercial_role,case role when 'admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
 select coalesce(commercial_role,role) into target_role from public.profiles where id=p_target_owner_id and organization_id=p_organization_id and active=true;
 if actor_role not in('director','superintendent','manager') or target_role<>'broker' then raise exception 'transfer_role_forbidden';end if;
 select * into lead_row from public.leads where id=p_lead_id and organization_id=p_organization_id for update;if lead_row.id is null then raise exception 'transfer_lead_not_found';end if;
 if lead_row.assigned_to is distinct from p_expected_owner_id then raise exception 'transfer_owner_conflict';end if;if lead_row.assigned_to=p_target_owner_id then raise exception 'transfer_same_owner';end if;
 if actor_role<>'director' and not exists(with recursive descendants as(select id from public.profiles where id=p_actor_id and organization_id=p_organization_id union all select p.id from public.profiles p join descendants d on p.reports_to=d.id where p.organization_id=p_organization_id and p.active=true)select 1 where p_target_owner_id in(select id from descendants) and lead_row.assigned_to in(select id from descendants)) then raise exception 'transfer_hierarchy_forbidden';end if;
 if actor_role='manager' and not exists(select 1 from public.profiles where id=p_target_owner_id and organization_id=p_organization_id and reports_to=p_actor_id and active=true) then raise exception 'transfer_direct_team_required';end if;
 insert into public.lead_transfer_batches(organization_id,actor_id,target_owner_id,lead_count,reason)values(p_organization_id,p_actor_id,p_target_owner_id,1,trim(p_reason))returning id into batch_id;
 insert into public.lead_transfer_items(batch_id,lead_id,previous_owner_id,target_owner_id)values(batch_id,p_lead_id,lead_row.assigned_to,p_target_owner_id);
 update public.leads set assigned_to=p_target_owner_id,updated_at=now() where id=p_lead_id and organization_id=p_organization_id and assigned_to is not distinct from p_expected_owner_id;
 update public.tasks set assigned_to=p_target_owner_id where organization_id=p_organization_id and lead_id=p_lead_id and status not in('concluida','completed','cancelado','cancelled');
 insert into public.activities(organization_id,lead_id,user_id,title,description,type,occurred_at)values(p_organization_id,p_lead_id,p_actor_id,'Responsável transferido',left(trim(p_reason),500),'system',now());
 return jsonb_build_object('batchId',batch_id,'leadId',p_lead_id,'previousOwnerId',lead_row.assigned_to,'targetOwnerId',p_target_owner_id,'singleOwnerPreserved',true,'openTasksRealigned',true,'auditable',true);
end $$;
revoke all on function public.transfer_single_lead(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;grant execute on function public.transfer_single_lead(uuid,uuid,uuid,uuid,uuid,text) to service_role;
commit;

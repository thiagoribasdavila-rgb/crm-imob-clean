begin;
create or replace function public.register_external_buyer_profile(p_actor_id uuid,p_organization_id uuid,p_lead_id uuid,p_reason text,p_external_company text,p_external_project text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_role text; current_lead public.leads%rowtype; record_id uuid;
begin
  if char_length(trim(coalesce(p_reason,''))) < 10 then raise exception 'external_buyer_reason_required'; end if;
  select coalesce(commercial_role,case when role='admin' then 'director' else role end) into actor_role from public.profiles where id=p_actor_id and organization_id=p_organization_id and active=true;
  if actor_role not in ('director','superintendent','manager') then raise exception 'external_buyer_forbidden'; end if;
  select * into current_lead from public.leads where id=p_lead_id and organization_id=p_organization_id for update;
  if current_lead.id is null or current_lead.assigned_to is null then raise exception 'external_buyer_lead_invalid'; end if;
  if actor_role='manager' and not exists(select 1 from public.profiles where id=current_lead.assigned_to and organization_id=p_organization_id and reports_to=p_actor_id and active=true) then raise exception 'external_buyer_out_of_scope'; end if;
  update public.leads set status='comprou_outro',notes=left(trim(p_reason),4000),updated_at=now() where id=current_lead.id;
  select id into record_id from public.external_sales_records where lead_id=current_lead.id;
  update public.external_sales_records set external_company=nullif(left(trim(coalesce(p_external_company,'')),160),''),external_project=nullif(left(trim(coalesce(p_external_project,'')),160),''),reason_summary=left(trim(p_reason),4000),evidence_status='declared',estimated_value=null,director_notes=null,reviewed_by=null,reviewed_at=null,updated_at=now() where id=record_id;
  return jsonb_build_object('recordId',record_id,'leadId',current_lead.id,'status','comprou_outro','revenueImpact',0,'financialReviewRole','director');
end; $$;
revoke all on function public.register_external_buyer_profile(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_external_buyer_profile(uuid,uuid,uuid,text,text,text) to service_role;
commit;

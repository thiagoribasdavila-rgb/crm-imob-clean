-- Fase 25: cadastro deduplicado de lead, inclusive sob requisições concorrentes.
create or replace function public.create_lead_atomic(
  p_organization_id uuid,
  p_development_id uuid,
  p_assigned_to uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_source text,
  p_purpose text,
  p_budget_min numeric,
  p_budget_max numeric,
  p_bedrooms integer,
  p_preferred_regions text[],
  p_notes text,
  p_score integer,
  p_temperature text,
  p_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  normalized_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  duplicate_id uuid;
  created public.leads;
begin
  if auth.uid() is null or p_organization_id <> public.current_organization_id() or p_assigned_to <> auth.uid() then raise exception 'lead_create_forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || coalesce(normalized_phone, '') || ':' || coalesce(normalized_email, ''), 0));
  if normalized_phone is not null and exists(select 1 from public.contact_quality_suppressions where organization_id=p_organization_id and channel='whatsapp' and normalized_contact=normalized_phone and active) then raise exception 'invalid_phone_suppressed'; end if;
  select id into duplicate_id from public.leads where organization_id=p_organization_id and ((normalized_phone is not null and phone_normalized=normalized_phone) or (normalized_email is not null and lower(email)=normalized_email)) order by created_at limit 1;
  if duplicate_id is not null then return jsonb_build_object('status','duplicate','leadId',duplicate_id); end if;
  insert into public.leads(organization_id,development_id,assigned_to,name,email,phone,source,purpose,budget_min,budget_max,bedrooms,preferred_regions,notes,status,score,temperature,metadata)
  values(p_organization_id,p_development_id,p_assigned_to,trim(p_name),normalized_email,normalized_phone,trim(p_source),p_purpose,p_budget_min,p_budget_max,p_bedrooms,coalesce(p_preferred_regions,'{}'),p_notes,'novo',p_score,p_temperature,coalesce(p_metadata,'{}')) returning * into created;
  return jsonb_build_object('status','created','leadId',created.id,'name',created.name,'score',created.score,'temperature',created.temperature);
end $$;
revoke all on function public.create_lead_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,numeric,integer,text[],text,integer,text,jsonb) from public, anon;
grant execute on function public.create_lead_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,numeric,integer,text[],text,integer,text,jsonb) to authenticated;

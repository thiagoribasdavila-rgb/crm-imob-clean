begin;

create or replace function public.version_project_material(
  p_organization_id uuid,
  p_development_id uuid,
  p_uploaded_by uuid,
  p_material_type text,
  p_title text,
  p_description text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_valid_from date,
  p_valid_until date
) returns public.project_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_version integer;
  created_material public.project_materials;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_uploaded_by and organization_id = p_organization_id and active = true
      and (role = 'admin' or commercial_role in ('director', 'superintendent', 'manager'))
  ) then raise exception 'material_upload_forbidden'; end if;
  if not exists (select 1 from public.developments where id = p_development_id and organization_id = p_organization_id) then
    raise exception 'material_development_invalid';
  end if;
  if p_material_type not in ('book', 'price_table', 'sales_mirror', 'floor_plan', 'presentation', 'other')
     or p_storage_path not like p_organization_id::text || '/' || p_development_id::text || '/%'
     or p_file_size <= 0 then raise exception 'material_payload_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_development_id::text || ':' || p_material_type, 0));
  select coalesce(max(version), 0) + 1 into next_version
  from public.project_materials where development_id = p_development_id and material_type = p_material_type;

  update public.project_materials set is_current = false, updated_at = now()
  where development_id = p_development_id and material_type = p_material_type and is_current = true;

  insert into public.project_materials (
    organization_id, development_id, material_type, title, description, storage_path,
    file_name, mime_type, file_size, version, valid_from, valid_until, is_current, uploaded_by
  ) values (
    p_organization_id, p_development_id, p_material_type, trim(p_title), nullif(trim(p_description), ''), p_storage_path,
    p_file_name, p_mime_type, p_file_size, next_version, p_valid_from, p_valid_until, true, p_uploaded_by
  ) returning * into created_material;
  return created_material;
end;
$$;

revoke all on function public.version_project_material(uuid, uuid, uuid, text, text, text, text, text, text, bigint, date, date) from public, anon, authenticated;
grant execute on function public.version_project_material(uuid, uuid, uuid, text, text, text, text, text, text, bigint, date, date) to service_role;

commit;

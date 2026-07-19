begin;

alter table public.project_materials
  add column if not exists storage_provider text not null default 'supabase' check (storage_provider in ('supabase','s3')),
  add column if not exists content_sha256 text,
  add column if not exists migrated_at timestamptz;

create index if not exists project_materials_provider_idx
  on public.project_materials (organization_id, storage_provider, created_at);

create table if not exists public.project_material_migrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  material_id uuid not null references public.project_materials(id) on delete cascade,
  source_provider text not null check (source_provider in ('supabase','s3')),
  target_provider text not null check (target_provider in ('supabase','s3')),
  source_bucket text not null,
  source_path text not null,
  target_bucket text not null,
  target_path text not null,
  content_sha256 text not null,
  status text not null check (status in ('verified','failed','rolled_back')),
  error_message text,
  created_at timestamptz not null default now(),
  unique (material_id, target_provider, target_bucket, target_path)
);

alter table public.project_material_migrations enable row level security;
create policy project_material_migrations_director_read on public.project_material_migrations
for select to authenticated using (
  organization_id = (select public.current_organization_id())
  and exists (select 1 from public.profiles where id = (select auth.uid()) and active = true and (role = 'admin' or commercial_role = 'director'))
);
revoke insert, update, delete on public.project_material_migrations from anon, authenticated;
grant select on public.project_material_migrations to authenticated;

create or replace function public.version_project_material_cloud(
  p_organization_id uuid, p_development_id uuid, p_uploaded_by uuid,
  p_material_type text, p_title text, p_description text,
  p_storage_provider text, p_storage_bucket text, p_storage_path text,
  p_file_name text, p_mime_type text, p_file_size bigint, p_content_sha256 text,
  p_valid_from date, p_valid_until date
) returns public.project_materials language plpgsql security definer set search_path = public, pg_temp as $$
declare next_version integer; created_material public.project_materials;
begin
  if not exists (select 1 from public.profiles where id = p_uploaded_by and organization_id = p_organization_id and active = true and (role = 'admin' or commercial_role in ('director','superintendent','manager'))) then raise exception 'material_upload_forbidden'; end if;
  if not exists (select 1 from public.developments where id = p_development_id and organization_id = p_organization_id) then raise exception 'material_development_invalid'; end if;
  if p_material_type not in ('book','price_table','sales_mirror','floor_plan','presentation','other') or p_storage_provider not in ('supabase','s3') or p_storage_path not like p_organization_id::text || '/' || p_development_id::text || '/%' or p_file_size <= 0 or p_content_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'material_payload_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_development_id::text || ':' || p_material_type, 0));
  select coalesce(max(version), 0) + 1 into next_version from public.project_materials where development_id = p_development_id and material_type = p_material_type;
  update public.project_materials set is_current = false, updated_at = now() where development_id = p_development_id and material_type = p_material_type and is_current = true;
  insert into public.project_materials (organization_id,development_id,material_type,title,description,storage_provider,storage_bucket,storage_path,file_name,mime_type,file_size,content_sha256,version,valid_from,valid_until,is_current,uploaded_by)
  values (p_organization_id,p_development_id,p_material_type,trim(p_title),nullif(trim(p_description),''),p_storage_provider,p_storage_bucket,p_storage_path,p_file_name,p_mime_type,p_file_size,p_content_sha256,next_version,p_valid_from,p_valid_until,true,p_uploaded_by)
  returning * into created_material;
  return created_material;
end $$;

revoke all on function public.version_project_material_cloud(uuid,uuid,uuid,text,text,text,text,text,text,text,text,bigint,text,date,date) from public, anon, authenticated;
grant execute on function public.version_project_material_cloud(uuid,uuid,uuid,text,text,text,text,text,text,text,text,bigint,text,date,date) to service_role;

create or replace function public.finalize_project_material_migration(
  p_organization_id uuid, p_material_id uuid, p_target_bucket text, p_target_path text, p_content_sha256 text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare material public.project_materials;
begin
  select * into material from public.project_materials where id = p_material_id and organization_id = p_organization_id for update;
  if material.id is null or material.storage_provider <> 'supabase' or p_content_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'material_migration_invalid'; end if;
  insert into public.project_material_migrations (organization_id,material_id,source_provider,target_provider,source_bucket,source_path,target_bucket,target_path,content_sha256,status)
  values (p_organization_id,p_material_id,material.storage_provider,'s3',material.storage_bucket,material.storage_path,p_target_bucket,p_target_path,p_content_sha256,'verified')
  on conflict (material_id,target_provider,target_bucket,target_path) do update set content_sha256 = excluded.content_sha256, status = 'verified', error_message = null, created_at = now();
  update public.project_materials set storage_provider = 's3', storage_bucket = p_target_bucket, storage_path = p_target_path, content_sha256 = p_content_sha256, migrated_at = now(), updated_at = now() where id = p_material_id;
end $$;

revoke all on function public.finalize_project_material_migration(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_project_material_migration(uuid,uuid,text,text,text) to service_role;

commit;

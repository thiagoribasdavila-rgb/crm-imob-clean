begin;

create table if not exists public.project_materials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  development_id uuid not null references public.developments(id) on delete cascade,
  material_type text not null check (material_type in ('book', 'price_table', 'sales_mirror', 'floor_plan', 'presentation', 'other')),
  title text not null check (char_length(title) between 2 and 160),
  description text,
  storage_bucket text not null default 'project-materials',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  version integer not null default 1 check (version > 0),
  valid_from date,
  valid_until date,
  is_current boolean not null default true,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_materials_validity_check check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint project_materials_storage_unique unique (storage_bucket, storage_path)
);

create unique index if not exists project_materials_current_version_idx
  on public.project_materials (development_id, material_type)
  where is_current = true;
create index if not exists project_materials_org_development_idx
  on public.project_materials (organization_id, development_id, created_at desc);
create index if not exists project_materials_search_idx
  on public.project_materials using gin (to_tsvector('portuguese', title || ' ' || coalesce(description, '')));

alter table public.project_materials enable row level security;

drop policy if exists project_materials_select_org on public.project_materials;
create policy project_materials_select_org on public.project_materials
for select to authenticated
using (organization_id = (select public.current_organization_id()));

revoke insert, update, delete on public.project_materials from anon, authenticated;
grant select on public.project_materials to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-materials',
  'project-materials',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists project_materials_storage_select on storage.objects;
create policy project_materials_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'project-materials'
  and exists (
    select 1
    from public.project_materials material
    where material.storage_path = name
      and material.organization_id = (select public.current_organization_id())
  )
);

commit;

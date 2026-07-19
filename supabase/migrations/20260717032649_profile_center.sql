begin;

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists phone text,
  add column if not exists creci text,
  add column if not exists bio text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_insert_own on storage.objects;
create policy profile_avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists profile_avatars_select_own on storage.objects;
create policy profile_avatars_select_own on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars' and owner_id = (select auth.uid())::text);

drop policy if exists profile_avatars_update_own on storage.objects;
create policy profile_avatars_update_own on storage.objects for update to authenticated
using (bucket_id = 'profile-avatars' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists profile_avatars_delete_own on storage.objects;
create policy profile_avatars_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and owner_id = (select auth.uid())::text);

commit;

grant execute on function public.handle_new_auth_user() to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select, insert, update on public.organizations to supabase_auth_admin;
grant select, insert, update on public.profiles to supabase_auth_admin;
grant insert on public.user_provisioning_failures to supabase_auth_admin;

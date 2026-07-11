drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_auth_user();
drop function if exists public.reconcile_auth_profiles();
drop table if exists public.user_provisioning_failures;

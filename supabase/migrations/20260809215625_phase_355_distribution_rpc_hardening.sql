begin;

-- The v5 queue function is a server-side operational primitive. It accepts
-- the actor identifier explicitly and therefore must never be exposed through
-- PostgREST to anonymous or authenticated browser clients.
do $$
begin
  if to_regprocedure(
    'public.distribute_project_leads_v5(uuid,uuid,uuid,integer,integer)'
  ) is not null then
    execute 'revoke all on function public.distribute_project_leads_v5(uuid,uuid,uuid,integer,integer) from public, anon, authenticated';
    execute 'grant execute on function public.distribute_project_leads_v5(uuid,uuid,uuid,integer,integer) to service_role';
  end if;
end;
$$;

commit;

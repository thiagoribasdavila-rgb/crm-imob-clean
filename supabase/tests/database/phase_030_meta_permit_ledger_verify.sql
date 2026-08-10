-- ATLAS AI OS - Fase 30/100
-- Verifica apenas estrutura, indices, RLS e privilegios. Nao cria reserva de permissao.

do $phase30_verify$
declare
  v_function regprocedure := to_regprocedure(
    'public.atlas_prepare_meta_permit_reservation_v1(uuid,uuid,text,smallint,integer,integer,timestamp with time zone,text,text,text,text,text,text,text,text,text)'
  );
begin
  if current_setting('app.atlas_phase30_environment', true) is distinct from 'local_ephemeral' then
    raise exception 'phase30_local_ephemeral_only';
  end if;
  if to_regclass('atlas_private.meta_permit_ledger') is null
    or to_regclass('atlas_private.meta_permit_ledger_audit') is null
  then
    raise exception 'phase30_ledger_objects_missing';
  end if;
  if v_function is null then
    raise exception 'phase30_ledger_function_missing';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'atlas_private' and c.relname = 'meta_permit_ledger'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'phase30_ledger_rls_not_forced';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'atlas_private' and c.relname = 'meta_permit_ledger_audit'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'phase30_audit_rls_not_forced';
  end if;
  if has_table_privilege('anon', 'atlas_private.meta_permit_ledger', 'select')
    or has_table_privilege('authenticated', 'atlas_private.meta_permit_ledger', 'select')
  then
    raise exception 'phase30_public_ledger_access_detected';
  end if;
  if not has_table_privilege('service_role', 'atlas_private.meta_permit_ledger', 'select,insert,update') then
    raise exception 'phase30_service_role_table_access_missing';
  end if;
  if has_function_privilege('anon', v_function, 'execute')
    or has_function_privilege('authenticated', v_function, 'execute')
  then
    raise exception 'phase30_public_function_access_detected';
  end if;
  if not has_function_privilege('service_role', v_function, 'execute') then
    raise exception 'phase30_service_role_function_access_missing';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'atlas_private'
      and indexname in (
        'meta_permit_ledger_active_idx',
        'meta_permit_ledger_actor_idx',
        'meta_permit_ledger_audit_timeline_idx',
        'meta_permit_ledger_audit_ledger_idx',
        'meta_permit_ledger_audit_actor_idx'
      )
    group by schemaname having count(*) = 5
  ) then
    raise exception 'phase30_required_indexes_missing';
  end if;
  if exists (select 1 from atlas_private.meta_permit_ledger)
    or exists (select 1 from atlas_private.meta_permit_ledger_audit)
  then
    raise exception 'phase30_unexpected_permit_record';
  end if;
end;
$phase30_verify$;

-- ATLAS AI OS - Fase 32/100
-- Verifica compatibilidade PG17 em banco local novo. Nao cria ou reserva permissao.

do $phase32_pg17_verify$
declare
  v_server_version integer := current_setting('server_version_num')::integer;
begin
  if current_setting('app.atlas_phase32_environment', true) is distinct from 'local_ephemeral_pg17' then
    raise exception 'phase32_local_pg17_only';
  end if;
  if v_server_version < 170000 or v_server_version >= 180000 then
    raise exception 'phase32_postgres_17_required';
  end if;
  if current_user is distinct from 'postgres' then
    raise exception 'phase32_postgres_owner_context_required';
  end if;
  if exists (
    select 1
    from pg_extension
    where extname in ('timescaledb', 'plv8', 'plcoffee', 'plls')
  ) then
    raise exception 'phase32_incompatible_extension_detected';
  end if;
  if to_regclass('atlas_private.meta_permit_ledger') is null
    or to_regclass('atlas_private.meta_permit_ledger_audit') is null
  then
    raise exception 'phase32_pg17_ledger_objects_missing';
  end if;
  if exists (select 1 from atlas_private.meta_permit_ledger)
    or exists (select 1 from atlas_private.meta_permit_ledger_audit)
  then
    raise exception 'phase32_unexpected_permit_record';
  end if;
end;
$phase32_pg17_verify$;

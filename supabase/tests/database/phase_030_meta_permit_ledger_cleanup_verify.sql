do $phase30_cleanup_verify$
begin
  if current_setting('app.atlas_phase30_environment', true) is distinct from 'local_ephemeral' then
    raise exception 'phase30_local_ephemeral_only';
  end if;
  if to_regclass('atlas_private.meta_permit_ledger') is not null
    or to_regclass('atlas_private.meta_permit_ledger_audit') is not null
    or to_regprocedure('public.atlas_prepare_meta_permit_reservation_v1(uuid,uuid,text,smallint,integer,integer,timestamp with time zone,text,text,text,text,text,text,text,text,text)') is not null
  then
    raise exception 'phase30_rollback_incomplete';
  end if;
end;
$phase30_cleanup_verify$;

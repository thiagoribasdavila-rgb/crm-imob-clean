-- ATLAS AI OS - Fase 28/100
-- ROLLBACK DE RASCUNHO. NAO EXECUTAR. RECUSA REMOCAO SE O LEDGER POSSUIR REGISTROS.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $atlas_meta_ledger_rollback_guard$
begin
  if current_setting('app.atlas_meta_ledger_environment', true) is distinct from 'staging_clone' then
    raise exception 'atlas_meta_ledger_rollback_staging_clone_only';
  end if;
  if to_regclass('atlas_private.meta_permit_ledger') is not null
    and exists (select 1 from atlas_private.meta_permit_ledger limit 1)
  then
    raise exception 'atlas_meta_ledger_rollback_refuses_non_empty_ledger';
  end if;
end;
$atlas_meta_ledger_rollback_guard$;

drop function if exists public.atlas_prepare_meta_permit_reservation_v1(uuid, uuid, text, smallint, integer, integer, timestamptz, text, text, text, text, text, text, text, text, text);
drop table if exists atlas_private.meta_permit_ledger_audit;
drop table if exists atlas_private.meta_permit_ledger;
drop function if exists atlas_private.all_distinct_text(text[]);

-- O schema atlas_private pode conter outros ativos e nunca e removido por este rollback.

commit;
